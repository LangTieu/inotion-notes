# Kế hoạch xây dựng Notes Web App v1

> Phạm vi: lập kế hoạch, chưa triển khai. App chỉ chạy trên web tại `inotion.eu.cc`. Tài nguyên Cloudflare phải độc lập với webmail: Worker `inotion-notes`, D1 `inotion-notes` riêng; file đính kèm lưu Backblaze B2 (tài khoản mới, bucket riêng). Không dùng chung database, bucket, cookie/session hay secret của webmail.

## 1. Kiến trúc tổng thể

```text
Trình duyệt (inotion.eu.cc; desktop/mobile web)
  ├─ tải giao diện React/Vite từ static assets của Worker
  └─ /api/* ──> Cloudflare Worker (TypeScript; REST handlers)
                    ├─ D1: tài khoản, phiên, note, thư mục, tag,
                    │      metadata attachment, chỉ mục FTS5
                    └─ Backblaze B2 (tài khoản mới): bytes ảnh và tệp đính kèm
```

- Chọn Workers + D1 + B2: hợp với web-only, truy cập nhiều thiết bị qua một API trung tâm; không cần máy chủ luôn chạy. D1 chứa dữ liệu có cấu trúc và FTS5, B2 giữ binary lớn để không phình database. Static assets và API có thể cùng Worker.
- Tách hẳn Cloudflare bindings và tên tài nguyên khỏi webmail; domain custom riêng. Lấy cấu trúc triển khai webmail làm mẫu: `wrangler.jsonc` khai báo assets `./dist`, route custom domain, binding D1 và thư mục migrations; B2 qua 4 secret Worker (`B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME`, `B2_S3_ENDPOINT`) như webmail R3; `package.json` có `build`, `test` (Vitest), `typecheck` (tsc) và deploy build trước khi phát hành. Luồng deploy dự kiến là `npm run deploy`, tuyệt đối không chạy bare `wrangler deploy` vì có thể đưa frontend cũ lên.
- Tổ chức mã dự kiến: `src/` React UI, `worker/index.ts` điều phối Worker/API, `worker/auth.ts`, `worker/notes.ts`, `worker/attachments.ts`, `worker/search.ts`; `migrations/NNNN_*.sql`; `wrangler.jsonc`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.worker.json`. Có thể dùng Hono cho route gọn như NoteFlare, nhưng xác nhận dependency trong phase 1; webmail hiện dùng router `fetch` trong `worker/index.ts` và **không** có Hono trong dependencies, nên không cần ép thêm framework.
- So với Docker + Postgres (ví dụ AppFlowy/AFFiNE): Workers/D1/B2 giảm vận hành VM, TLS, backup và cập nhật database; phù hợp yêu cầu free tier. Đổi lại có giới hạn CPU, số request/row read/write và D1 là SQLite serverless, không thích hợp tự giả định workload không giới hạn. Postgres/Docker cho quyền kiểm soát và mở rộng database linh hoạt hơn nhưng cần host, storage và chăm sóc dịch vụ; không phù hợp mục tiêu Cloudflare free-only hiện tại.

## 2. Bài học từ repo tham khảo

**NoteFlare (MIT)**

- Học cách giới hạn sản phẩm vào UI dạng thẻ kiểu Keep, Markdown, pin/labels/archive/trash, thao tác hàng loạt đơn giản; README mô tả React + Tailwind + shadcn/ui, API Hono nhỏ, migrations SQL thuần, Worker + D1 và R2 tùy chọn cho attachment.
- Học việc tách metadata tệp khỏi bytes, API ổn định, backup/export có thể bổ sung sau, và đồng bộ tự động qua server để thay đổi từ thiết bị khác xuất hiện khi mở/refresh.
- **Không lấy E2E encryption làm mặc định v1**: yêu cầu chủ app cần quản trị tài khoản email/password và tìm kiếm server-side. Mã hóa E2E sẽ khiến server không đọc được nội dung để FTS, thêm quản lý khóa/recovery và khiến mất passphrase có thể mất dữ liệu. Thay vào đó bảo vệ bằng HTTPS, hash mật khẩu, session an toàn; encryption-at-rest theo mẫu webmail (webmail hiện có `worker/crypto.ts` và key bí mật riêng). Thiết kế mã hóa/search đã chốt 22/11 theo đúng cách webmail đang chạy live, xem mục 8.5.
- **Không lấy** offline-first, merge dòng kiểu Git, passkey, recovery code, share link, PAT/SDK/CLI, nhắc lịch, import nhiều định dạng và tính năng đa ngôn ngữ cho v1: chúng tăng đáng kể bề mặt kiểm thử; phạm vi v1 chỉ cần CRUD, tổ chức, search, sync online và file.

**EdgeEver (AGPL-3.0)**

- Học ý tưởng phân loại note/folder/tags, metadata attachment trong D1 và object trong R2; README có sync đa thiết bị, editor phong phú và đề cập giới hạn Cloudflare. Chỉ lấy các ý nhỏ có thể đặt sau: xem trước ảnh/tệp, hiển thị trạng thái lưu, keyboard shortcut cơ bản.
- **Không lấy** giao diện ba pane kiểu Evernote làm mặc định: nhiều chrome và điều hướng hơn mức cần cho thao tác ghi nhanh; v1 ưu tiên danh sách/thẻ Keep gọn, responsive.
- **Không lấy** Docker path: yêu cầu chỉ Cloudflare, Docker tạo nhánh runtime/deploy và vận hành không cần thiết.
- **Không lấy** AGPL code hoặc copy cấu trúc triển khai: repo chỉ dùng để tham khảo ý tưởng, không sao chép mã. Không đưa mind map, web clipper, MCP/ACP, AI sidebar, plugin marketplace, desktop/mobile native, đồng bộ offline hay tích hợp provider vào v1; mỗi món cần editor/API/UX và kiểm thử riêng, có nguy cơ vượt free-tier.

**Giới hạn khảo sát nguồn:** lệnh clone bằng `git clone --depth 1` thất bại vì `Could not resolve host: github.com`, nên `refs/noteflare` và `refs/edgeever` chưa có working tree. Phân tích repo dựa trên README/repository pages truy cập qua web, không phải rà soát từng file migrations của hai repo. Hãy chạy lại clone trong môi trường có mạng trước khi bắt đầu implementation nếu cần xác minh chi tiết nội bộ.

## 3. D1 schema đề xuất

Tất cả bảng ứng dụng nên có `user_id` để lọc quyền sở hữu theo session, dù v1 ban đầu có thể chỉ một vài email. Dùng UUID TEXT cho id, thời gian Unix milliseconds UTC. Khóa ngoại bật; xóa note/tag/folder cần quy tắc rõ để không còn metadata mồ côi.

| Bảng | Cột chính |
|---|---|
| `users` | `id TEXT PK`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `created_at INTEGER`, `updated_at INTEGER`, `disabled_at INTEGER NULL` |
| `sessions` | `id_hash TEXT PK` (chỉ lưu hash token), `user_id TEXT FK`, `created_at INTEGER`, `expires_at INTEGER`, `last_seen_at INTEGER`, `revoked_at INTEGER NULL`; index `(user_id, expires_at)` |
| `folders` | `id TEXT PK`, `user_id TEXT FK`, `name TEXT NOT NULL`, `parent_id TEXT NULL FK folders`, `position INTEGER`, `created_at INTEGER`, `updated_at INTEGER`; unique `(user_id,parent_id,name)` |
| `notes` | `id TEXT PK`, `user_id TEXT FK`, `folder_id TEXT NULL FK`, `title TEXT NOT NULL DEFAULT ''`, `body_md TEXT NOT NULL DEFAULT ''`, `is_pinned INTEGER DEFAULT 0`, `archived_at INTEGER NULL`, `trashed_at INTEGER NULL`, `created_at INTEGER`, `updated_at INTEGER`, `revision INTEGER DEFAULT 1`; index `(user_id,trashed_at,archived_at,is_pinned,updated_at)` |
| `tags` | `id TEXT PK`, `user_id TEXT FK`, `name TEXT NOT NULL`, `created_at INTEGER`; unique `(user_id,name)` |
| `note_tags` | `note_id TEXT FK`, `tag_id TEXT FK`, composite PK `(note_id,tag_id)`; index `tag_id` |
| `attachments` | `id TEXT PK`, `user_id TEXT FK`, `note_id TEXT FK`, `object_key TEXT UNIQUE NOT NULL`, `filename TEXT NOT NULL`, `content_type TEXT NOT NULL`, `byte_size INTEGER NOT NULL`, `created_at INTEGER`; index `(note_id,created_at)` |
| `notes_fts` | virtual FTS5 `(title, content='notes', content_rowid='rowid', tokenize='unicode61')` — CHỈ title (plaintext); body_md mã hoá nên KHÔNG đưa vào FTS (xem §8.5); triggers insert/update/delete đồng bộ title. Nếu muốn FTS nối bằng ID TEXT, duy trì bảng FTS contentless hoặc dùng `rowid` ánh xạ; quyết định/kiểm thử migration ở phase 1. |
| `login_attempts` | `key_hash TEXT PK` (hash email/IP, không lưu IP thô nếu không cần), `attempts INTEGER`, `window_started_at INTEGER`, dùng rate limit đăng nhập và dọn định kỳ |

Mọi endpoint note/folder/tag/attachment phải kiểm tra `user_id` trong câu query; không tin ID do client gửi. Dùng migration append-only và index cho truy vấn thường dùng. Không lưu bytes attachment trong D1. Với xóa note: chuyển vào trash; xóa vĩnh viễn mới xóa metadata và object B2. Cần xử lý nếu xóa B2 lỗi (retry/cleanup queue), tránh mất dấu object.

## 4. API REST dự kiến

Yêu cầu JSON, phản hồi lỗi thống nhất `{ "error": "..." }`, cookie session HttpOnly/Secure/SameSite=Lax, kiểm tra Origin/CSRF cho mutation. Tất cả route dưới đây ngoại trừ auth/config đều yêu cầu session.

| Method + route | Mục đích |
|---|---|
| `GET /api/config` | Trả cấu hình công khai tối thiểu, không trả secret hoặc allowed-email list |
| `POST /api/auth/login` | Đăng nhập email/password; chỉ email thuộc `ALLOWED_EMAILS`; rate limit và trả cookie |
| `POST /api/auth/logout` | Thu hồi session, xóa cookie |
| `GET /api/auth/me` | Kiểm tra session và lấy email hiện tại |
| `GET /api/notes?view=all\|pinned\|archive\|trash&folder=&tag=&q=&cursor=` | Danh sách note theo bộ lọc, phân trang; query `q` dùng FTS |
| `POST /api/notes` | Tạo note Markdown |
| `GET /api/notes/:id` | Đọc một note cùng folder/tag và metadata attachment |
| `PATCH /api/notes/:id` | Cập nhật title/body/folder/tags, pin/archive/trash; có revision để báo xung đột ghi đồng thời |
| `DELETE /api/notes/:id` | Xóa vĩnh viễn note (trash dùng PATCH) và xóa attachment B2 |
| `POST /api/notes/:id/restore` | Khôi phục note khỏi trash/archive về trạng thái thường |
| `GET /api/folders` | Danh sách cây folder |
| `POST /api/folders` | Tạo folder |
| `PATCH /api/folders/:id` | Đổi tên/parent/vị trí, chặn vòng lặp cây |
| `DELETE /api/folders/:id` | Xóa folder; yêu cầu quy tắc đưa note con về root hoặc từ chối nếu còn note |
| `GET /api/tags` | Danh sách tag và số note |
| `POST /api/tags` | Tạo tag |
| `PATCH /api/tags/:id` | Đổi tên tag |
| `DELETE /api/tags/:id` | Xóa tag và quan hệ `note_tags` |
| `POST /api/notes/:id/attachments` | Nhận upload multipart, kiểm tra size/type, ghi object B2 rồi metadata D1; rollback object nếu DB insert lỗi |
| `GET /api/attachments/:id` | Kiểm tra quyền sở hữu rồi stream object từ B2 với content-type an toàn và `Content-Disposition` |
| `DELETE /api/attachments/:id` | Xóa object B2 và metadata (idempotent) |

Không cần WebSocket cho sync v1: D1 là nguồn sự thật; autosave có debounce, revision/`updated_at`, tải lại danh sách khi focus hoặc điều hướng, và báo xung đột khi hai client cùng sửa revision cũ. Điều này cho sync liên thiết bị mà không cần daemon hoặc dịch vụ trả phí. Có thể thêm polling nhẹ nếu cần cập nhật màn hình đang mở.

## 5. Màn hình UI v1

1. **Đăng nhập**: email/password, lỗi gọn, chỉ tài khoản trong allowlist được vào.
2. **Notes**: thanh tìm kiếm, filter All/Pinned/Archive/Trash, thẻ note, nút tạo nhanh; responsive theo chiều rộng màn hình.
3. **Folder**: sidebar gọn cho danh sách folder; chọn folder lọc danh sách, tạo/đổi tên/xóa.
4. **Tags**: bộ lọc tag và quản lý tag trong sidebar/menu, có thể gắn/bỏ nhiều tag trong editor.
5. **Editor note**: title, nội dung Markdown, preview/toggle preview, chọn folder/tag, pin/archive/trash, trạng thái đã lưu/đang lưu, upload và danh sách attachment.
6. **Trash**: restore hoặc xóa vĩnh viễn; hiển thị xác nhận trước thao tác không thể hoàn tác.
7. **Trạng thái phiên**: menu tài khoản với email và logout; không cần màn hình cài đặt lớn trong v1.

## 6. Milestones (4 phase)

1. **Nền tảng, auth, deploy skeleton** — tạo project theo cấu trúc webmail, cấu hình binding riêng, migration users/sessions/login_attempts, allowlist `ALLOWED_EMAILS`, cookie/session hash, test auth/rate limit, typecheck và build. Deliverable kiểm chứng: `npm test`, `npm run typecheck`, `npm run build`; sau khi được duyệt triển khai bằng `npm run deploy`, kiểm tra `https://inotion.eu.cc/api/config` và login/logout live. Không deploy trong giai đoạn lập plan này.
2. **CRUD Markdown + tổ chức + search** — notes/folders/tags, FTS5 triggers, pin/archive/trash, UI list/editor. Deliverable: test quyền truy cập và FTS, migration local, typecheck/build; deploy qua `npm run deploy`, live check tạo/sửa/xóa mềm note, folder/tag và tìm từ khóa.
3. **Attachment B2 + hardening** — B2 đã chuẩn bị xong 22/11 (tài khoản tranbinhanbr01@gmail.com, bucket Private `inotion-notes-attachments`, key `notes-attachments` giới hạn theo bucket, đã kiểm live qua `b2_authorize_account`; xem mục 8.6) — phase này chỉ còn nạp 4 secret vào Worker; upload/download/delete, MIME/size validation, CSRF/Origin, quota guard, cleanup lỗi orphan, revision conflict. Deliverable: test B2 (mock S3), ownership và attachment lifecycle; deploy, live check upload ảnh/tệp, mở/xóa, xác nhận note khác không truy cập được.
4. **Ổn định v1 + nghiệm thu** — kiểm tra mobile web, nhiều thiết bị/session, backup/export tối thiểu nếu owner yêu cầu, accessibility, giới hạn request/size, metrics/log sampling. Deliverable: full Vitest, `tsc`, build, checklist smoke test; deploy bằng `npm run deploy`, live check domain, auth, CRUD/search/attachments và persistence sau logout/đăng nhập trên thiết bị khác.

