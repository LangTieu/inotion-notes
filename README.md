# inotion — personal notes web app

Live: https://inotion.eu.cc

Markdown notes with folders, tags, search, and file attachments, running
entirely on Cloudflare's free tier: Workers + D1 + B2 (S3-compatible) storage.
React + Tailwind frontend. Note bodies are encrypted at rest (AES-GCM);
titles stay plaintext so search works.

## Features

- Email + password login (allowlist), change password in-app
- Markdown editor + preview + autosave; pin, archive, trash/restore
- Nested folders, tags, full-text search (title + decrypted body)
- Attachments up to 25 MB/note (Backblaze B2)
- Revision-based conflict detection (409) when the same note is edited twice
- JSON export

## Develop

```bash
npm install
npm run dev        # vite build + wrangler dev on :8787
npm test           # vitest
npm run typecheck  # tsc (app + worker)
npm run deploy     # vite build + wrangler deploy (ALWAYS use this, never bare wrangler deploy)
```

## Layout

- `src/` — React UI
- `worker/` — Worker API (auth, notes, folders, tags, search, attachments, B2/SigV4)
- `migrations/` — D1 migrations 0001–0004
- `wrangler.jsonc` — Worker config (D1 binding, SPA fallback, custom domain)

## Secrets (never commit)

Worker secrets are set with `wrangler secret put` and live only in
Cloudflare + 0600 files on the deploy machine:

- `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_S3_ENDPOINT` (must start with `https://`)
- `ENCRYPTION_KEY`, `ALLOWED_EMAILS`

See `GITHUB_WORKFLOW.md` for how code moves between machines.
