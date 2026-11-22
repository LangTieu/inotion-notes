# Deploy checklist — inotion-notes (refreshed after v0 fullstack integration, 12:40 22/11)

Status: PREPARATION ONLY. No deploy, no secret, no migration was run while writing this.
Deploy needs Henrry's explicit approval (per brief). Do NOT run step 5 without it.

## Current verified state (13:00 22/11, checked live on IB4)
- Frontend: v0 UI integrated into Vite (5.595 dòng src/), globals.css (Tailwind v4) is the only stylesheet; old styles.css/notes.css are dead (not imported).
- Change-password feature DONE + verified (13:00): POST /api/auth/change-password (verify current, min 8 chars, revoke other sessions) + dialog in sidebar footer; npm test 23/23 (19 + 4 new), typecheck 0, build 0 (JS 653.89 kB).
- npm test 26/26 (7 files), npm run typecheck exit 0, npm run build exit 0 (dist JS 653.89 kB, gzip 200.51 kB; CSS 197.52 kB). Build warns chunk JS > 500 kB (future code-split, not a blocker). 26 = 23 cũ + 3 test SigV4 mới (worker/b2.test.ts, chống hồi quy lỗi ký B2 ngày 22/11).
- Remote D1 `inotion-notes` (d765bb72-58b0-4dbe-8ec9-8d68ab4dbe88): all migrations applied — `npx wrangler d1 migrations list --remote` → "No migrations to apply!" (0001–0004 done).
- First account tranbinhanbr01@gmail.com SEEDED + VERIFIED (12:57): password hash PBKDF2 stored in D1 users table, verifyPassword returns true. Password value was passed only via exec stdin, never written to any file/log/chat record.
- All 6 Worker secrets SET + verified via `wrangler secret list` (13:00): B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_S3_ENDPOINT, ENCRYPTION_KEY, ALLOWED_EMAILS. ENCRYPTION_KEY backup 0600 on VM (~/.inotion_encryption_key) + IB4 (/data/home/.inotion_encryption_key), sha256 match. Plaintext `vars.ALLOWED_EMAILS` REMOVED from wrangler.jsonc.
- package.json/lockfile include the 17 integration deps (lucide-react, react-markdown, remark-gfm, swr, tailwindcss 4.3.5, @tailwindcss/vite, 7 Radix, cva/clsx/tailwind-merge); node_modules on IB4 verified present. A fresh machine needs `npm ci` first.
- Worker code verified: view values are `all|pinned|archive|trash` (NOT archived/trashed); the UI adapter maps archived→archive, trashed→trash. PATCH folder/tag returns {ok:true}; the UI re-reads the list after PATCH.
- 0 forbidden strings in src/ + worker/ (grep 13:00).

