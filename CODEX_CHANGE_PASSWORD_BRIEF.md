# BRIEF CHO CODEX CLI — Thêm tính năng đổi mật khẩu (inotion-notes)

## Bối cảnh
Fullstack đã tích hợp xong (INTEGRATION_DONE.md: test 19/19, typecheck 0, build 0). Henrry yêu cầu thêm: app PHẢI có đổi mật khẩu (hiện chỉ có login/logout/me, không có chỗ đổi mật khẩu). Tài khoản đầu tranbinhanbr01@gmail.com đã seed vào D1 (bảng users, hash PBKDF2).

## Việc phải làm
1. Backend — endpoint mới `POST /api/auth/change-password` (worker/):
   - Yêu cầu session hợp lệ (401 nếu chưa đăng nhập) + Origin hợp lệ như các mutation khác (403) + JSON ≤256KB (413).
   - Body {current_password, new_password}. Validate new_password: tối thiểu 8 ký tự (400 nếu không đạt). Verify current_password bằng verifyPassword có sẵn (worker/auth.ts) — sai trả 401.
   - Đổi thành công: hash mật khẩu mới bằng hashPassword có sẵn, UPDATE users SET password_hash, trả {ok:true}. Đồng thời revoke các session khác của user (sessions.revoked_at) — giữ lại session hiện tại; nếu việc revoke phức tạp thì ghi rõ trong marker (không tự bịa).
   - Không đổi schema (không migration mới). Không đọc/ghi credential thật vào repo.
2. Frontend — UI đổi mật khẩu (src/):
   - Thêm nút/link "Change password" ở footer tài khoản trong sidebar (cạnh Sign out), mở dialog dùng component ui/dialog có sẵn: 3 ô Current password / New password / Confirm new password, kiểm tra confirm khớp phía client, trạng thái loading/error/success (401 → "Current password is incorrect", 400 → thông báo lỗi validation, lỗi mạng → retryable).
   - Nối với endpoint thật qua lib/inotion/api.ts (thêm hàm changePassword). Không fake data, không mock.
3. Test: bổ sung test worker cho endpoint mới (đổi đúng, sai current_password → 401, chưa đăng nhập → 401, new_password ngắn → 400, session khác bị revoke). Chạy npm test + npm run typecheck + npm run build tới khi cả 3 đều exit 0.
4. Dừng ở marker CHANGE_PASSWORD_DONE.md (file list + wc -l + output 3 lệnh + điểm nóng nếu có).

## Luật cứng (ưu tiên cao nhất)
- Vướng gì thì DỪNG tại marker + ghi rõ cần gì, hỏi liaison, không tự bỏ qua/chuyển bước.
- TUYỆT ĐỐI KHÔNG xuất hiện tên miền/tên dự án cũ trong code/config.
- Không deploy, không migration remote. Không động vào D1 thật (chỉ test dùng adapter SQLite như các test hiện có).
