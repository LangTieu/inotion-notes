Scope Summary

Included: TOTP 2FA & session management, dual-mode WYSIWYG/Markdown editor & revision history, multi-format export/import & presigned large-file B2 uploads, offline-first PWA sync queue, hardened share links & notebook site publishing, reminders & URL clipper/bookmarklet, and BYOK AI assistant & PAT-authenticated Remote MCP server.

Excluded (Out of Scope): Native desktop/mobile apps (web-only constraint); Manifest V3 browser extension Web Clipper (outside web-only scope—replaced by in-app URL clipper + bookmarklet); plugin marketplace (unbounded XSS and maintenance surface); Docker/Postgres self-host path (Cloudflare-only stack); full E2E zero-knowledge migration (incompatible with server-side FTS and current ENCRYPTION_KEY encryption-at-rest).

Hard Constraints: Existing Workers + D1 + B2 free-tier stack, enc:v1: encryption-at-rest, email+password auth, and all existing API contracts remain intact; zero paid services; ADD-ONLY edits to existing shared files. GitHub: every finished phase is pushed to LangTieu/inotion-notes (private) by the liaison via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes) and verified file-by-file (blob sha match) before the phase counts as done. Pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml: tests + typecheck + build gates, D1 migrations, wrangler deploy with repo secret CLOUDFLARE_API_TOKEN); the liaison verifies the run is green and live-smokes after.

Revision 22/11 (after owner review of free-tier limits + reading EdgeEver source code): Phases 7, 9, 11 updated with decided solutions — P7: 50 MB/file, 250 MB/note, 8 GB hard stop (80% of 10 GB B2 free tier), client-side image compression, B2-object deletion on permanent note delete, 24 h prune of unbound pending uploads, second B2 account only as a later lever at 70% usage; P9: long edge cache on public pages with purge on update + account-wide guard disabling public routes near ~80,000 requests/day, default noindex, text/Markdown-only public sites in v1; P11: stateless-first MCP (plain Worker POST JSON-RPC, no WebSocket, no Durable Objects by default, DO SQLite only for resumable sessions), per-PAT cap 1,000 tool calls/day + D1 audit log, browser-direct BYOK first. EdgeEver reference (verified in `~/workspace/notes-app/refs/edgeever`, 22/11): R2 + multipart upload (100 MB/part, up to 1 GB/file), per-workspace pending quotas (1 GB, 100 files, 24 h auto-cleanup), public pages served `private, no-store` with no edge caching, MCP as POST-only JSON-RPC on a plain Worker with no DO and no sessions — EdgeEver survives free-tier limits mainly because each user deploys their own Fork (own Cloudflare account); inotion is a single shared instance, so the edge cache (P9) and 80% guard (P7) are kept and go beyond EdgeEver.

Revision 22/11 15:12 (owner: use both B2 accounts in parallel): TK2 is LIVE (account 6cb4e851b310, bucket inotion01-notes-attachment, Private, US East) — the 'second B2 only at 70%' line is SUPERSEDED. New uploads round-robin TK1<->TK2 (COUNT(*) parity), attachments.b2_account records the bucket (migration 0005, Codex implementing since 15:27 22/11, brief CODEX_B2_PARALLEL_BRIEF.md), quota warning 7 GB per bucket, hard stop 8 GB per bucket, fallback to TK1 when TK2 is unconfigured. Plan migrations renumbered +1 (P5 0006, P6 0007, P8 0008, P9 0009, P10 0010, P11 0011) because 0005 is taken by the parallel change. P7 limits (50 MB/file, 250 MB/note) unchanged; the parallel change keeps the live 25 MB caps until P7 lands. GitHub 15:33 22/11: the plan never mentioned GitHub — added now (Hard Constraints + step 7 of every implementation prompt): each phase is pushed to LangTieu/inotion-notes by the liaison after tests pass + deploy + live check, verified by blob sha. GitHub Actions deploy 16:26 22/11 (owner order): push to main auto-deploys via .github/workflows/deploy.yml (first run green, Worker version 55a4d582); secret CLOUDFLARE_API_TOKEN stored as repo secret; webmail NOT wired yet (repo behind IB4 source of truth).

Phase 5: Account security hardening — TOTP 2FA, recovery codes, and active device session management.

Phase 6: Dual-mode editor (WYSIWYG + raw Markdown) and encrypted per-note revision history with diff/restore.

Phase 7: Multi-format export (MD/HTML/PDF), multi-app import (Obsidian/Evernote/Joplin/Notion/MD), and presigned B2 uploads for large attachments.

Phase 8: Offline-first PWA with IndexedDB local cache, ordered outbox sync queue, and 409 conflict resolution.

Phase 9: Hardened read-only share links (fragment-key snapshot, expiry, revocation) and public notebook/folder site publishing.

Phase 10: Per-note reminders (in-app due list, browser notifications, ICS export) and SSRF-safe URL clipper + bookmarklet.

Phase 11: BYOK AI writing/Q&A assistant and PAT-authenticated Remote MCP server for external AI agents.

Architecture & Security Lessons Applied from References

From EdgeEver (tianma-if/edgeever): Adopts the 3-pane workflow enhancements, WYSIWYG/Markdown toggle, revision history, TOTP 2FA + active session controls, multi-source import (Evernote/Obsidian/Joplin/Markdown), and Remote MCP server for agents like Claude Code and Codex. Explicitly mitigates two real-world EdgeEver vulnerability classes: CVE-2026-109557 (stored XSS via unsanitized notebook/note names injected through MCP tools) and CVE-2026-129172 (XSS via crafted shared notes/public links) by enforcing strict HTML escaping, URL scheme filtering, and isolated CSP headers on all public and MCP-ingested content.   
GitHub
+ 1

From NoteFlare (homielab/noteflare): Adopts the IndexedDB cache + ordered mutation outbox pattern for offline PWA support, point-in-time snapshot share links with per-link AES-256-GCM keys in the URL #fragment plus automatic revocation on trash, and SHA-256-hashed scoped Personal Access Tokens (PATs) that reject browser session cookies on programmatic endpoints to eliminate CSRF. Retains inotion's server-held ENCRYPTION_KEY encryption-at-rest instead of NoteFlare's browser-only E2E model so existing server-side title FTS and decrypted-body search continue working unchanged.   
GitHub

Phase 5 — Account Security Hardening (TOTP 2FA & Active Sessions)
Goal

Add EdgeEver-grade account protection (TOTP 2FA with recovery codes and active device session visibility/revocation) using pure WebCrypto on Cloudflare Workers without breaking existing email+password login.

Exact Features

TOTP 2FA (RFC 6238, SHA-1, 6 digits, 30s window, ±1 step skew):

Enrollment flow: generate 20-byte secret, render QR code SVG client-side + manual base32 secret, require a valid 6-digit code to activate.

Store TOTP secret encrypted at rest using existing enc:v1: AES-GCM helper (worker/crypto.ts).

