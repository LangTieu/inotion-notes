BRIEF CHO CODEX CLI — TRIỂN KHAI TOÀN BỘ 4 PHASE: inotion-notes (inotion.eu.cc)

## BỔ SUNG — LUẬT DỪNG + HỎI LIAISON (22/11, sau Phase 1 — LUẬT CỨNG, ƯU TIÊN CAO NHẤT)
- Khi vướng bất cứ gì (thiếu credential/token, npm install fail, registry không với tới, API lỗi, không tạo được D1, test fail không sửa được, thiếu file/thiếu thông tin): DỪNG NGAY lượt chạy tại DONE marker của phase đang làm. Ghi rõ vào marker: vướng gì, đã thử gì (kèm output lệnh thật), cần gì để tiếp tục.
- KHÔNG tự bỏ qua điểm vướng, KHÔNG tự bịa workaround, KHÔNG lặng lẽ chuyển sang phase sau. KHÔNG deploy, KHÔNG migration remote khi chưa được liaison cho phép rõ ràng.
- Liaison (người điều phối, không phải Henrry) sẽ xử lý điểm vướng rồi cho chạy lại. Mọi phase chỉ bắt đầu khi phase trước đã hết điểm nóng.
- Trạng thái hiện tại (10:56 22/11, liaison đã xử lý): D1 inotion-notes ĐÃ TẠO (id d765bb72-58b0-4dbe-8ec9-8d68ab4dbe88, wrangler.jsonc đã điền id thật), đã apply remote 0001+0002+0003. Migration 0003_notes_folders_tags_fts.sql đã tồn tại trên disk và đã apply — KHÔNG sửa file 0003 nữa; sai sót thì viết migration mới 0004+. package-lock.json thật đã có trên disk (sync từ VM).
1. Bối cảnh thực thi & Hiện trạng thư mục

Thư mục làm việc: /data/home/notes-app (máy IB4, chạy với --sandbox workspace-write).

Tài liệu kế hoạch (chỉ đọc): /data/home/notes-app/NOTES_PLAN.md.

Trạng thái hiện tại: Toàn bộ scaffold cũ trong /data/home/notes-app đã bị xóa sạch để xây dựng lại từ đầu, khắc phục dứt điểm 4 thiếu sót của bản cũ:

Auth phải hoàn chỉnh ngay ở Phase 1 (POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me, ALLOWED_EMAILS, worker/auth.ts, session hash, rate limit, đủ bộ test auth).

Phải có React UI thật trong src/, index.html là entry Vite hoàn chỉnh (tuyệt đối không để placeholder trống).

package.json phải có script deploy (build trước rồi mới deploy: npm run build && wrangler deploy); wrangler.jsonc phải có custom domain route inotion.eu.cc và cấu hình D1 inotion-notes (cố gắng tạo/lấy database_id thật nếu môi trường cho phép; nếu bị chặn mạng/auth thì ghi rõ lỗi thật, tuyệt đối không bịa database_id).

Quản lý node_modules & package-lock.json trung thực trong điều kiện mất mạng npm (xem mục 2).

Mã nguồn tham khảo local (BẮT BUỘC ĐỌC TRƯỚC KHI CODE — KHÔNG ĐOÁN KIẾN TRÚC):

/data/home/notes-app/refs/noteflare (MIT): đọc cấu trúc UI dạng thẻ kiểu Keep, Markdown, pin/labels/archive/trash, tách metadata attachment khỏi binary, migrations SQL. Không lấy: E2E encryption, offline-first, merge kiểu Git, passkey, recovery code, share link, PAT/SDK/CLI, nhắc lịch, import đa định dạng, đa ngôn ngữ.

/data/home/notes-app/refs/edgeever (AGPL-3.0): CHỈ tham khảo ý tưởng (tổ chức folder/tag, preview ảnh/tệp, trạng thái đang lưu/đã lưu, phím tắt cơ bản). TUYỆT ĐỐI KHÔNG sao chép mã nguồn hay cấu trúc file từ repo AGPL này. Không lấy UI 3-pane mặc định, Docker, mind map, web clipper, MCP/ACP, AI sidebar, plugin, native app, offline sync.