## 7. Ngân sách Cloudflare free tier

Hạn mức tra ngày 2026-11-21 từ Cloudflare docs: Workers Free 100.000 request/ngày, 10 ms CPU/request; D1 Free 5 triệu row-read/ngày, 100.000 row-write/ngày, 500 MB/database (tài khoản tổng 5 GB), tối đa 10 database; Backblaze B2 Free 10 GB/tài khoản, tải về qua Cloudflare miễn phí (Bandwidth Alliance). Đây là hạn mức theo dịch vụ/account, cần kiểm tra dashboard vì có thể chia sẻ với project khác. D1 Free queries có thể lỗi khi vượt quota ngày.

**Ước tính cho một app cá nhân/nhóm nhỏ (giả định, không phải đo đạc):** 100 phiên/ngày × 50 API calls = 5.000 Worker requests/ngày (5% quota); trung bình 5 row reads/API = 25.000/ngày (<0,5% quota); 500 lần ghi/ngày × khoảng 4 hàng tính cả index/quan hệ = 2.000 row writes/ngày (2%); 100 attachment uploads/tháng + 2.000 reads/downloads; giữ 2.000 ảnh/tệp trung bình 2 MB = 4 GB (40% quota B2 free). D1 lưu 10.000 note × trung bình 10 KB = khoảng 100 MB trước overhead FTS/index, dưới 500 MB nhưng cần đo thực tế.