Generate 8 single-use recovery codes (stored as PBKDF2/SHA-256 hashes); allow login with a recovery code if authenticator is unavailable.

Two-step login: if 2FA is enabled, POST /api/auth/login returns { requires_2fa: true, challenge_token } (short-lived 5-minute signed/hashed challenge, not a full session); POST /api/auth/2fa/verify completes login and sets the session cookie.

Disable 2FA requires current password + valid TOTP/recovery code.

Active Session Management:

Record truncated user_agent (max 200 chars) and coarse label (e.g., browser/OS parsed client-side or simple UA summary—no raw IP stored unless opted in) on sessions.

Settings/Security modal listing active sessions (created_at, last_seen_at, expires_at, is_current), with "Revoke" per session and "Revoke all other sessions".

Files to Add / Change (ADD-ONLY)

Add:

migrations/0006_totp_and_sessions_meta.sql

worker/totp.ts (RFC 6238 WebCrypto HMAC-SHA1 TOTP, base32 encode/decode, constant-time verify, recovery code generator/verifier)

worker/totp.test.ts

src/components/SecurityModal.tsx (2FA setup/disable + QR SVG + active sessions table)

src/utils/qr.ts (lightweight zero-dependency SVG QR generator)

Extend (ADD-ONLY):

worker/auth.ts (add 2FA challenge check on login, session metadata capture, session list/revoke handlers)

