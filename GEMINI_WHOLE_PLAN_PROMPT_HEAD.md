Bạn là người viết prompt cho một coding agent (Codex CLI trên máy Linux). Hãy viết một bản brief HOÀN CHỈNH, tự chứa, để giao cho Codex thực hiện TOÀN BỘ kế hoạch dưới đây (cả 4 phase). Chỉ viết brief, không viết code.

BỐI CẢNH THỰC THI (Codex cần biết):
- Dự án: app ghi chú web (Notes) tại /data/home/notes-app trên máy IB4. Codex chạy với --sandbox workspace-write, prompt đưa qua stdin.
- Plan đầy đủ nằm ở dưới (file NOTES_PLAN.md, đã sync lên IB4). Code tham khảo 2 repo đã có sẵn local tại /data/home/notes-app/refs/noteflare và /data/home/notes-app/refs/edgeever — brief phải dặn Codex đọc code thật trong refs/ trước khi làm, không đoán kiến trúc.
- Nếu bạn không đọc được repo qua link, hãy dùng kiến thức trong plan §2 + README của 2 repo (đọc qua web): NoteFlare https://github.com/homielab/noteflare , EdgeEver https://github.com/tianma-if/edgeever .
- Scaffold cũ đã XOÁ HẾT để làm lại từ đầu. Làm lại phải tránh các thiếu sót đã phát hiện ở bản cũ: (1) auth phải đầy đủ ngay phase 1 (login/logout/me, ALLOWED_EMAILS, session hash, rate limit, worker/auth.ts, test auth); (2) phải có src/ React UI thật, index.html không được là placeholder trống; (3) package.json phải có script deploy, wrangler.jsonc phải có route domain, D1 phải được tạo thật (database_id không để trống); (4) phải có package-lock.json và node_modules riêng — xem lưu ý mạng dưới đây.
- Môi trường: npm install trên IB4 đang FAIL (EAI_AGAIN, registry.npmjs.org không phân giải được) — brief phải dặn Codex dùng node_modules chỉ-đọc của webmail tại /data/home/webmail-r3-codex/node_modules để chạy kiểm thử, và ghi rõ cách xử lý khi không cài được gói mới (không được bịa là đã cài xong).

LUẬT CỨNG brief phải ghi rõ:
- Hạ tầng RIÊNG với webmail: Worker inotion-notes, D1 inotion-notes, B2 bucket inotion-notes-attachments — KHÔNG dùng chung database, bucket, cookie/session hay secret của webmail.
- Domain duy nhất: inotion.eu.cc. KHÔNG dùng tên-miền-dự-án-cũ dưới bất kỳ hình thức nào (không route, không redirect, không link).
- Add-only trong /data/home/notes-app; KHÔNG sửa file webmail hay NOTES_PLAN.md; KHÔNG deploy (không wrangler deploy, không npm run deploy) cho tới khi Henrry duyệt — deploy chỉ sau khi được duyệt.
- KHÔNG ghi secret/password thật vào repo hay log. Tài khoản seed đầu là tranbinhanbr01@gmail.com (qua ALLOWED_EMAILS). B2 đã chuẩn bị xong (bucket Private inotion-notes-attachments, key notes-attachments; file credential 0600 tại ~/.b2_notes_attachments.json trên IB4; 4 secret Worker nạp ở phase 3).
- Mọi claim thành công phải kèm output lệnh thật, không bịa URL/ID/con số. Không viết lại file dùng chung từ đầu (add-only).
- Brief chia theo đúng 4 phase của plan (§6), mỗi phase có danh sách file, tiêu chí nghiệm thu (test/typecheck/build), và DONE marker riêng (PHASE1_DONE.md … PHASE4_DONE.md, mỗi file ghi file tạo/sửa + số dòng, kết quả lệnh thật, dòng cuối 'PHASEx DONE').

KẾ HOẠCH ĐẦY ĐỦ (NOTES_PLAN.md — đọc kỹ toàn bộ, đặc biệt §1 cấu trúc, §3 schema, §4 API, §5 UI, §6 4 phase, §8 quyết định đã Chốt, §9 Definition of Done):