## Still open before deploy
- (None — all pre-deploy items resolved. Only Henrry's deploy approval remains.)

## Steps (after Henrry approves deployment)
1. Confirm the isolated resources: Cloudflare account, Worker `inotion-notes`, D1 `inotion-notes`, custom domain `inotion.eu.cc`, private B2 bucket `inotion-notes-attachments`.
2. Load the six values into Worker secrets with `npx wrangler secret put <NAME>` (enter each value only at Wrangler's prompt): B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_S3_ENDPOINT, ENCRYPTION_KEY, ALLOWED_EMAILS. B2 values come from the protected credential file; never paste values into shell history, the repo, or logs. **B2_S3_ENDPOINT PHẢI là URL đầy đủ có `https://` (vd `https://s3.us-east-005.backblazeb2.com`)** — file credential chỉ lưu hostname trần, nạp nguyên vậy thì `new URL()` trong worker/b2.ts ném lỗi → upload attachment 502 (dính live 22/11, đã sửa secret + deploy lại).
3. Verify remote migrations: `npx wrangler d1 migrations list inotion-notes --remote` (expect "No migrations to apply!"). Apply only if something is pending, and only after approval.
4. Re-run `npm test`, `npm run typecheck`, `npm run build` immediately before publish; all three must be exit 0.
5. After explicit publish approval, run `npm run deploy` (the script builds first). NEVER `wrangler deploy` directly.
6. Live smoke test https://inotion.eu.cc/api/config; log in/out; create and edit a folder, tag, and note; verify title + decrypted-body search; verify note body_md is encrypted in D1; upload, view, and delete an allowed attachment; test a two-session edit conflict (409 dialog); verify trash/restore/permanent deletion; log out and back in to confirm persistence. Verify a different account cannot read the note or attachment.

## Deploy 13:0x 22/11 — LIVE (Henrry duyệt "Deploy luôn đi e" 13:03)
- Deploy lần 1 (Version 103c43b1): test + typecheck + build pass, Worker live tại inotion.eu.cc. Smoke phase 1: 10/10 PASS; phase 2: 11/14 — **attachment upload 502** ("Attachment storage is unavailable"), còn lại PASS. D1 kiểm live: body_md = `enc:v1:...` (mã hoá thật), title plaintext.
- Gốc lỗi 502 (2 lớp): (1) secret B2_S3_ENDPOINT nạp dạng hostname trần `s3.us-east-005.backblazeb2.com` → `new URL()` ném lỗi; đã sửa secret thành `https://s3.us-east-005.backblazeb2.com` + deploy lại (Version d2bc6e0a) — vẫn 502. (2) **Bug ký SigV4 trong worker/b2.ts**: `canonicalHeaders` gắn `host:` lên ĐẦU rồi mới sort các header còn lại — khi PUT có `content-type`, `host` phải đứng SAU `content-type` theo thứ tự alphabet; B2 trả 403 "Signature validation failed". Đã chứng minh bằng repro local (PUT 403 → sửa thứ tự → PUT 200, DELETE 204). Fix: sort `host` CÙNG các header khác trong `signedRequest` (worker/b2.ts dòng 31-34) + thêm worker/b2.test.ts (3 test: PUT/GET ký đúng theo reference signer độc lập, DELETE chịu 404). Test 26/26 (7 file), typecheck 0, build 0.
- Deploy lần 3 (Version 5e602cb5-9673-43f6-95ec-db904958840c): smoke FULL PASS — phase 1: 10/10, phase 2: 14/14 (upload attachment 201, download 200, delete 200, conflict 409, trash/restore/xoá vĩnh viễn, tài khoản khác 403, logout → me 401). Dữ liệu smoke đã dọn sạch (note/folder/tag test đã xoá).

## Fix trang trắng sau đăng nhập — 13:1x 22/11 (Version 680065fd-6c45-4dcb-aacf-e74471a80e80)
- Anh báo: đăng nhập xong vào `#/notes` chỉ thấy trang trắng. Gốc: GET /api/folders và /api/tags trả NGUYÊN object `.all()` của D1 (`{success,meta,results}`) thay vì mảng trần; UI (`listFolders`/`listTags` → `buildFolderTree(folders)` gọi `folders.map`) ném `folders.map is not a function` → React crash → trắng trang. GET /api/notes/:id/attachments cũng trả envelope `{attachments:[...]}` trong khi UI chờ mảng trần (`useAttachments` gọi `data.length`/`.reduce` → crash khi mở note). API notes thì đúng shape nên smoke test API đậu mà UI vẫn trắng — bài học: smoke API không thay được kiểm render.
- Fix Worker (3 dòng): notes.ts GET /api/folders + GET /api/tags trả `(await ... .all()).results||[]`; attachments.ts GET list trả `result.results||[]`. Test: sửa notes.test.ts:97 (`.data.results[0]` → `.data[0]`) + assert mảng trần cho folders/tags; sửa attachments.test.ts:29 (`.attachments` → mảng trần). Test 26/26, typecheck 0 (sau khi sửa 2 lỗi type trong b2.test.ts do `Uint8Array<ArrayBufferLike>` — cast `as BufferSource` / type param `Uint8Array<ArrayBuffer>`). Kiểm live: /api/folders, /api/tags, /api/notes/:id/attachments đều trả `[]` (mảng trần). Anh tải lại trang là thấy giao diện.

## Bỏ dấu `#` khỏi URL — LIVE 13:3x 22/11 (cả Notes + webmail)
- Codex đổi routing sang history (pathname): Notes `/notes`, `/pinned`, `/search?...`; webmail `/inbox`, `/sent`, `/compose?...`. Link cũ có `#` tự chuyển sang URL sạch.
- Verify: Notes test 29/29 (8 file, gồm route.test.ts mới — ban đầu test này KHÔNG chạy vì vitest config chỉ include `worker/**/*.test.ts`, đã sửa include thêm `src/**/*.test.ts`, lộ 1 test fail do `PopStateEvent` thiếu trong môi trường node, đã sửa test stub global đó), typecheck 0, build 0; webmail test 357/357, typecheck 0, build 0. Deploy: Notes Worker `d8cfdcc5`, webmail Worker `53dc7b46`.
- Kiểm live 19/19 PASS (mọi đường dẫn sạch trả 200, bundle không còn `#/...`). Smoke Notes sau deploy: 10/10 + 14/14.