Giới hạn phía ứng dụng đề nghị: 25 MB/note (tổng đính kèm, như webmail 25MB/mail), cảnh báo B2 tại 7 GB, dashboard kiểm tra D1 rows read/write và Worker requests hàng tuần trong giai đoạn đầu. Không bật polling dày; query có phân trang/index, không trả toàn bộ note; không đặt quota lưu trữ như thể tài nguyên vô hạn. Không thêm AI, cron, email/SMS hoặc dịch vụ ngoài cần phí cho v1. Dùng một B2 bucket (tài khoản mới) và một D1 riêng của app; tách khỏi quota/namespace webmail.

## 8. Quyết định đã Chốt (22/11)

1. **Mã hóa (ĐÃ CHỐT — như webmail):** encryption-at-rest kiểu webmail (AES-GCM, theo mẫu `worker/crypto.ts`, key trong Worker secret); không E2E, không plaintext. FTS làm theo cách webmail đang làm.

2. **Allowlist (ĐÃ CHỐT):** tài khoản đầu là tranbinhanbr01@gmail.com, seed qua `ALLOWED_EMAILS` như webmail; thêm email sau này qua Worker secret/env, không để password trong repo.

3. **Đính kèm (ĐÃ CHỐT — như webmail):** 25 MB/note (tổng đính kèm, như webmail 25MB/mail), lưu B2 tài khoản mới đăng ký bằng tranbinhanbr01@gmail.com; cảnh báo khi B2 chạm 7 GB.