/data/home/webmail-r3-codex (CHỈ ĐỌC): đọc để bám sát chuẩn kỹ thuật đang chạy live của dự án cùng chủ: wrangler.jsonc, package.json, worker/crypto.ts (enc:v1: AES-GCM), worker/index.ts (router fetch thuần + cơ chế /api/search FTS5 kết hợp giải mã quét bù), module B2 S3 R3, migrations/0002_users.sql, migrations/0008_search_fts.sql, migrations/0016_backup.sql.

2. Môi trường mạng & Cách xử lý node_modules (QUAN TRỌNG)

Trên IB4 hiện tại, npm install đang FAIL với lỗi EAI_AGAIN (không phân giải được registry.npmjs.org).

Quy tắc bắt buộc:

Kiểm tra trước danh sách gói đang có sẵn tại /data/home/webmail-r3-codex/package.json và /data/home/webmail-r3-codex/node_modules. Chỉ khai báo và sử dụng các dependency đã có sẵn trong node_modules của webmail (không ép thêm Hono hay thư viện lạ nếu chưa có sẵn; dùng router fetch thuần trong worker/index.ts giống webmail).

Để chạy kiểm thử, typecheck và build tại /data/home/notes-app, sử dụng node_modules chỉ-đọc tại /data/home/webmail-r3-codex/node_modules (ví dụ cấu hình NODE_PATH=/data/home/webmail-r3-codex/node_modules, PATH="/data/home/webmail-r3-codex/node_modules/.bin:$PATH", hoặc symlink chỉ-đọc tạm khi chạy test/build nếu không ghi vào thư mục webmail).

Tuyệt đối không bịa là npm install đã thành công hoặc tự chế package-lock.json giả. Nếu npm install vẫn lỗi EAI_AGAIN, ghi rõ tình trạng offline + output lệnh thật vào PHASE1_DONE.md, đồng thời đảm bảo package.json khớp phiên bản với webmail để khi có mạng chỉ cần chạy npm install là tạo được package-lock.json và node_modules riêng ngay.

3. Luật cứng (BẮT BUỘC TUÂN THỦ XUYÊN SUỐT CẢ 4 PHASE)

Hạ tầng độc lập hoàn toàn với webmail:

Worker: inotion-notes

D1 database: inotion-notes

Backblaze B2 bucket: inotion-notes-attachments (Private, tài khoản mới tranbinhanbr01@gmail.com).

KHÔNG dùng chung database, bucket, tên cookie/session (dùng tên riêng như notes_session), ENCRYPTION_KEY, hay bất kỳ secret/binding nào của webmail.

Domain duy nhất: inotion.eu.cc.

TUYỆT ĐỐI KHÔNG xuất hiện tên-miền-dự-án-cũ dưới bất kỳ hình thức nào (không route, không redirect, không link, không Origin/CORS, không placeholder).

Phạm vi chỉnh sửa & Add-only:

Chỉ tạo/sửa file bên trong /data/home/notes-app.

KHÔNG sửa, xóa, hay ghi vào bất kỳ file nào trong /data/home/webmail-r3-codex, /data/home/notes-app/refs/, hay /data/home/notes-app/NOTES_PLAN.md.

Từ Phase 2 trở đi, mọi thay đổi trên file dùng chung (worker/index.ts, src/App.tsx, src/api.ts, package.json, wrangler.jsonc) phải theo nguyên tắc add-only (mở rộng có kiểm soát, không xóa viết lại từ đầu).

CẤM DEPLOY:

KHÔNG chạy wrangler deploy, npm run deploy, hoặc bất kỳ lệnh publish / migrate lên remote Cloudflare nào. Deploy chỉ thực hiện sau khi Henrry duyệt xong toàn bộ.

An toàn bí mật (Secrets Hygiene):