worker/index.ts (register /api/auth/2fa/* and /api/auth/sessions* routes)

src/api.ts (add 2FA and session API client functions)

src/App.tsx (add 2FA code step to Sign In view and "Security" button in sidebar footer)

API Changes

POST /api/auth/login — backward-compatible: returns { email } when 2FA is off; returns 200 { requires_2fa: true, challenge_token } when 2FA is on.

POST /api/auth/2fa/verify — body { challenge_token, code } → verifies TOTP or recovery code (rate-limited via login_attempts), issues session cookie, returns { email }.

POST /api/auth/2fa/setup — authenticated; returns { otpauth_uri, secret_base32 } (pending until confirmed).

POST /api/auth/2fa/enable — authenticated; body { code, password } → activates 2FA, returns { recovery_codes: string[] } (shown once).

POST /api/auth/2fa/disable — authenticated; body { password, code } → disables 2FA and deletes recovery codes.

GET /api/auth/sessions — returns active non-revoked, non-expired sessions for current user with is_current flag.

DELETE /api/auth/sessions/:id_prefix (or opaque session display ID, never raw token) — revokes target session.

POST /api/auth/sessions/revoke-others — revokes all sessions except current.

Data Migrations (migrations/0006_totp_and_sessions_meta.sql)

ALTER TABLE users ADD COLUMN totp_secret_enc TEXT NULL;

ALTER TABLE users ADD COLUMN totp_enabled_at INTEGER NULL;

ALTER TABLE sessions ADD COLUMN session_id TEXT; (random public UUID for UI revocation without exposing id_hash)

ALTER TABLE sessions ADD COLUMN user_agent TEXT NULL;

CREATE TABLE user_recovery_codes (id TEXT PK, user_id TEXT FK, code_hash TEXT NOT NULL, used_at INTEGER NULL, created_at INTEGER NOT NULL);

CREATE TABLE auth_challenges (token_hash TEXT PK, user_id TEXT FK, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);

Tests to Add

worker/totp.test.ts: RFC 6238 known test vectors, ±30s clock skew acceptance, replay rejection (or challenge single-use), recovery code consumption (cannot reuse), login flow with 2FA off vs on, rate limiting on /api/auth/2fa/verify, session listing and revoking another session invalidates its cookie immediately.

Acceptance Criteria

Users without 2FA log in identically to before (zero regression).

Enabling 2FA encrypts the secret (enc:v1:) in D1 and enforces 2FA on subsequent logins.

Revoking another session immediately yields 401 on that session's next API call.

npm test, npm run typecheck, npm run build all pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

TOTP replay window: Allowing ±1 time step (90s window) improves UX on slightly drifted clocks, but theoretically allows a code reuse within 30s unless we track last_totp_step on users. Decision needed: add last_totp_step INTEGER column to block same-step replay? (Recommended: Yes.)

Session device info: Storing truncated User-Agent is privacy-friendly and free; storing IP geolocation is excluded to avoid external APIs and PII retention. Decision needed: confirm UA-only session labeling is sufficient.

Ready-to-Paste Implementation Prompt (Phase 5)
Markdown
Implement Phase 5 (TOTP 2FA & Active Session Management) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/auth.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Do NOT modify existing API contracts for users without 2FA. Use pure WebCrypto (no external TOTP npm packages).
TASKS:
1. Create `migrations/0006_totp_and_sessions_meta.sql` adding `totp_secret_enc`, `totp_enabled_at`, `last_totp_step` to `users`; `session_id`, `user_agent` to `sessions`; and tables `user_recovery_codes` and `auth_challenges`.
2. Create `worker/totp.ts` implementing RFC 6238 TOTP (SHA-1, 6 digits, 30s, ±1 skew, constant-time verify), base32 codec, and 8 single-use hashed recovery codes. Encrypt `totp_secret_enc` using existing `worker/crypto.ts` (`enc:v1:`).
3. Extend `worker/auth.ts` and `worker/index.ts` with `POST /api/auth/2fa/setup`, `/enable`, `/disable`, `/verify`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/:session_id`, and `POST /api/auth/sessions/revoke-others`. Update `POST /api/auth/login` to return `{ requires_2fa: true, challenge_token }` only when `totp_enabled_at IS NOT NULL`. Apply existing rate-limiting to `/api/auth/2fa/verify`.
4. Add `src/utils/qr.ts` (zero-dependency SVG QR encoder) and `src/components/SecurityModal.tsx` (2FA setup/disable + recovery codes display + active sessions list). Wire into `src/api.ts` and `src/App.tsx` (2FA login step + Security modal trigger in sidebar footer).
5. Add `worker/totp.test.ts` covering RFC 6238 vectors, setup/enable/disable, login 2FA flow, recovery code single-use, rate limiting, and cross-session revocation.
6. Run `npm test`, `npm run typecheck`, and `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 6 — Dual-Mode Editor (WYSIWYG + Raw Markdown) & Revision History
Goal

Close the core writing gap vs. EdgeEver by adding seamless WYSIWYG ↔ Raw Markdown editing (with tables, task lists, code blocks, and math) and encrypted per-note revision history with diff viewing and one-click restore.

Exact Features

Dual-Mode Editor (Write (MD) | Rich (WYSIWYG) | Preview):

Keep raw Markdown (body_md) as the single canonical storage format in D1.

Rich WYSIWYG mode edits directly in a structured rich-text surface (using a lightweight ProseMirror/Tiptap or Milkdown Markdown-backed editor, or a clean contenteditable Markdown bridge if keeping zero new heavy deps) supporting headings, bold/italic/strike, links, task lists (- [ ] clickable checkboxes), GFM tables, fenced code blocks with syntax highlighting, and KaTeX math ($...$ / $$...$$).

Formatting toolbar (H1–H3, Bold, Italic, Code, Checklist, Table, Quote, Link) + Focus Mode toggle (collapses sidebar and note list for distraction-free writing).

Strict sanitization on all rendered HTML/Markdown (no raw <script>, onerror, or javascript: URLs).

Encrypted Revision History:

Whenever PATCH /api/notes/:id changes title or body_md, snapshot the previous version into note_revisions (throttled: create a new snapshot only if ≥ 2 minutes elapsed since the last snapshot OR the user explicitly clicks "Save snapshot" OR right before a restore/409 overwrite, to stay well inside D1 free-tier row-write limits).

Encrypt body_md in note_revisions with enc:v1: using worker/crypto.ts.

Cap retention at the latest 30 revisions per note (prune oldest on insert) to protect the 500 MB D1 free quota.

History drawer in the editor showing timestamps + revision numbers, side-by-side/inline line diff against current note, and a "Restore this revision" button (creates a new revision via PATCH semantics so history is never lost).

Files to Add / Change (ADD-ONLY)

Add:

migrations/0007_note_revisions.sql

worker/revisions.ts (snapshot creation, pruning to 30, list/get/restore handlers with user_id ownership check)

worker/revisions.test.ts

src/components/RichMarkdownEditor.tsx (WYSIWYG + toolbar + Focus Mode wrapper)

src/components/RevisionHistoryDrawer.tsx (revision list, line diff viewer, restore button)

Extend (ADD-ONLY):

worker/notes.ts (hook snapshot helper into PATCH /api/notes/:id and cascade delete revisions on permanent DELETE /api/notes/:id)

worker/index.ts (mount /api/notes/:id/revisions* routes)

src/api.ts (add revision endpoints)

src/App.tsx / existing Editor component (add mode switcher Markdown | Rich | Preview, Focus Mode toggle, and "History" button)

API Changes

GET /api/notes/:id/revisions — returns [{ id, revision, title, created_at, byte_length }] (newest first, up to 30).

GET /api/notes/:id/revisions/:revId — returns { id, revision, title, body_md (decrypted), created_at }.

POST /api/notes/:id/revisions/:revId/restore — body { current_revision } → verifies current_revision (409 on conflict), snapshots current note, restores target title/body, increments revision, returns updated Note.

Data Migrations (migrations/0007_note_revisions.sql)

CREATE TABLE note_revisions (id TEXT PK, note_id TEXT NOT NULL FK notes(id) ON DELETE CASCADE, user_id TEXT NOT NULL FK users(id), revision INTEGER NOT NULL, title TEXT NOT NULL, body_md TEXT NOT NULL, created_at INTEGER NOT NULL);

CREATE INDEX idx_note_revisions_note_created ON note_revisions(note_id, created_at DESC);

Tests to Add

worker/revisions.test.ts: snapshot stored encrypted (enc:v1:), throttle behavior (rapid autosaves don't spam rows), 30-revision cap pruning, restore increments revision and preserves prior state, 409 conflict on stale current_revision, strict user_id isolation (user B cannot read/restore user A's revisions), cascade deletion when note is permanently deleted.

Acceptance Criteria

Toggling between Raw Markdown and WYSIWYG preserves headings, lists, checkboxes, tables, and code blocks without data loss.

Revision history lists snapshots, displays clean diffs, and restores safely without overwriting concurrent edits.

note_revisions.body_md is verified enc:v1: in D1.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

WYSIWYG engine choice: Adding Tiptap/ProseMirror + tiptap-markdown adds ~120–180 KB gzipped to the frontend bundle (and requires npm install on a machine with registry access). A lighter alternative is a formatting toolbar + live split-pane preview + clickable checklists with zero new dependencies. Decision needed: approve Tiptap/Milkdown bundle dependency, or prefer zero-dependency split-pane + interactive checklists first?

Snapshot throttle & cap: 2-minute throttle + 30 snapshots/note keeps D1 writes and storage well within free tier. Decision needed: confirm 30 revisions/note cap is acceptable.

Ready-to-Paste Implementation Prompt (Phase 6)
Markdown
Implement Phase 6 (Dual-Mode Editor & Encrypted Revision History) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/notes.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Keep `body_md` in Markdown as canonical storage, encrypted with `enc:v1:` via `worker/crypto.ts`.
TASKS:
1. Create `migrations/0007_note_revisions.sql` with `note_revisions` table and index `(note_id, created_at DESC)`.
2. Create `worker/revisions.ts` implementing throttled snapshotting (min 2-minute interval unless forced), 30-revision retention pruning per note, `GET /api/notes/:id/revisions`, `GET /api/notes/:id/revisions/:revId`, and `POST /api/notes/:id/revisions/:revId/restore` (with `current_revision` 409 check and `user_id` ownership enforcement).
3. Hook snapshot creation into `PATCH /api/notes/:id` in `worker/notes.ts` and register routes in `worker/index.ts`.
4. Add `src/components/RichMarkdownEditor.tsx` (WYSIWYG/Markdown/Preview switcher, formatting toolbar, clickable task list checkboxes, tables, code blocks, Focus Mode toggle, strict XSS sanitization) and `src/components/RevisionHistoryDrawer.tsx` (revision list, inline diff, restore action). Wire into `src/api.ts` and editor UI.
5. Add `worker/revisions.test.ts` testing encrypted storage, throttling, 30-cap pruning, restore + 409 conflict, ownership isolation, and cascade delete.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 7 — Multi-Format Export (MD/HTML/PDF), Bulk Import & Large B2 Attachments
Goal

Enable frictionless data portability (in and out of inotion) and lift the Worker-proxy 25 MB attachment ceiling for large files via direct-to-B2 presigned uploads, all processed client-side to stay inside Workers' 10 ms CPU limit.

Exact Features

Multi-Format Export (Client-Side):

Single-note export: Markdown (.md) with YAML frontmatter (title, tags, folder, dates), Standalone HTML (.html) with clean print-friendly CSS and sanitized Markdown, and PDF via clean @media print stylesheet + window.print() (zero server cost, crisp vector text).

Full-workspace export: keep existing JSON export + add Markdown ZIP (folder hierarchy mapped to directories, .md files with frontmatter, optional attachment manifest).

Bulk Import (Client-Side Parsers → Existing REST APIs):

Drag-and-drop import modal supporting:

Markdown / Obsidian Vault folder (webkitdirectory / .zip): preserves nested folder structure, parses YAML frontmatter tags, imports linked local attachments.

Evernote (.enex): XML parser converting ENML to clean Markdown, preserving tags, created/updated timestamps, and base64-decoded resources as B2 attachments.

Joplin (.jex / Markdown export) & Notion (Markdown + CSV .zip): strips Notion's 32-char hex suffixes from filenames, reconstructs folders and tags.

Shows preview count (notes, folders, tags, attachments), progress bar, per-item error report, and throttled client-side batching (e.g., 3 concurrent requests) to avoid tripping D1 write spikes.

Large File Attachments via Presigned B2 PUT URLs:

Keep existing POST /api/notes/:id/attachments (≤ 25 MB multipart) intact for backward compatibility.

Add 2-step direct upload for larger files (up to 50 MB/file, 250 MB/note — decided 22/11; B2 free tier is 10 GB total, so 100 MB/file would fill it with ~100 files):

POST /api/notes/:id/attachments/presign → validates ownership, MIME/extension, size cap, and the 8 GB hard stop PER BUCKET (80% of that bucket's 10 GB free tier — presign is rejected at/above 8 GB in the CHOSEN bucket with a clear message; reads still work); the bucket is picked by the same round-robin rule as the multipart upload (COUNT(*) parity over attachments, recorded as b2_account on /complete); returns a 10-minute SigV4 presigned PUT URL to the chosen bucket (s3.us-east-005.backblazeb2.com/<bucket>) + pending attachment_id.

Browser uploads directly to B2 with progress bar (XMLHttpRequest / fetch), then calls POST /api/notes/:id/attachments/complete → Worker verifies object existence via B2 HEAD and inserts metadata into attachments.

Client-side image compression (Canvas, before presign): photos are downscaled/re-encoded in the browser (typical 3–5× smaller) so the common case stays far under the caps. B2 object deletion: permanently deleting a note deletes its B2 objects too (trash/restore keeps them). Pending-upload prune: a presigned upload that is never completed expires after 24 h and its B2 object is deleted opportunistically on presign/complete calls (no cron). SUPERSEDED 15:12 22/11 — second B2 account (TK2) is LIVE and used in parallel: new uploads round-robin TK1<->TK2, attachments.b2_account records the bucket (migration 0005, in progress). (EdgeEver reference: R2 + multipart upload, 100 MB/part up to 1 GB/file, per-workspace pending quotas of 1 GB / 100 files with 24 h auto-cleanup; no client-side compression, no bucket-wide guard — the 24 h prune above is adopted from them.)

Files to Add / Change (ADD-ONLY)

Add:

worker/b2-presign.ts (WebCrypto AWS SigV4 query-string presigner for PUT and HEAD verification)

worker/b2-presign.test.ts

src/utils/exportFormats.ts (MD frontmatter, sanitized standalone HTML, print-PDF helper, ZIP builder)

src/utils/importers.ts (client-side parsers for Markdown/Obsidian, Evernote .enex, Joplin, Notion ZIP)

src/components/ImportExportModal.tsx (tabbed Import / Export UI with progress bar and summary)

Extend (ADD-ONLY):

worker/attachments.ts (add /presign and /complete handlers + HEAD verification)

worker/index.ts (mount presign/complete routes)

src/api.ts (add presigned upload with progress callback)

src/App.tsx & Attachments panel (add "Import / Export" modal trigger, per-note export menu, and upload progress bar for >25 MB files)

API Changes

POST /api/notes/:id/attachments/presign — body { filename, content_type, byte_size } → 200 { upload_url, object_key, expires_at, quota_warning? }.

POST /api/notes/:id/attachments/complete — body { object_key, filename, content_type, byte_size } → verifies HEAD on B2 (matching size) and inserts row in attachments, returns 201 + Attachment.

Optional batch helper: POST /api/notes/import-batch (accepts up to 20 notes per request with created_at/updated_at preservation, strictly within 256 KB body limit) OR reuse POST /api/notes with optional created_at override.

Data Migrations

None required for P7 itself (reuses existing notes, folders, tags, note_tags, attachments tables). NOTE: migration 0005 (attachments.b2_account) belongs to the earlier B2-parallel change, not to P7.

Tests to Add

worker/b2-presign.test.ts: valid SigV4 presigned URL generation, ownership check, MIME/size limit enforcement, complete rejects missing B2 object (HEAD 404) or mismatched object_key prefix (prevents hijacking another user's key).

src/utils/importers.test.ts: unit tests for Obsidian frontmatter/wikilink parsing, Evernote .enex ENML-to-Markdown + resource decoding, Notion filename cleanup, and XSS stripping on imported HTML/ENML.

src/utils/exportFormats.test.ts: Markdown frontmatter output and HTML escaping.

Acceptance Criteria

Exporting a note to .md, .html, and Print-to-PDF produces clean, XSS-free output.

Importing a sample Obsidian folder and Evernote .enex file recreates folders, tags, notes, and attachments accurately without hitting Worker CPU limits.

Uploading a >25 MB file uses direct B2 presigned PUT with progress bar and appears in the attachments list after /complete.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

B2 CORS configuration required: Direct browser PUT to s3.us-east-005.backblazeb2.com requires setting a B2 bucket CORS rule allowing PUT from [https://inotion.eu.cc](https://inotion.eu.cc) (one-time free B2 config). Decision needed: confirm you will apply the B2 CORS rule before enabling >25 MB uploads live.

Max file size cap on B2 free tier (10 GB per bucket, two buckets in parallel): DECIDED 22/11 — presigned single-file cap 50 MB, 250 MB/note, hard stop at 8 GB (80%) PER BUCKET, plus client-side image compression, B2-object deletion on permanent note delete, and 24 h prune of unbound pending uploads. Second B2 account: LIVE since 15:12 22/11, used in parallel (round-robin).

Ready-to-Paste Implementation Prompt (Phase 7)
Markdown
Implement Phase 7 (Multi-Format Export, Bulk Import & Presigned Large B2 Attachments) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/attachments.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Keep existing 25 MB multipart upload and JSON export working unchanged. Run all import/export parsing in the browser to stay within Workers' 10 ms CPU limit.
TASKS:
1. Create `worker/b2-presign.ts` using pure WebCrypto to generate 10-minute AWS SigV4 presigned PUT URLs and execute B2 HEAD verification.
2. Extend `worker/attachments.ts` and `worker/index.ts` with `POST /api/notes/:id/attachments/presign` (validating ownership, MIME/extension, 50 MB cap, 8 GB hard stop at 80% of the CHOSEN bucket's 10 GB free tier; bucket picked by round-robin COUNT(*) parity, same rule as the multipart upload) and `POST /api/notes/:id/attachments/complete` (verifying `object_key` belongs to `user_id/note_id/` and B2 HEAD succeeds on the recorded bucket before inserting D1 metadata with `b2_account`). Also: compress images client-side (Canvas) before presign; delete the B2 object when its note is permanently deleted; opportunistically prune pending uploads older than 24 h that were never completed (on presign/complete calls, no cron).
3. Create `src/utils/exportFormats.ts` (per-note `.md` with frontmatter, sanitized `.html`, Print-to-PDF stylesheet helper, workspace Markdown ZIP) and `src/utils/importers.ts` (client-side parsers for Markdown/Obsidian folders, Evernote `.enex`, Joplin, and Notion ZIP with XSS sanitization).
4. Create `src/components/ImportExportModal.tsx` with preview counts, throttled upload queue, progress bar, and error reporting. Wire into `src/api.ts` and UI.
5. Add `worker/b2-presign.test.ts` (including: presign rejected at/above the 8 GB hard stop; 50 MB cap enforced; complete rejects missing B2 object), `src/utils/importers.test.ts`, and `src/utils/exportFormats.test.ts`, plus tests for client-side image compression, B2-object deletion on permanent note delete, and 24 h pending-upload pruning.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 8 — Offline-First PWA & Background Sync Queue
Goal

Make inotion installable as a PWA and usable when offline (read cached notes, create/edit/pin/tag notes offline, and automatically sync when reconnected) using NoteFlare's IndexedDB + ordered outbox architecture, while preserving inotion's server-held encryption-at-rest.   
GitHub

Exact Features

Installable PWA:

public/manifest.webmanifest + app icons (192x192, 512x512) + Service Worker (public/sw.js) caching static app shell assets (cache-first for hashed Vite assets, network-first for HTML, never caching /api/* auth responses in SW cache).

IndexedDB Local Store & Outbox Queue:

Cache decrypted notes, folders, and tags for the signed-in user in IndexedDB (inotion-offline-v1).

Strict Sign-Out Wipe: On POST /api/auth/logout or 401 session expiry, immediately wipe IndexedDB so shared devices never retain cached notes (matching NoteFlare's security model).   
GitHub

Ordered Mutation Outbox: When offline (or network error), edits (create, patch, delete, restore) write optimistically to IndexedDB and append to an ordered outbox store.

Header Status Indicator: Displays Offline · N unsynced when offline/queued, Syncing… when replaying, and All synced when clean.

Delta Sync Endpoint: Lightweight GET /api/sync?since=<unix_ms> returning notes/folders/tags modified after since (plus deleted IDs via tombstones or full ID list) to minimize D1 row reads on reconnect.

409 Conflict Handling: If an outbox PATCH returns 409 Revision conflict on reconnect, pause that note's item and open the existing 409 Conflict Dialog (Reload latest vs. Overwrite).

Files to Add / Change (ADD-ONLY)

Add:

public/manifest.webmanifest

public/sw.js (minimal vanilla Service Worker, no Workbox bloat)

migrations/0008_sync_tombstones.sql

worker/sync.ts (GET /api/sync?since=<ms>)

worker/sync.test.ts

src/offline/db.ts (typed IndexedDB wrapper for notes, folders, tags, outbox, meta)

src/offline/syncEngine.ts (outbox replay, online/offline listeners, 409 surfacing, logout wipe)

src/offline/syncEngine.test.ts

Extend (ADD-ONLY):

index.html (link manifest + theme-color)

src/main.tsx (register /sw.js)

worker/notes.ts (record tombstone on permanent DELETE)

worker/index.ts (mount GET /api/sync)

src/api.ts & src/App.tsx (read/write through offline layer, show Offline · N unsynced pill, wipe IndexedDB on logout)

API Changes

GET /api/sync?since=<unix_ms> — returns { server_time, notes: Note[], folders: Folder[], tags: Tag[], deleted_note_ids: string[] } filtered by user_id and updated_at > since (capped at 200 items/call with has_more flag).

Data Migrations (migrations/0008_sync_tombstones.sql)

CREATE TABLE sync_tombstones (id TEXT PK, user_id TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, deleted_at INTEGER NOT NULL);

CREATE INDEX idx_tombstones_user_time ON sync_tombstones(user_id, deleted_at);

Tests to Add

worker/sync.test.ts: delta returns only records updated after since, includes permanently deleted IDs from tombstones, enforces user_id isolation, handles pagination when >200 changes exist.

src/offline/syncEngine.test.ts: offline create → edit → reconnect replays in strict FIFO order, maps temporary client ID to server UUID, pauses and surfaces 409 conflict without losing local draft, wipes IndexedDB on logout.

Acceptance Criteria

App passes Chrome PWA installability check and loads its UI shell when DevTools is set to Offline.

Creating and editing notes offline persists across page reloads and syncs automatically upon reconnecting.

Signing out completely clears IndexedDB.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

Plaintext in IndexedDB vs. E2E: Because inotion uses server-held encryption-at-rest (not browser-derived E2E keys), offline notes in IndexedDB are stored readable to the browser profile until sign-out. Decision needed: accept browser-profile isolation + auto-wipe on sign-out, or add an optional "Offline cache enabled" toggle (default ON on personal devices, OFF on shared devices)? (Recommended: add an opt-out toggle in Security modal.)

Attachments offline: Caching large B2 binaries in IndexedDB can quickly hit browser storage limits. Decision needed: confirm attachments remain online-only in v1 offline mode (matching NoteFlare's rule that files download on demand).

Ready-to-Paste Implementation Prompt (Phase 8)
Markdown
Implement Phase 8 (Offline-First PWA & Background Sync Queue) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`index.html`, `src/main.tsx`, `worker/notes.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Never cache `/api/*` auth responses in the Service Worker. Wipe IndexedDB on logout or 401.
TASKS:
1. Create `migrations/0008_sync_tombstones.sql` and `worker/sync.ts` implementing `GET /api/sync?since=<ms>` (returning updated notes/folders/tags + tombstones for current `user_id`, paginated). Record tombstones on permanent delete in `worker/notes.ts` and mount route in `worker/index.ts`.
2. Add `public/manifest.webmanifest`, `public/sw.js` (app shell caching only), and register SW in `src/main.tsx`.
3. Create `src/offline/db.ts` (IndexedDB stores: `notes`, `folders`, `tags`, `outbox`, `meta`) and `src/offline/syncEngine.ts` (FIFO outbox replay, temp-ID remapping, 409 conflict handoff, logout wipe).
4. Wire offline status indicator (`Offline · N unsynced` / `Syncing…`) and offline read/write fallback into `src/api.ts` and `src/App.tsx`.
5. Add `worker/sync.test.ts` and `src/offline/syncEngine.test.ts`.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 9 — Share Links & Public Notebook Publishing
Goal

Allow users to share individual notes via revocable read-only links (using NoteFlare's zero-trust #fragment snapshot encryption) and publish an entire folder as a clean, read-only public web site at [https://inotion.eu.cc/p/:slug](https://inotion.eu.cc/p/:slug), while completely preventing the XSS flaws seen in EdgeEver.

Exact Features

Single-Note Share Links (/s/:shareId#<key>):

Point-in-time snapshot of { title, body_md } encrypted client-side with a fresh random AES-256-GCM key placed in the URL #fragment (server stores only ciphertext and never sees the key; later edits, tags, and private attachments are not exposed).   
GitHub

Optional expiration (24h, 7d, 30d, Never).

Share management panel per note: list active links, copy link, revoke individual link.

Auto-revocation: Moving a note to Trash or deleting it permanently revokes all its share links. Expired links are pruned opportunistically on read/create (no paid cron needed).   
GitHub

Publish Folder / Notebook as a Public Site (/p/:slug):

Toggle "Publish folder" to generate a clean, read-only public site with a custom slug (e.g., [https://inotion.eu.cc/p/my-guide](https://inotion.eu.cc/p/my-guide)) displaying non-trashed, non-archived notes in that folder (and optionally direct sub-folders) with a sidebar TOC.

Explicit warning modal before publishing: "Published folder notes are readable by anyone with the link and decrypted by the server for public visitors."

Unpublish at any time (immediately returns 404).

Edge caching for public pages (decided 22/11): public site pages and public share reads are served with a long edge cache (`Cache-Control: public, max-age=86400`) so a popular notebook costs only a few Worker requests per day; the cache for a page is purged when its note or folder is updated/unpublished. Account-wide guard: when the Cloudflare account approaches ~80,000 requests/day, public routes (/s/*, /p/*, /api/public/*) are temporarily disabled (503) while the app itself keeps working — same guard pattern as webmail. Public sites are text/Markdown only in v1 (no attachments) and default to `<meta name="robots" content="noindex, nofollow">`. (EdgeEver reference, verified in code: public pages are served `private, no-store` with NO edge caching — every view hits the Worker — and EdgeEver survives only because each user deploys their own Fork on their own Cloudflare account. inotion is a single shared instance, so the edge cache + guard above are kept and go beyond EdgeEver.)

Hardened Public Rendering (Anti-XSS):

Public routes (/s/*, /p/*, /api/public/*) serve strict CSP (default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'), strip all raw HTML tags from Markdown, and allow only http:, https:, mailto: link schemes.

Files to Add / Change (ADD-ONLY)

Add:

migrations/0009_shares_and_publications.sql

worker/share.ts (authenticated CRUD for shares & folder publications + unauthenticated /api/public/share/:id and /api/public/site/:slug handlers)

worker/share.test.ts

src/components/ShareModal.tsx (create/list/revoke #fragment share links + Publish Folder toggle)

src/components/PublicShareView.tsx (decrypts #fragment snapshot in browser, renders sanitized Markdown)

src/components/PublicNotebookView.tsx (clean read-only docs/notebook layout for /p/:slug)

Extend (ADD-ONLY):

worker/notes.ts (revoke share links when trashed_at is set or note is permanently deleted)

worker/index.ts (mount /api/notes/:id/shares*, /api/folders/:id/publish, /api/public/*, and serve SPA shell with strict CSP on /s/* and /p/*)

src/api.ts & src/App.tsx (route /s/:id and /p/:slug before auth gate; add "Share" button in editor toolbar and "Publish" action on folders)

API Changes

POST /api/notes/:id/shares — body { ciphertext_b64, iv_b64, expires_at? } → 201 { id, expires_at, created_at }.

GET /api/notes/:id/shares — lists active links for note.

DELETE /api/shares/:shareId — revokes share link (ownership checked).

GET /api/public/share/:shareId — unauthenticated; returns { ciphertext_b64, iv_b64, created_at, expires_at } or 404 if revoked/expired.

PUT /api/folders/:id/publish — body { slug, include_subfolders? } → creates/updates publication; DELETE /api/folders/:id/publish → unpublishes.

GET /api/public/site/:slug — unauthenticated; returns folder title + list of { id, title, updated_at } + decrypted note bodies for notes in that published folder only (never trashed/archived, never attachments unless explicitly opted in).

Data Migrations (migrations/0009_shares_and_publications.sql)

CREATE TABLE note_shares (id TEXT PK, note_id TEXT NOT NULL FK notes(id) ON DELETE CASCADE, user_id TEXT NOT NULL, ciphertext_b64 TEXT NOT NULL, iv_b64 TEXT NOT NULL, expires_at INTEGER NULL, revoked_at INTEGER NULL, created_at INTEGER NOT NULL);

CREATE TABLE folder_publications (id TEXT PK, folder_id TEXT UNIQUE NOT NULL FK folders(id) ON DELETE CASCADE, user_id TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, include_subfolders INTEGER DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

Tests to Add

worker/share.test.ts: create/fetch/revoke share link, expired share returns 404, trashing note auto-revokes its share links, ownership isolation on revoke/publish, public site exposes ONLY active notes inside the published folder (never trashed/archived or sibling folders), unpublishing returns 404, CSP header present on public endpoints.

Acceptance Criteria

Opening /s/:id#<key> in an incognito browser decrypts and renders the note cleanly; omitting or tampering with #<key> fails gracefully.

Moving a note to Trash immediately invalidates its share links.

Publishing a folder renders a clean read-only site at /p/:slug, and unpublishing returns 404.

Crafted <script> / javascript: payloads in shared titles or bodies are neutralized.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

Attachments on published notebooks: DECIDED 22/11 — text/Markdown only for v1 (no attachments on public sites); a per-attachment "public" toggle may come later.

Search engine indexing: DECIDED 22/11 — public /p/:slug pages default to <meta name="robots" content="noindex, nofollow">.

Ready-to-Paste Implementation Prompt (Phase 9)
Markdown
Implement Phase 9 (Share Links & Public Notebook Publishing) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/notes.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Enforce strict HTML/Markdown sanitization and CSP on all public routes to prevent XSS.
TASKS:
1. Create `migrations/0009_shares_and_publications.sql` with `note_shares` and `folder_publications`.
2. Create `worker/share.ts` implementing authenticated share/publish endpoints and unauthenticated `GET /api/public/share/:shareId` and `GET /api/public/site/:slug` (strictly excluding trashed/archived notes and checking expiry/revocation). Serve public pages with long edge cache (`Cache-Control: public, max-age=86400`) and purge the cached page on note/folder update or unpublish; enforce the account-wide guard that disables public routes near ~80,000 requests/day.
3. Extend `worker/notes.ts` to auto-revoke `note_shares` when a note is trashed or permanently deleted. Mount routes in `worker/index.ts` with strict CSP headers on `/s/*`, `/p/*`, and `/api/public/*`.
4. Create `src/components/ShareModal.tsx` (client-side AES-256-GCM snapshot encryption placing key in `#fragment`, active links list, revoke, folder publish toggle), `src/components/PublicShareView.tsx`, and `src/components/PublicNotebookView.tsx`. Wire unauthenticated routes `/s/:id` and `/p/:slug` in `src/App.tsx`.
5. Add `worker/share.test.ts` covering share lifecycle, expiry, auto-revoke on trash, folder publish/unpublish isolation, CSP/sanitization, edge-cache headers + purge on update, and the account-wide public-routes guard.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 10 — Reminders & Web URL Clipper (In-App + Bookmarklet)
Goal

Deliver EdgeEver's capture and reminder workflows purely on the web (no browser extension, no paid email/SMS push service): per-note reminders with in-app/browser notifications + .ics calendar export, plus an SSRF-safe URL Clipper and one-click bookmarklet.

Exact Features

Reminders (Zero Paid Services):

Set optional remind_at (Unix ms) on any note via a date/time picker in the editor metadata bar.

New "Reminders" smart view in the sidebar showing Overdue, Today, and Upcoming reminders with badge count, snooze (+1h, Tomorrow), and "Mark Done" (reminder_done_at).

While the web tab is open, lightweight client-side timer triggers native Browser Notifications API (opt-in permission) + subtle in-app toast.

One-click "Add to Calendar (.ics)" download per reminder so users get native OS/phone alerts via Apple/Google Calendar for free without paid push infrastructure.

In-App URL Clipper & Zero-Extension Bookmarklet:

"Clip URL" button in toolbar (and hash route #/clip?url=...&title=...): user pastes any http(s):// URL (or clicks a draggable one-line JavaScript bookmarklet from any desktop browser tab).

Worker endpoint POST /api/clip fetches the target URL with strict SSRF protection (blocks private/loopback/link-local/RFC1918/IPv6 ULA/metadata IPs, allows only http:/https:, 5-second timeout, max 2 MB HTML response, max 3 redirects), extracts <title> and clean main article text/Markdown, and returns { title, body_md, source_url } for preview/save as a new note.

Files to Add / Change (ADD-ONLY)

Add:

migrations/0010_note_reminders.sql

worker/clipper.ts (SSRF-guarded URL fetcher + lightweight HTML-to-Markdown article extractor)

worker/clipper.test.ts

src/utils/ics.ts (RFC 5545 .ics generator for reminders)

src/components/ClipUrlModal.tsx (URL input, preview, folder selector, draggable bookmarklet generator)

Extend (ADD-ONLY):

worker/notes.ts (allow remind_at and reminder_done_at on PATCH /api/notes/:id, add view=reminders filter on GET /api/notes)

worker/index.ts (mount POST /api/clip)

src/api.ts & src/App.tsx (add Reminders smart view + client-side notification watcher + Clip URL modal + #/clip hash handler)

API Changes

PATCH /api/notes/:id — add optional fields remind_at: number | null, reminder_done_at: number | null.

GET /api/notes?view=reminders — returns non-trashed notes with remind_at IS NOT NULL AND reminder_done_at IS NULL, ordered by remind_at ASC.

POST /api/clip — authenticated; body { url } → returns { title, body_md, source_url } (does not auto-create note until user confirms, or optional save: true).

Data Migrations (migrations/0010_note_reminders.sql)

ALTER TABLE notes ADD COLUMN remind_at INTEGER NULL;

ALTER TABLE notes ADD COLUMN reminder_done_at INTEGER NULL;

CREATE INDEX idx_notes_user_remind ON notes(user_id, remind_at) WHERE remind_at IS NOT NULL AND reminder_done_at IS NULL;

Tests to Add

worker/clipper.test.ts: SSRF guard blocks localhost, 127.0.0.1, 169.254.169.254, 10.0.0.1, 192.168.1.1, [::1], file://, and oversized responses (>2 MB); valid mocked HTML converts headings, paragraphs, links, and strips <script>/<style>.

worker/notes.test.ts (add-only): setting/clearing remind_at, view=reminders ordering and filtering out done/trashed notes.

Acceptance Criteria

Setting a reminder appears in the Reminders view, triggers an in-app/browser notification when due while open, and exports a valid .ics file.

Clipping a public article URL (via modal or bookmarklet) creates clean, XSS-free Markdown with source attribution.

All SSRF test vectors are rejected with 400.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

Background push notifications when tab is closed: Web Push requires VAPID keys + a scheduled Worker Cron Trigger (which consumes free-tier cron/request quota and still behaves inconsistently on iOS Safari). Decision needed: confirm in-app Notification API + .ics export is sufficient for v1 without Web Push.

JS-rendered pages in Clipper: Worker fetch reads static HTML only (no headless browser on Workers free tier). For paywalled/SPA sites, the bookmarklet can alternatively pass window.getSelection() directly in the URL hash. Decision needed: include selected-text clipping in the bookmarklet? (Recommended: Yes.)

Ready-to-Paste Implementation Prompt (Phase 10)
Markdown
Implement Phase 10 (Reminders & SSRF-Safe Web URL Clipper + Bookmarklet) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/notes.ts`, `worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Zero paid services.
TASKS:
1. Create `migrations/0010_note_reminders.sql` adding `remind_at`, `reminder_done_at`, and partial index on `notes`.
2. Extend `worker/notes.ts` to support `remind_at` / `reminder_done_at` in `PATCH /api/notes/:id` and `view=reminders` in `GET /api/notes`.
3. Create `worker/clipper.ts` implementing `POST /api/clip` with strict SSRF protection (block private/loopback/metadata IPs and non-http(s) schemes, 5s timeout, 2 MB cap) and lightweight HTML-to-Markdown conversion stripping scripts/styles. Mount in `worker/index.ts`.
4. Create `src/utils/ics.ts` (RFC 5545 `.ics` export) and `src/components/ClipUrlModal.tsx` (URL clipper + draggable bookmarklet supporting URL + page selection). Wire Reminders view, due notification timer, and `#/clip` route into `src/api.ts` and `src/App.tsx`.
5. Add `worker/clipper.test.ts` (SSRF blocklist + HTML extraction) and extend `worker/notes.test.ts` for reminder queries.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.

Phase 11 — BYOK AI Assistant & PAT-Authenticated Remote MCP Server
Goal

Add EdgeEver's AI productivity and Remote MCP capabilities with zero paid vendor lock-in: a Bring-Your-Own-Key (BYOK) AI writing/Q&A assistant and a hardened, PAT-authenticated Remote MCP endpoint (/api/mcp) so external agents (Claude Code, Codex, Cursor) can safely read/write notes.   
Reddit

Exact Features

BYOK AI Assistant (Zero Hardcoded Paid Provider):

AI Settings panel where the user configures any OpenAI-compatible endpoint (e.g., OpenRouter free tier, Google Gemini OpenAI-compat endpoint, Groq free tier, or local Ollama tunnel), model name, and personal API key.

API key stored in browser localStorage by default (never touches D1/server unless user explicitly opts into encrypted server-side storage for cross-device sync).

Editor AI actions: Summarize, Fix grammar / Rewrite, Extract action items, and Ask AI about this note (streaming SSE response with "Insert below" / "Replace selection" buttons).

Personal Access Tokens (PATs) — NoteFlare Security Pattern:   
GitHub

Manage scoped API tokens in Settings (read, write, delete), optional expiration, last_used_at, and instant revocation.

256-bit random tokens prefixed ino_; only SHA-256 hash stored in D1. Raw token shown once on creation.

/api/mcp strictly requires Authorization: Bearer ino_... and never accepts browser session cookies (prevents CSRF even if CORS is enabled for MCP clients).

Remote MCP Server (POST /api/mcp — JSON-RPC 2.0 Streamable HTTP):

Exposes scoped tools matching user_id ownership: search_notes, get_note, list_folders, list_tags, create_note (requires write), update_note (requires write, requires revision), create_folder (requires write).

Stateless-first (decided 22/11): plain Worker POST JSON-RPC, no WebSocket, no Durable Objects by default — each call is one short request and nothing is held open while idle. Durable Objects (SQLite) only for resumable sessions if a client requires them. Per-PAT cap: 1,000 tool calls/day per token (429 beyond), with every MCP call written to a D1 audit log so quota burn is visible. (EdgeEver reference, verified in code: its MCP is exactly this shape — POST-only JSON-RPC on a plain Worker, GET /mcp returns 405, no DO, no sessions, Bearer token per request, tools/list cached 1 h client-side. The per-PAT daily cap + audit log are inotion additions beyond EdgeEver.)

Anti-XSS Hardening (CVE-2026-109557 mitigation): Strictly validate/normalize all MCP-supplied folder names, tag names, and note titles (strip control chars, enforce max lengths, never render unescaped HTML anywhere in the React UI).

One-click "Copy MCP Config JSON" snippet in Settings for Claude Code / Codex.

Files to Add / Change (ADD-ONLY)

Add:

migrations/0011_api_tokens.sql

worker/tokens.ts (PAT generation, SHA-256 hashing, scope/expiry verification, CRUD handlers)

worker/mcp.ts (JSON-RPC 2.0 MCP handler: initialize, tools/list, tools/call delegating to existing worker/notes.ts & worker/search.ts services)

worker/mcp.test.ts

src/components/AiAssistantPanel.tsx (BYOK config + streaming actions panel)

src/components/ApiTokensModal.tsx (PAT creation/revocation + MCP config snippet)

Extend (ADD-ONLY):

worker/index.ts (mount /api/tokens* and /api/mcp)

src/api.ts & src/App.tsx (add AI panel toggle in editor + "API / MCP" tab in Settings/Security modal)

API Changes

GET /api/tokens — lists PAT metadata (id, name, prefix, scopes, expires_at, last_used_at, created_at).

POST /api/tokens — body { name, scopes: ('read'|'write'|'delete')[], expires_at? } → 201 { token (shown once), metadata }.

DELETE /api/tokens/:id — revokes PAT.

POST /api/mcp — Bearer PAT only (rejects session cookie with 401); implements MCP JSON-RPC 2.0 (initialize, tools/list, tools/call).

Data Migrations (migrations/0011_api_tokens.sql)

CREATE TABLE api_tokens (id TEXT PK, user_id TEXT NOT NULL FK users(id), name TEXT NOT NULL, prefix TEXT NOT NULL, token_hash TEXT UNIQUE NOT NULL, scopes TEXT NOT NULL, expires_at INTEGER NULL, last_used_at INTEGER NULL, revoked_at INTEGER NULL, created_at INTEGER NOT NULL);

CREATE INDEX idx_api_tokens_user ON api_tokens(user_id, revoked_at);

Tests to Add

worker/mcp.test.ts: PAT creation stores only SHA-256 hash, /api/mcp rejects browser cookies (401) and invalid/expired/revoked tokens (401), read-only PAT blocked from create_note/update_note (403), search_notes returns only token owner's notes, create_note encrypts body_md (enc:v1:) and updates FTS, malicious HTML in MCP title/folder is stored safely and never bypasses length/validation rules.

Acceptance Criteria

User can configure a BYOK OpenAI-compatible endpoint and stream AI summaries/rewrites in the editor without any server-side paid key.

External MCP client using a read PAT can search and read notes, cannot mutate, and loses access immediately upon token revocation.

/api/mcp refuses browser cookie authentication.

npm test, npm run typecheck, npm run build pass cleanly.

Trade-offs & Open Decisions (For Owner Approval)

Browser-direct AI calls vs. Worker proxy: DECIDED 22/11 — start with browser-direct fetch (zero Worker cost), only add an optional /api/ai/proxy if a specific provider blocks CORS. (Matches EdgeEver: client-direct first, backend relay only as fallback.)

MCP delete_note scope: Allowing AI agents to permanently delete notes carries high blast radius. Decision needed: omit delete_note from MCP tools (allow soft-trash via update_note only)? (Recommended: Yes — soft-trash only via MCP.)

Ready-to-Paste Implementation Prompt (Phase 11)
Markdown
Implement Phase 11 (BYOK AI Assistant & PAT-Authenticated Remote MCP Server) for `inotion` in `/data/home/notes-app`.
RULES: ADD-ONLY edits to existing shared files (`worker/index.ts`, `src/api.ts`, `src/App.tsx`); never rewrite them from scratch. Do NOT deploy. Zero hardcoded paid AI providers. `/api/mcp` MUST reject browser session cookies and accept ONLY `Authorization: Bearer ino_...` PATs.
TASKS:
1. Create `migrations/0011_api_tokens.sql` with `api_tokens` table storing only `token_hash` (SHA-256).
2. Create `worker/tokens.ts` for PAT CRUD (`GET/POST /api/tokens`, `DELETE /api/tokens/:id`) and Bearer verification with scope (`read`/`write`) and expiry checks.
3. Create `worker/mcp.ts` implementing JSON-RPC 2.0 `POST /api/mcp` (`initialize`, `tools/list`, `tools/call`) exposing `search_notes`, `get_note`, `list_folders`, `list_tags`, `create_note`, `update_note`, and `create_folder` (soft-trash only, no permanent delete). Stateless-first: plain Worker handler, no WebSocket, no Durable Objects by default (DO SQLite only if a client needs resumable sessions). Enforce the per-PAT cap of 1,000 tool calls/day (429 beyond) and write every MCP call to a D1 audit log. Enforce strict input validation and `enc:v1:` encryption via existing note/search handlers. Mount routes in `worker/index.ts`.
4. Create `src/components/AiAssistantPanel.tsx` (BYOK OpenAI-compatible URL/model/key stored in `localStorage`, streaming Summarize/Rewrite/Action-Items/Q&A) and `src/components/ApiTokensModal.tsx` (PAT management + copyable MCP config JSON). Wire into `src/api.ts` and `src/App.tsx`.
5. Add `worker/mcp.test.ts` testing PAT hashing, cookie rejection on `/api/mcp`, scope enforcement, revocation, encrypted note creation via MCP, input validation, the per-PAT 1,000-calls/day cap (429 beyond), and the D1 audit log.
6. Run `npm test`, `npm run typecheck`, `npm run build` until all exit 0. Report real command outputs and changed file line counts.
7. STOP after reporting. Do NOT deploy and do NOT push to GitHub — the liaison pushes this phase to LangTieu/inotion-notes (private) via the LangTieu PAT from the VM (IB4 has no GitHub auth; Codex never pushes); pushing to main triggers GitHub Actions deploy (.github/workflows/deploy.yml) and the liaison live-smokes after the run is green; a phase counts as done only after the push is verified file-by-file (blob sha match) AND the Actions run is green AND the live smoke passes.