4. **Lưu trữ (ĐÃ CHỐT):** đính kèm dùng Backblaze B2 tài khoản mới (email tranbinhanbr01@gmail.com), bucket Private + application key giới hạn theo bucket, như webmail R3; không dùng R2 cho đính kèm v1.

5. **Mã hóa + search (ĐÃ CHỐT 22/11 — đúng cách webmail đang chạy live):** `title` lưu plaintext để FTS5 match được tiêu đề; `body_md` mã hóa AES-GCM (`enc:v1:`, mẫu `worker/crypto.ts`, key trong Worker secret `ENCRYPTION_KEY`) lúc lưu; search = FTS MATCH (title) + quét bù bằng cách giải mã từng body mã hóa trong phạm vi user_id + cùng filter folder/tag như query list, khớp trong Worker, khử trùng với kết quả FTS — y hệt `/api/search` của webmail (`worker/index.ts`: FTS MATCH rồi `text_body LIKE 'enc:v1:%'` + `decryptText`). Không lưu snippet plaintext; snippet suy ra lúc đọc từ body đã giải mã. Bằng chứng: webmail mã hóa `text_body` lúc lưu (`worker/index.ts:2290` `encryptText`) và search live PASS 21/11.

6. **Hạ tầng B2 đã xong (22/11, đã kiểm live):** tài khoản tranbinhanbr01@gmail.com (ID f0511f6e1018, US East); bucket Private **`inotion-notes-attachments`** (ID 0f902511d13f060ea1200118 — tên khác plan gốc, dùng tên thật này); key **`notes-attachments`** (keyID 005f0511f6e10180000000001, giới hạn theo bucket, Read and Write + List All Bucket Names); endpoint `s3.us-east-005.backblazeb2.com`. Kiểm live 08:29 22/11 qua `b2_authorize_account`: đúng account + đúng bucket. Secret đầy đủ (kể cả application key) lưu 0600 tại `~/.b2_notes_attachments.json` (VM; sync sang IB4 khi build) — KHÔNG ghi giá trị secret vào plan/repo. 4 secret Worker: `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_NAME=inotion-notes-attachments`, `B2_S3_ENDPOINT=s3.us-east-005.backblazeb2.com`.