KHÔNG ghi secret, API key, B2 application key, ENCRYPTION_KEY, hay mật khẩu thật vào repo, code, migration, test hay log.

Thông tin B2 đã chuẩn bị xong (đã kiểm live 22/11): tài khoản tranbinhanbr01@gmail.com (ID f0511f6e1018), bucket Private inotion-notes-attachments (ID 0f902511d13f060ea1200118), key notes-attachments (keyID 005f0511f6e10180000000001), endpoint s3.us-east-005.backblazeb2.com. File credential 0600 nằm tại ~/.b2_notes_attachments.json trên IB4 — KHÔNG in nội dung file này ra log và KHÔNG copy secret vào repo.

4 Worker secret cho B2 ở Phase 3: B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, B2_S3_ENDPOINT (cùng ENCRYPTION_KEY, ALLOWED_EMAILS).

Tài khoản seed đầu tiên: tranbinhanbr01@gmail.com (kiểm soát qua ALLOWED_EMAILS). Migration seed chỉ dùng mật khẩu test giả định, ghi rõ trong PHASE1_DONE.md.

Trung thực tuyệt đối:

Mọi tuyên bố thành công (test pass, typecheck pass, build pass, số dòng file, tạo D1) phải kèm output lệnh thật. Không bịa URL, ID, số lượng test hay kết quả.

4. Kiến trúc & Quyết định kỹ thuật đã Chốt (Bắt buộc áp dụng)
4.1. Cấu trúc mã nguồn

Frontend React/Vite: index.html, src/main.tsx, src/App.tsx, src/api.ts, cùng các component gọn trong src/ (login, sidebar folders/tags, note list/cards, markdown editor + preview, attachments, trash).

Worker TypeScript: worker/index.ts (router chính + static assets fallback), worker/auth.ts, worker/crypto.ts, worker/notes.ts, worker/search.ts, worker/attachments.ts, worker/b2.ts (S3-compatible signing bằng WebCrypto).

Migrations append-only: migrations/0001_*.sql, 0002_*.sql, ...

Cấu hình: package.json, wrangler.jsonc (assets ./dist, route inotion.eu.cc, D1 binding inotion-notes, migrations_dir: "migrations"), vite.config.ts, vitest.config.ts, tsconfig.json, tsconfig.worker.json.

4.2. Schema D1 (UUID TEXT PK, Unix ms UTC, bật foreign keys, mọi bảng ứng dụng có user_id)

users: id, email UNIQUE NOT NULL, password_hash NOT NULL, created_at, updated_at, disabled_at NULL

sessions: id_hash PK (chỉ lưu SHA-256 của token), user_id FK, created_at, expires_at, last_seen_at, revoked_at NULL; index (user_id, expires_at)

login_attempts: key_hash PK, attempts, window_started_at

folders: id, user_id FK, name NOT NULL, parent_id NULL FK folders, position, created_at, updated_at; unique (user_id, parent_id, name)

notes: id, user_id FK, folder_id NULL FK, title NOT NULL DEFAULT '', body_md NOT NULL DEFAULT '', is_pinned INTEGER DEFAULT 0, archived_at NULL, trashed_at NULL, created_at, updated_at, revision INTEGER DEFAULT 1; index (user_id, trashed_at, archived_at, is_pinned, updated_at)

tags: id, user_id FK, name NOT NULL, created_at; unique (user_id, name)

note_tags: note_id FK, tag_id FK, PK (note_id, tag_id); index tag_id

attachments: id, user_id FK, note_id FK, object_key UNIQUE NOT NULL, filename NOT NULL, content_type NOT NULL, byte_size INTEGER NOT NULL, created_at; index (note_id, created_at)

notes_fts: virtual FTS5 (title, content='notes', content_rowid='rowid', tokenize='unicode61') — CHỈ index title (plaintext) + triggers AFTER INSERT / UPDATE / DELETE đồng bộ title. Không đưa body_md vào FTS.

4.3. Mã hóa Encryption-at-Rest & Search (§8.1 & §8.5 — ĐÃ CHỐT)

