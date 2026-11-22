# BRIEF CHO CODEX CLI — Tích hợp frontend v0 + backend inotion-notes (fullstack)

## Bối cảnh
Backend đã xong Phase 1–4 (PHASE1–4_DONE.md): Worker + D1 inotion-notes + B2, test 19/19, typecheck 0, build 0.
Frontend mới do v0 sinh ra từ prompt thiết kế (design/v0-prompt.md), nằm tại design/v0-output/ (27 file, 204K, 4.647 dòng code — danh sách bên dưới, đã kiểm trên VM).
Frontend hiện tại trong src/ chỉ là bản cơ bản — THAY TOÀN BỘ bằng code v0, rồi nối với backend thật.

## File v0-output (đã kiểm: 0 chuỗi cấm, 0 fake/mock data, chỉ gọi API thật)
- `app/globals.css` (216), `app/layout.tsx` (33), `app/page.tsx` (5)
- `components/inotion/app.tsx` (72), `workspace.tsx` (529), `sidebar.tsx` (457), `note-list.tsx` (330), `note-editor.tsx` (607), `search-bar.tsx` (88), `sign-in-screen.tsx` (127), `state-views.tsx` (116), `attachments-panel.tsx` (237), `conflict-dialog.tsx` (80), `confirm-dialog.tsx` (91), `folder-dialog.tsx` (195), `tag-dialog.tsx` (109), `tag-picker.tsx` (174), `markdown-preview.tsx` (35), `mobile-nav.tsx` (63)
- `lib/inotion/api.ts` (345), `route.ts` (216), `types.ts` (100), `use-notes-list.ts` (169), `use-attachments.ts` (108), `folders.ts` (81), `format.ts` (64)
- `package.json` (v0 template Next.js — CHỈ THAM KHẢO, không dùng nguyên)
- `chat.json` (link chat/demo v0 — chỉ để xem, không phải code)

## Việc phải làm
1. Liệt kê file trong design/v0-output/, đối chiếu với src/ hiện tại.
2. Thay src/ bằng code v0. LƯU Ý QUAN TRỌNG: v0 output có hình dạng Next.js (thư mục app/, script next) nhưng dự án này chạy Vite (index.html + vite.config.ts + src/) — phải thích ứng: giữ nguyên entry Vite + tsconfig, lấy components/lib của v0, bỏ wrapper Next-only, KHÔNG đưa Next.js vào dự án. v0 dùng nhiều dep mới (Radix UI, react-markdown + remark-gfm, swr, lucide-react, date-fns, zod…) KHÔNG có trong node_modules hiện tại; npm install trên IB4 FAIL EAI_AGAIN — nếu cần dep mới thì DỪNG + HỎI LIAISON (liaison sẽ cài trên VM rồi sync), KHÔNG tự chạy npm install vòng vo, KHÔNG tự bịa lockfile, KHÔNG tự viết lại component chỉ để né dep khi chưa hỏi.
3. Nối mọi màn hình với API thật (hợp đồng bên dưới — KHÔNG bịa endpoint, KHÔNG fake data, KHÔNG mock data trong code production; test dùng mock/fixture trong file test như trước).
4. Giữ nguyên worker/, migrations/, wrangler.jsonc, package-lock.json. KHÔNG sửa migration 0003/0004. KHÔNG deploy, KHÔNG migration remote, KHÔNG đọc/ghi credential thật vào repo.
5. Chạy npm test, npm run typecheck, npm run build tới khi cả 3 đều exit 0. Bổ sung test cho code mới khi cần (ưu tiên test gọi API thật qua adapter SQLite như notes.test.ts).
6. Dừng ở marker INTEGRATION_DONE.md (file list + wc -l + output 3 lệnh + những gì đổi so với v0 gốc + điểm nóng nếu có).