## 9. Definition of Done v1

- App hoạt động tại `https://inotion.eu.cc` trên browser desktop và mobile web; không có native app.
- Worker, D1 là tài nguyên riêng, tên `inotion-notes*`; B2 bucket riêng tài khoản mới (`inotion-notes-attachments`); xác nhận không binding/chia sẻ resource webmail.
- Email trong allowlist đăng nhập bằng password hash; email ngoài allowlist bị từ chối; session cookie an toàn, logout thu hồi session, rate limit login.
- Tạo/đọc/sửa/xóa note Markdown; tạo/đổi/xóa folder và tag; filter pin/archive/trash; restore và xóa vĩnh viễn hoạt động.
- Search title qua FTS (index title cập nhật khi insert/update/delete) + body qua giải mã-quét bù, khử trùng với kết quả FTS; truy vấn chỉ trả note của user hiện tại.
- Upload, xem/tải, xóa ảnh và file qua B2; metadata trong D1; ownership, giới hạn kích thước và kiểu file được kiểm tra.
- Autosave và thay đổi dữ liệu đồng bộ khi đăng nhập cùng tài khoản trên thiết bị khác; revision conflict không âm thầm ghi đè.
- Test Vitest cho auth/authorization, CRUD, FTS, folders/tags, attachment lifecycle và conflict; `npm run typecheck` + `npm run build` sạch.
- Deploy chỉ qua `npm run deploy` (build trước); live smoke test bằng domain thật thành công; xác nhận dashboard usage còn dưới free quota theo tải nghiệm thu.
- Không phụ thuộc dịch vụ trả phí/premium, và không có tính năng ngoài phạm vi v1 bắt buộc để ghi/tìm/sync note.

## Nguồn đã kiểm tra

- NoteFlare README và kiến trúc/tính năng: https://github.com/homielab/noteflare và https://raw.githubusercontent.com/homielab/noteflare/main/README.md
- EdgeEver README và feature matrix: https://github.com/tianma-if/edgeever и https://raw.githubusercontent.com/tianma-if/edgeever/main/README.md
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing/limits: https://developers.cloudflare.com/d1/platform/pricing/ và https://developers.cloudflare.com/d1/platform/limits/
- Cloudflare R2 pricing (đã tham khảo lúc viết plan gốc; v1 hiện dùng B2 thay R2): https://developers.cloudflare.com/r2/pricing/
- Webmail được đọc local: `/data/home/webmail-r3-codex/wrangler.jsonc`, `package.json`, `worker/index.ts`, `migrations/0002_users.sql`, `migrations/0008_search_fts.sql`, `migrations/0016_backup.sql`.

PLAN DONE