title lưu plaintext để FTS5 match tiêu đề.

body_md mã hóa AES-GCM theo đúng mẫu worker/crypto.ts của webmail (prefix enc:v1:, key lấy từ Worker secret ENCRYPTION_KEY). Không lưu snippet plaintext trong DB; snippet chỉ được suy ra lúc đọc sau khi giải mã body_md.

Cơ chế Search (GET /api/notes?q=...):

Truy vấn FTS5 MATCH trên notes_fts (khớp title), lọc theo user_id + bộ lọc view/folder/tag hiện hành.

Quét bù các bản ghi có body_md LIKE 'enc:v1:%' trong cùng phạm vi user_id + bộ lọc view/folder/tag, giải mã body_md trong Worker bằng decryptText, kiểm tra khớp từ khóa q (case-insensitive).

Gộp và khử trùng theo note.id, giữ đúng thứ tự và phân trang.

4.4. Chuẩn API & Bảo mật (§4 & §7)

Request/Response JSON, lỗi thống nhất { "error": "..." }.

Mọi endpoint trừ GET /api/config và POST /api/auth/login đều yêu cầu session hợp lệ; mọi truy vấn DB đều phải lọc user_id = session.user_id.

Cookie session: HttpOnly; Secure; SameSite=Lax; Path=/.

