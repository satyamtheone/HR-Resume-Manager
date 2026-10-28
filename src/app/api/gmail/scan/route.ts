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
// Keep each serverless invocation short so Vercel can finish a batch before
// its function deadline, even when a mailbox has many attachments.
const EMAILS_PER_BATCH = 1;
const TARGET_QUOTA_UNITS_PER_SECOND = 70;
const encoder = new TextEncoder();
export const maxDuration = 60;

type ScanTotals = {
  emailsScanned?: number;
  documentsFound?: number;
  failedEmails?: number;
  skippedAttachments?: number;
  totalEmailsEstimate?: number | null;
};

function wait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("The scan was cancelled.", "AbortError"));
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", cancel);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const cancel = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      reject(new DOMException("The scan was cancelled.", "AbortError"));
    };
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function fetchGmail(
  url: URL | string,
  token: string,
  signal: AbortSignal,
  quotaUnits: number
) {
  let response: Response | undefined;
  for (let attempt = 0; attempt < 7; attempt++) {
    await wait(
      Math.ceil((quotaUnits / TARGET_QUOTA_UNITS_PER_SECOND) * 1000),
      signal
    );
    try {
      response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        signal,
        cache: "no-store",
      });
    } catch (error) {
      if (signal.aborted || attempt === 6) throw error;
      await wait(Math.min(1000 * 2 ** attempt, 10000), signal);
      continue;
    }
    let gmailRateLimited = false;
    if (response.status === 403) {
      const payload = (await response.clone().json().catch(() => null)) as {
        error?: { errors?: Array<{ reason?: string }> };
      } | null;
      gmailRateLimited = Boolean(
        payload?.error?.errors?.some((item) =>
          [
            "rateLimitExceeded",
            "userRateLimitExceeded",
            "quotaExceeded",
            "backendError",
          ].includes(item.reason ?? "")
        )
      );
    }
    const retryable =
      [429, 500, 502, 503, 504].includes(response.status) || gmailRateLimited;
    if (!retryable || attempt === 6) return response;
    const retryAfterHeader = response.headers.get("retry-after");
    const retryAfterSeconds = Number(retryAfterHeader);
    const retryAfterDate = retryAfterHeader ? Date.parse(retryAfterHeader) : NaN;
    const serverDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : Number.isFinite(retryAfterDate)
        ? Math.max(0, retryAfterDate - Date.now())
        : 0;
    const backoff = Math.min(1000 * 2 ** attempt, 10000);
    await wait(Math.min(Math.max(serverDelay, backoff), 30000), signal);
  }
  return response!;
}

async function gmailErrorDetails(response: Response) {
  const payload = (await response.clone().json().catch(() => null)) as {
    error?: { message?: string; errors?: Array<{ reason?: string }> };
  } | null;
  const reason = payload?.error?.errors?.[0]?.reason;
  const message = payload?.error?.message;
  return [reason, message].filter(Boolean).join(": ") || response.statusText;
}
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
  let body: {
    startDate?: string;
    endDate?: string;
    pageToken?: string;
    totals?: ScanTotals;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid scan range." }, { status: 400 });
  }
  const { startDate, endDate } = body;
  if (
    body.pageToken !== undefined &&
    (typeof body.pageToken !== "string" || body.pageToken.length > 8192)
  )
    return NextResponse.json(
      { error: "Invalid Gmail scan cursor." },
      { status: 400 }
    );
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
        const count = (value: number | undefined) =>
          Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : 0;
        let emailsScanned = count(body.totals?.emailsScanned),
          documentsFound = count(body.totals?.documentsFound),
          failedEmails = count(body.totals?.failedEmails),
          skippedAttachments = count(body.totals?.skippedAttachments),
          totalEmailsEstimate = body.totals?.totalEmailsEstimate ?? null;
        try {
            const url = new URL(
              "https://gmail.googleapis.com/gmail/v1/users/me/messages"
            );
            url.searchParams.set("q", query);
            url.searchParams.set("maxResults", String(EMAILS_PER_BATCH));
            if (body.pageToken) url.searchParams.set("pageToken", body.pageToken);
            const response = await fetchGmail(
              url,
              authorized.accessToken,
              request.signal,
              5
            );
            if (!response.ok) {
              const details = await gmailErrorDetails(response);
              throw new Error(
                `Gmail could not search this mailbox (HTTP ${response.status}${details ? ` · ${details}` : ""}).`
              );
            }
            const listing = (await response.json()) as {
              messages?: Array<{ id: string }>;
              resultSizeEstimate?: number;
              nextPageToken?: string;
            };
            const messages = listing.messages ?? [];
            totalEmailsEstimate ??= listing.resultSizeEstimate ?? messages.length;
            await emit("start", {
              totalEmailsEstimate,
              emailsScanned,
              documentsFound,
              failedEmails,
              skippedAttachments,
            });
            for (const item of messages) {
              if (wasCancelled || request.signal.aborted) return;
              const messageResponse = await fetchGmail(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                  item.id
                )}?format=full`,
                authorized.accessToken,
                request.signal,
                60
              );
              if (!messageResponse.ok) {
                failedEmails++;
                emailsScanned++;
                const details = await gmailErrorDetails(messageResponse);
                await emit("email_failed", {
                  messageId: item.id,
                  status: messageResponse.status,
                  details,
                  failedEmails,
                });
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
                messageId: item.id,
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
                  const attachmentResponse = await fetchGmail(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
                      item.id
                    )}/attachments/${encodeURIComponent(
                      part.body.attachmentId
                    )}`,
                    authorized.accessToken,
                    request.signal,
                    20
                  );
                  if (!attachmentResponse.ok) {
                    const details = await gmailErrorDetails(attachmentResponse);
                    await skipAttachment(
                      `Gmail could not retrieve this attachment (HTTP ${attachmentResponse.status}${details ? ` · ${details}` : ""}).`
                    );
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
            if (!wasCancelled && !request.signal.aborted)
              await emit(listing.nextPageToken ? "batch" : "complete", {
              emailsScanned,
              totalEmailsEstimate,
              documentsFound,
              failedEmails,
              skippedAttachments,
                nextPageToken: listing.nextPageToken ?? null,
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