## Hợp đồng API (nguyên văn, đã verify từ code)
- `GET /api/config` → `{"app":"inotion-notes","auth":"email-password"}`
- `POST /api/auth/login` body `{email, password}` → `{email}` + cookie session (429 khi sai nhiều). `GET /api/auth/me` → `{email}` hoặc 401. `POST /api/auth/logout` → `{ok:true}`.
- Mutations (POST/PATCH/DELETE) yêu cầu Origin hợp lệ (403 nếu sai), giới hạn body JSON 256KB, multipart 26.5MB (413 nếu quá).
- `GET /api/notes?view=all|archived|trashed&folder=<id>&tag=<id>&q=<query>&cursor=<offset>` — 50 notes/trang, cursor phân trang. `q` = search: title FTS + quét body đã giải mã, theo đúng view đang mở.
- `POST /api/notes` body `{title (tối đa 500 ký tự), body_md (tối đa 200000 ký tự), folder_id?}` → 201 + note. `GET /api/notes/:id` → note.
- `PATCH /api/notes/:id` body `{revision (BẮT BUỘC, phải khớp — sai trả 409 Revision conflict), title?, body_md?, folder_id?, is_pinned?, archived_at?, trashed_at?, tag_ids? (tối đa 50)}` → note, revision tăng 1.
- `DELETE /api/notes/:id` → `{ok:true}` (xóa vĩnh viễn, kèm xóa attachments trên B2 trước — lỗi trả 502). `POST /api/notes/:id/restore` → bỏ trash + bỏ archive, revision tăng 1.
- Note: `{id, folder_id, title, body_md (API trả plaintext đã giải mã), is_pinned, archived_at, trashed_at, created_at, updated_at, revision, tags:[{id,name}]}`
- `GET /api/folders` → `[{id, name, parent_id, position, created_at, updated_at}]`. `POST /api/folders {name, parent_id?}` → 201. `PATCH /api/folders/:id {name, parent_id?}` (chống cycle, giới hạn lồng 100). `DELETE /api/folders/:id` → notes về null, folder con về parent null.
- `GET /api/tags` → `[{id, name, created_at, note_count}]`. `POST /api/tags {name}` → 201. `PATCH /api/tags/:id {name}`, `DELETE /api/tags/:id` → `{ok:true}`.
- `GET /api/notes/:id/attachments` (danh sách), `POST /api/notes/:id/attachments` (multipart upload), `GET /api/attachments/:id` (download), `DELETE /api/attachments/:id`. Attachment: `{id, filename, content_type, byte_size, created_at}`. Giới hạn 25MB/note.
- Export: phía client tự gọi API liệt kê toàn bộ notes (active + archived + trashed) + folders + tags rồi xuất JSON — không có endpoint export riêng.

## Luật cứng (ưu tiên cao nhất — như brief chính)
- Vướng gì (thiếu file, API không khớp, test fail không sửa được, thiếu dep): DỪNG NGAY tại INTEGRATION_DONE.md, ghi rõ vướng gì + đã thử gì + cần gì. KHÔNG tự bỏ qua, KHÔNG tự bịa workaround, KHÔNG lặng lẽ làm tiếp. Liaison xử lý rồi cho chạy lại.
- TUYỆT ĐỐI KHÔNG xuất hiện tên miền/tên dự án cũ trong code/config (liaison grep kiểm tra sau).
- Không deploy tới khi anh duyệt.

## BỔ SUNG — DEPENDENCY ĐÃ ĐƯỢC LIAISON XỬ LÝ (22/11, sau lượt dừng BLOCKED)
Liaison đã cài + sync xong, TIẾP TỤC TÍCH HỢP (ghi đè marker INTEGRATION_DONE.md cũ bằng kết quả mới):
- package.json + package-lock.json đã cập nhật (17 package mới, sha đã đối chiếu khớp VM↔IB4); node_modules đã có đủ: lucide-react, react-markdown, remark-gfm, swr, tailwindcss, tw-animate-css, @tailwindcss/vite, @radix-ui/react-alert-dialog, @radix-ui/react-dialog, @radix-ui/react-dropdown-menu, @radix-ui/react-popover, @radix-ui/react-progress, @radix-ui/react-select, @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge.
- UI support files đã có sẵn (liaison viết theo mẫu shadcn chuẩn): src/components/ui/{button, input, dialog, alert-dialog, dropdown-menu, popover, progress, select, sheet, skeleton, spinner}.tsx + src/lib/utils.ts (cn). Khi thay src/ bằng code v0: GIỮ LẠI các file này, KHÔNG ghi đè/xóa chúng.
- Việc còn lại trong lượt này: thêm alias @/ → ./src vào tsconfig.json (paths) + vite.config.ts (resolve.alias); thêm @tailwindcss/vite plugin vào vite.config.ts; dùng design/v0-output/app/globals.css làm stylesheet chính (đối chiếu với src/styles.css + src/notes.css hiện tại — chỉ giữ CSS cũ khi còn dùng, ghi rõ trong marker); nối API thật; chạy npm test + npm run typecheck + npm run build tới khi cả 3 đều exit 0; dừng ở INTEGRATION_DONE.md.
- Vẫn giữ luật dừng + hỏi liaison khi vướng (đặc biệt: thiếu dep khác, xung đột Tailwind với CSS cũ, lỗi build không sửa được).