Kiểm tra Origin/CSRF cho mọi mutation (POST, PATCH, DELETE): chỉ chấp nhận [https://inotion.eu.cc](https://inotion.eu.cc) (và origin dev/test cục bộ khi chạy local/Vitest).

Giới hạn ứng dụng: tổng đính kèm tối đa 25 MB / note; cảnh báo quota B2 khi tổng byte_size chạm 7 GB; danh sách có phân trang (cursor), không bật polling dày, không dùng dịch vụ trả phí/AI/cron.

5. Kế hoạch thực thi chi tiết theo 4 Phase

Thực hiện tuần tự từ Phase 1 đến Phase 4. Kết thúc mỗi phase phải chạy đủ kiểm tra và ghi DONE marker tương ứng trước khi chuyển sang phase kế tiếp.

PHASE 1: Nền tảng, Auth đầy đủ & UI Shell

Mục tiêu: Khởi tạo dự án sạch, cấu hình Worker/D1/Vite/Vitest đầy đủ, triển khai Auth hoàn chỉnh và giao diện React đăng nhập/shell thật (không placeholder).

Danh sách file tạo mới:

Cấu hình: package.json (có dev, build, test, typecheck, deploy: "npm run build && wrangler deploy"), wrangler.jsonc (name inotion-notes, route inotion.eu.cc, assets ./dist, D1 binding inotion-notes, migrations_dir: "migrations"), vite.config.ts, vitest.config.ts, tsconfig.json, tsconfig.worker.json, .gitignore.

Migrations:

migrations/0001_users_sessions.sql (users, sessions, login_attempts + indexes).

migrations/0002_seed_test_user.sql (INSERT OR IGNORE tài khoản test tranbinhanbr01@gmail.com với password_hash PBKDF2 hợp lệ).

Backend:

worker/auth.ts: WebCrypto PBKDF2 + random salt (constant-time compare), sinh session token ngẫu nhiên, hash SHA-256 lưu id_hash, cookie helper (notes_session, HttpOnly; Secure; SameSite=Lax; Path=/), kiểm tra ALLOWED_EMAILS, rate limit 5 lần sai / 15 phút qua login_attempts (trả 429), helper lấy session hiện tại & kiểm tra Origin/CSRF.

worker/index.ts: router fetch hỗ trợ GET /api/config (chỉ trả cấu hình công khai tối thiểu, không lộ secret hay ALLOWED_EMAILS), POST /api/auth/login (ngoài allowlist 403, sai password 401, quá 5 lần sai/15p 429, đúng trả 200 + cookie), POST /api/auth/logout (thu hồi revoked_at, xóa cookie), GET /api/auth/me (trả { email }, không session trả 401), fallback static assets.

Frontend React thật:

index.html, src/main.tsx, src/api.ts, src/App.tsx, src/styles.css (hoặc CSS sạch): màn hình Login hoạt động gọi /api/auth/login, trạng thái phiên gọi /api/auth/me, thanh topbar hiển thị email + nút Logout gọi /api/auth/logout, shell chờ danh sách Notes.

Tests:

worker/index.test.ts (smoke test /api/config).

worker/auth.test.ts: test đủ tối thiểu 6 kịch bản (login đúng + verify DB chỉ lưu id_hash, sai password 401, ngoài allowlist 403, /api/auth/me không cookie 401, logout thu hồi session + cookie cũ bị 401, rate limit 5 lần sai → lần 6 bị 429).

Kiểm tra & D1:

Kiểm tra xem D1 inotion-notes có thể tạo/tra cứu qua wrangler hay không; nếu bị lỗi mạng/auth thì giữ placeholder rõ ràng (ví dụ ghi chú rõ lý do) và báo cáo trung thực trong PHASE1_DONE.md, không bịa ID.

Chạy npm test, npm run typecheck, npm run build bằng node_modules webmail cho tới khi tất cả exit code 0.

DONE Marker: Tạo /data/home/notes-app/PHASE1_DONE.md ghi: danh sách file + wc -l, output thật của npm test, npm run typecheck, npm run build, ghi chú trung thực về node_modules/package-lock.json/database_id, mật khẩu TEST đã seed trong 0002, và dòng cuối chính xác: PHASE1 DONE.

PHASE 2: CRUD Markdown, Folders/Tags, Mã hóa body_md, FTS5 Search & UI Notes đầy đủ

Mục tiêu: Hoàn thiện toàn bộ luồng ghi chú, tổ chức, mã hóa nội dung lúc lưu, tìm kiếm FTS5 + giải mã quét bù, và giao diện quản lý Notes đầy đủ.

Danh sách file tạo/mở rộng (add-only trên file cũ):

Migrations:

migrations/0003_notes_folders_tags_fts.sql: tạo folders, notes, tags, note_tags, notes_fts (chỉ title, tokenize='unicode61') và 3 triggers AFTER INSERT / UPDATE / DELETE đồng bộ notes_fts.

Backend:

worker/crypto.ts: AES-GCM encrypt/decrypt định dạng enc:v1: dùng ENCRYPTION_KEY (theo mẫu webmail, dùng WebCrypto thuần).

worker/notes.ts: CRUD notes (GET /api/notes?view=all|pinned|archive|trash&folder=&tag=&q=&cursor=, POST /api/notes, GET /api/notes/:id, PATCH /api/notes/:id, DELETE /api/notes/:id, POST /api/notes/:id/restore), CRUD folders (GET/POST/PATCH/DELETE /api/folders, chặn vòng lặp parent_id, xóa folder đưa note con về root folder_id = NULL), CRUD tags (GET/POST/PATCH/DELETE /api/tags kèm đếm số note, xóa tag dọn note_tags). Mã hóa body_md trước khi ghi D1, giải mã khi đọc, kiểm tra revision khi PATCH (trả 409 nếu xung đột revision).

worker/search.ts: tìm kiếm FTS5 MATCH trên title + quét bù body_md LIKE 'enc:v1:%' giải mã trong Worker theo cùng user_id và bộ lọc, khử trùng theo id, sinh snippet động từ nội dung đã giải mã.

worker/index.ts (add-only): gắn các route notes/folders/tags.

Frontend (src/):

Mở rộng src/api.ts, src/App.tsx và thêm component UI (Keep-style responsive): thanh search, filter All / Pinned / Archive / Trash, danh sách thẻ note (hiển thị title, snippet, pin, tags, thời gian), sidebar Folders (tạo/đổi tên/xóa/lọc), quản lý Tags (tạo/đổi tên/xóa/lọc/gắn nhiều tag trong editor), Editor Markdown (title, textarea Markdown + toggle preview an toàn không XSS, chọn folder/tags, pin/archive/trash, autosave có debounce + trạng thái Đang lưu/Đã lưu, cảnh báo khi xung đột revision 409), màn hình Trash có nút Restore và Xóa vĩnh viễn kèm hộp thoại xác nhận.

Tests:

worker/notes.test.ts: CRUD notes, ownership isolation (user B không đọc/sửa/xóa được note user A), pin/archive/trash/restore, revision conflict 409, folders (gồm chặn cycle + xóa folder đưa note về root), tags & note_tags.

worker/search.test.ts: xác nhận body_md lưu trong DB ở dạng enc:v1:... (không plaintext), FTS5 match title sau insert/update/delete, search match từ khóa chỉ có trong body_md đã mã hóa, khử trùng khi khớp cả title và body, không rò rỉ dữ liệu giữa các user.

Kiểm tra: Chạy npm test, npm run typecheck, npm run build đến khi xanh 100%.

DONE Marker: Tạo /data/home/notes-app/PHASE2_DONE.md ghi danh sách file tạo/sửa + wc -l, output thật của test/typecheck/build, và dòng cuối chính xác: PHASE2 DONE.

PHASE 3: Attachment Backblaze B2 & Hardening

Mục tiêu: Triển khai lưu trữ ảnh/tệp đính kèm qua Backblaze B2 S3-compatible API, tách metadata vào D1, bảo vệ ownership/quota/CSRF/MIME và dọn rác khi lỗi.

Danh sách file tạo/mở rộng (add-only trên file cũ):

Migrations:

migrations/0004_attachments.sql: bảng attachments + index (note_id, created_at) và (user_id, created_at).

Backend:

worker/b2.ts: AWS Signature V4 (WebCrypto thuần, không thêm SDK nặng) cho PUT, GET, DELETE object tới B2_S3_ENDPOINT / B2_BUCKET_NAME dùng B2_KEY_ID, B2_APPLICATION_KEY.

worker/attachments.ts:

POST /api/notes/:id/attachments: nhận multipart/form-data, kiểm tra ownership note, kiểm tra MIME/extension an toàn, kiểm tra giới hạn 25 MB tổng đính kèm/note, kiểm tra cảnh báo quota B2 ở ngưỡng 7 GB (trả cờ cảnh báo quotaWarning khi vượt ngưỡng), sinh object_key có prefix user_id/note_id/uuid, upload lên B2 trước rồi insert D1; nếu insert D1 lỗi thì rollback xóa object trên B2.

GET /api/attachments/:id: kiểm tra ownership theo user_id, stream object từ B2 với header an toàn (X-Content-Type-Options: nosniff, Content-Disposition phù hợp — inline cho ảnh an toàn, attachment cho file khác để chống XSS).

DELETE /api/attachments/:id: kiểm tra ownership, xóa object B2 + xóa metadata D1 (idempotent); xử lý lỗi xóa B2 rõ ràng để tránh orphan im lặng.

Cập nhật DELETE /api/notes/:id (xóa vĩnh viễn) trong worker/notes.ts (add-only) để xóa toàn bộ attachment B2 + metadata liên quan.

Hardening trên toàn Worker (worker/auth.ts, worker/index.ts): kiểm tra Origin/CSRF chặt chẽ cho mọi mutation, giới hạn kích thước JSON body, security headers cơ bản, xử lý revision conflict đầy đủ.

Frontend (src/):

Mở rộng editor để upload ảnh/tệp đính kèm, hiển thị danh sách attachment (kèm dung lượng, preview ảnh inline, link tải xuống, nút xóa), hiển thị lỗi vượt 25 MB/note và cảnh báo nhẹ nếu B2 chạm ngưỡng 7 GB.

Tests:

worker/attachments.test.ts: mock B2 S3 fetch, test đầy đủ lifecycle (upload → GET stream → DELETE idempotent), rollback B2 khi D1 insert lỗi, chặn vượt 25 MB/note, cảnh báo 7 GB, ownership isolation (user khác không upload/xem/xóa attachment của note), xóa vĩnh viễn note dọn kèm attachment B2, CSRF/Origin rejection trên mutation.

Kiểm tra: Chạy npm test, npm run typecheck, npm run build đến khi xanh 100%.

DONE Marker: Tạo /data/home/notes-app/PHASE3_DONE.md ghi danh sách file tạo/sửa + wc -l, output thật của test/typecheck/build, và dòng cuối chính xác: PHASE3 DONE.

PHASE 4: Ổn định v1, Mobile/Multi-device, Accessibility, Export & Nghiệm thu

Mục tiêu: Hoàn thiện trải nghiệm desktop + mobile web, đồng bộ đa thiết bị đáng tin cậy, export dữ liệu tối thiểu, tối ưu accessibility/phím tắt và hoàn tất kiểm định toàn diện v1.

Danh sách hạng mục thực hiện (add-only):

Mobile & Responsive UI: rà soát layout cho màn hình nhỏ (sidebar folder/tag đóng mở dạng drawer, editor dễ thao tác trên mobile web, nút tạo nhanh, không tràn ngang).

Đồng bộ đa thiết bị & Xung đột: tự động refresh danh sách khi tab lấy lại focus/chuyển view (không polling dày); khi gặp 409 Conflict do thiết bị khác vừa sửa, hiển thị lựa chọn rõ ràng cho người dùng (tải bản mới nhất hoặc ghi đè có chủ đích — không âm thầm mất dữ liệu).

Accessibility & Phím tắt cơ bản: hỗ trợ keyboard navigation, aria-label cho nút icon, phím tắt cơ bản (ví dụ Ctrl/Cmd+K focus search, Ctrl/Cmd+S lưu ngay) không xung đột trình duyệt.

Export tối thiểu: endpoint hoặc chức năng phía client xuất toàn bộ notes đã giải mã của user hiện tại ra file JSON/Markdown (chỉ user đang đăng nhập, tôn trọng ownership).

Giới hạn & Logging an toàn: đảm bảo log không bao giờ in password, cookie, ENCRYPTION_KEY, body_md plaintext hay B2 secret; giới hạn page size/request size hợp lý để bảo vệ free tier.

Test tổng hợp & Checklist nghiệm thu: bổ sung worker/e2e.test.ts (luồng end-to-end đầy đủ: login → tạo folder/tag → tạo note mã hóa → sửa/autosave → xung đột 2 session → search title + body → upload/xem/xóa attachment → trash/restore → xóa vĩnh viễn → logout → đăng nhập lại xác nhận persistence). Tạo checklist smoke test live cho giai đoạn sau khi Henrry duyệt deploy (kiểm tra [https://inotion.eu.cc/api/config](https://inotion.eu.cc/api/config), auth, CRUD, search, B2, multi-device).

Kiểm tra cuối cùng:

Chạy toàn bộ bộ test Vitest (npm test), npm run typecheck, npm run build — tất cả phải xanh 100%.

Chạy grep kiểm tra an toàn trong /data/home/notes-app:

Không có chuỗi tên-miền-dự-án-cũ trong mã nguồn/cấu hình của app (trừ NOTES_PLAN.md nếu có và refs/).

Không có secret/key thật nào lọt vào repo.

DONE Marker: Tạo /data/home/notes-app/PHASE4_DONE.md ghi:

Danh sách toàn bộ file tạo/sửa ở Phase 4 + wc -l.

Output thật của npm test, npm run typecheck, npm run build, và kết quả grep kiểm tra không có tên-miền-dự-án-cũ / không lộ secret.

Checklist các bước deploy thủ công để Henrry duyệt và chạy sau (nạp 4 secret B2 + ENCRYPTION_KEY + ALLOWED_EMAILS, tạo/gắn D1 nếu chưa làm được do offline, chạy migration remote, npm run deploy, live smoke test tại [https://inotion.eu.cc](https://inotion.eu.cc)).

Dòng cuối cùng chính xác: PHASE4 DONE.