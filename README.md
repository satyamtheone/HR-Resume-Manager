# Resume Parser

A local recruitment workspace built with Next.js, TypeScript, PDF.js, Mammoth, and deterministic extraction rules. It supports manual PDF/DOCX upload, Gmail attachment scanning, candidate review, duplicate warnings, and a rules-based shortlist. Resume files are parsed in the browser. Gmail OAuth runs on the server and requests read-only mailbox access; no AI integration, analytics, or external matching service is used. Candidate records remain in browser memory and are removed on refresh or when the session is cleared.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:3000. Upload PDF/DOCX files (10 MB each maximum), or configure Gmail below and scan a date range. A PDF with no selectable text is flagged as likely requiring OCR. OCR is not included.

## Gmail OAuth setup

1. Enable the Gmail API in a Google Cloud project and create a Web application OAuth client.
2. Add `http://localhost:3000/api/gmail/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env.local`, then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to match the Google Cloud client.
4. Generate a session encryption key with `openssl rand -base64 32` and set it as `GMAIL_SESSION_KEY`.
5. Restart the dev server and select **Connect Gmail**. Google grants read-only access to the selected mailbox. The app stores the encrypted OAuth session in a secure, HTTP-only cookie; it never exposes tokens to browser JavaScript.

The scan searches and paginates through all matching emails in the selected date range, 100 emails per Gmail API page. The dashboard streams email and attachment progress while each found document is parsed in the browser. The selected range is limited to one year; individual files still use the 10 MB validation limit. The candidate shortlist uses explicit skill, experience, and location rules and displays the reasons for each match; it is not an AI or suitability score.

## Quality commands

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

## Privacy and limitations

Candidate data and extracted resume text stay in browser memory. Refreshing clears the working list; export profiles or CSV first if needed. OAuth refresh tokens are encrypted with `GMAIL_SESSION_KEY` before being stored in a secure, HTTP-only cookie. CSV export excludes full resume text and prefixes spreadsheet formula-like values. Review heuristic fields, employment associations, duplicate warnings, and shortlist explanations before relying on them. Phone and location detection are deliberately conservative. PDF page limit is 100 and the per-file size limit is configurable in `src/lib/resume/validate-file.ts`. Gmail scan results are capped as described above. OCR, durable database storage, AI matching, and hiring decisions are outside this implementation.

## Synthetic fixture

`tests/resume-parser.test.ts` contains fabricated resume text. For a manual check, create synthetic PDF and DOCX files with fictitious details, upload them together, and verify per-file statuses, duplicate warnings, profile edits, JSON/CSV download, and shortlist reasons. After OAuth setup, use a mailbox or test messages containing synthetic resumes to verify Gmail scanning.
