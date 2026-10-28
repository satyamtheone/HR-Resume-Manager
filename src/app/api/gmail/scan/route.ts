import { NextResponse } from "next/server";
import { accessToken, readSession, saveSession } from "@/lib/gmail/session";

type Part = {
  filename?: string;
  mimeType?: string;
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: Part[];
};
type Message = {
  id: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: Part[];
    body?: Part["body"];
  };
  internalDate?: string;
};
const MAX_ATTACHMENT = 10 * 1024 * 1024;
const encoder = new TextEncoder();
function flatten(part: Part | undefined): Part[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flatten)];
}
function eventChunk(name: string, data: unknown) {
  return encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session)
    return NextResponse.json(
      { error: "Connect Gmail before scanning." },
      { status: 401 }
    );
  let body: { startDate?: string; endDate?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid scan range." }, { status: 400 });
  }
  const { startDate, endDate } = body;
  if (
    !startDate ||
    !endDate ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    startDate > endDate ||
    !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`)) ||
    !Number.isFinite(Date.parse(`${endDate}T00:00:00Z`))
  )
    return NextResponse.json(
      { error: "Choose a valid date range." },
      { status: 400 }
    );
  const rangeDays =
    (Date.parse(`${endDate}T00:00:00Z`) -
      Date.parse(`${startDate}T00:00:00Z`)) /
    86400000;
  if (rangeDays > 366)
    return NextResponse.json(
      { error: "Choose a date range of one year or less." },
      { status: 400 }
    );
  let authorized;
  try {
    authorized = await accessToken(session);
    if (authorized !== session) await saveSession(authorized);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Gmail authorization failed.",
      },
      { status: 401 }
    );
  }
  const query = `after:${startDate.replaceAll("-", "/")} before:${new Date(
    Date.parse(`${endDate}T00:00:00Z`) + 86400000
  )
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "/")} has:attachment`;
  let resumeStream: (() => void) | null = null,
    wasCancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = async (name: string, data: unknown) => {
        if (wasCancelled || request.signal.aborted) return;
        controller.enqueue(eventChunk(name, data));
        if (controller.desiredSize !== null && controller.desiredSize <= 0)
          await new Promise<void>((resolve) => {
            resumeStream = resolve;
          });
      };
      void (async () => {
        let emailsScanned = 0,
          documentsFound = 0,
          failedEmails = 0,
          skippedAttachments = 0,
          totalEmailsEstimate = 0,
          pageToken: string | undefined;
        try {
          do {
            const url = new URL(
              "https://gmail.googleapis.com/gmail/v1/users/me/messages"
            );
            url.searchParams.set("q", query);
            url.searchParams.set("maxResults", "100");
            if (pageToken) url.searchParams.set("pageToken", pageToken);
            const response = await fetch(url, {
              headers: { authorization: `Bearer ${authorized.accessToken}` },
              signal: request.signal,
              cache: "no-store",
            });
            if (!response.ok)
              throw new Error("Gmail could not search this mailbox.");
            const listing = (await response.json()) as {
              messages?: Array<{ id: string }>;
              resultSizeEstimate?: number;
              nextPageToken?: string;
            };
            const messages = listing.messages ?? [];
            if (!pageToken) {
              totalEmailsEstimate =
                listing.resultSizeEstimate ?? messages.length;
              await emit("start", { totalEmailsEstimate });
            }
            for (const item of messages) {
              if (wasCancelled || request.signal.aborted) return;
              const messageResponse = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                  item.id
                )}?format=full`,
                {
                  headers: {
                    authorization: `Bearer ${authorized.accessToken}`,
                  },
                  signal: request.signal,
                  cache: "no-store",
                }
              );
              if (!messageResponse.ok) {
                failedEmails++;
                emailsScanned++;
                await emit("progress", {
                  emailsScanned,
                  totalEmailsEstimate,
                  documentsFound,
                  failedEmails,
                  skippedAttachments,
                });
                continue;
              }
              const message = (await messageResponse.json()) as Message,
                headers = message.payload?.headers ?? [],
                header = (name: string) =>
                  headers.find(
                    (h) => h.name.toLowerCase() === name.toLowerCase()
                  )?.value ?? "";
              emailsScanned++;
              await emit("progress", {
                emailsScanned,
                totalEmailsEstimate,
                documentsFound,
                failedEmails,
                skippedAttachments,
              });
              for (const part of flatten({
                parts: message.payload?.parts,
                body: message.payload?.body,
              })) {
                const filename = part.filename ?? "";
                if (!filename) continue;
                const mimeType = part.mimeType ?? "";
                const isSupported = /\.(pdf|docx)$/i.test(filename);
                const isDocumentLike = /\.(pdf|docx?|docm|odt|rtf|txt|pages|wps|zip)$/i.test(filename) || /wordprocessingml|msword|opendocument\.text/i.test(mimeType);
                if (!isSupported && !isDocumentLike) continue;
                const reviewDetails = {
                  filename,
                  mimeType,
                  from: header("from"),
                  subject: header("subject"),
                  receivedAt: message.internalDate ?? "",
                  messageId: item.id,
                  partId: part.body?.attachmentId ?? filename,
                };
                const skipAttachment = async (reason: string) => {
                  skippedAttachments++;
                  await emit("skipped", {
                    ...reviewDetails,
                    reason,
                    skippedAttachments,
                  });
                };
                if (!isSupported) {
                  await skipAttachment("Document format is not supported for automatic parsing.");
                  continue;
                }
                const declaredSize = part.body?.size ?? 0;
                if (declaredSize > MAX_ATTACHMENT) {
                  await skipAttachment("File exceeds the 10 MB automatic parsing limit.");
                  continue;
                }
                let data = part.body?.data;
                if (part.body?.attachmentId) {
                  const attachmentResponse = await fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                      item.id
                    )}/attachments/${encodeURIComponent(
                      part.body.attachmentId
                    )}`,
                    {
                      headers: {
                        authorization: `Bearer ${authorized.accessToken}`,
                      },
                      signal: request.signal,
                      cache: "no-store",
                    }
                  );
                  if (!attachmentResponse.ok) {
                    await skipAttachment("Gmail could not retrieve this attachment.");
                    continue;
                  }
                  data = (
                    (await attachmentResponse.json()) as { data?: string }
                  ).data;
                }
                if (!data) {
                  await skipAttachment("Attachment data was unavailable from Gmail.");
                  continue;
                }
                const bytes = Buffer.from(data, "base64url");
                if (bytes.byteLength > MAX_ATTACHMENT) {
                  await skipAttachment("File exceeds the 10 MB automatic parsing limit.");
                  continue;
                }
                documentsFound++;
                await emit("attachment", {
                  ...reviewDetails,
                  size: bytes.byteLength,
                  data: bytes.toString("base64url"),
                  documentsFound,
                });
              }
            }
            pageToken = listing.nextPageToken;
          } while (pageToken && !wasCancelled && !request.signal.aborted);
          if (!wasCancelled && !request.signal.aborted)
            await emit("complete", {
              emailsScanned,
              totalEmailsEstimate,
              documentsFound,
              failedEmails,
              skippedAttachments,
            });
        } catch (error) {
          if (!wasCancelled && !request.signal.aborted)
            await emit("error", {
              message:
                error instanceof Error ? error.message : "Gmail scan failed.",
              emailsScanned,
              totalEmailsEstimate,
              documentsFound,
              failedEmails,
              skippedAttachments,
            });
        } finally {
          if (!wasCancelled) {
            try {
              controller.close();
            } catch {}
          }
        }
      })();
    },
    pull() {
      resumeStream?.();
      resumeStream = null;
    },
    cancel() {
      wasCancelled = true;
      resumeStream?.();
      resumeStream = null;
    },
  });
  request.signal.addEventListener(
    "abort",
    () => {
      wasCancelled = true;
      resumeStream?.();
      resumeStream = null;
    },
    { once: true }
  );
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
