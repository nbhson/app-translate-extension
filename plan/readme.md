# Plan — app-translate-extension

> Chrome MV3 extension: dịch Vi⇄En + AI rewrite (context menu, floating bubble).

## Kết quả Review (audit đợt 1)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR | content.js:88-89 | `card.innerHTML` nội suy `langTag`/`viaTag` từ provider trả về không escape → XSS (framing: provider bị bắt giả mạo) | escape đủ 5 entities |
| 2 | MAJOR | background.js:18-44 | `onInstalled` create contextMenus không removeAll trước → duplicate ID error khi reload/update | `removeAll()` rồi create trong callback |
| 3 | MAJOR | js/settings.js:81 | API key lưu `storage.sync` → đồng bộ lên tài khoản Google (credential rời máy), mâu thuẫn README | Tách `apiKey` sang `storage.local` + migration remove khỏi sync |
| 4 | MINOR | js/settings.js:70 | Background refresh không đọc local apiKey | Đã gộp vào Promise.all |
| 5 | MINOR | js/settings.js | `saveSettings` không invalidate memory cache | `_memCache = null` |

## Trạng thái

- [x] Plan
- [x] Fix #1–#5
- [x] Commit + self-review

## Review Log

### Vòng 1
- Self-review: original/result của card hiển thị bằng textContent (an toàn sẵn); chỉ langTag/viaTag đi vào innerHTML — đã escape. Migration API key: saveSettings remove key cũ khỏi sync; getSettings đọc cả 2 nơi, ưu tiên local. `node --check` pass.

---

# Round 2 (2026-10-29) — Enterprise upgrade

## Kết quả Review (audit đợt 2)

| # | Severity | Vị trí | Vấn đề | Fix |
|---|----------|--------|--------|-----|
| 1 | MAJOR | js/popup.js | `saveHistory` ghi `chrome.storage.local` nhưng không có UI nào xem/xóa — dữ liệu chết; và chỉ popup được lưu (bong bóng + context menu không) | History ghi tập trung ở background message hub + context-menu path (max 50, dedupe liên tiếp); popup có tab Lịch sử (render DOM API, click để nạp lại, xóa hết) |
| 2 | MAJOR | content.js | Bong bóng dịch chạy trên mọi site, không có cách tắt theo site | Per-site toggle: checkbox ở popup footer + `storage.onChanged` cập nhật live trong content script (không cần F5); options page có danh sách bật lại |
| 3 | MINOR | js/popup.js | `btnCopy` không try/catch → unhandled rejection khi clipboard bị chặn | try/catch + showError |
| 4 | MINOR | content.js flash() | Bấm nhanh 2 lần: timer cũ đè label mới | Clear restore-timer cũ trước khi set mới |
| 5 | MINOR | keydown shortcuts popup | Space trên button đang focus vừa click vừa toggle (youtube repo pattern) / a11y chung | Tab buttons có aria-pressed; textarea/select aria-label; focus-visible cả popup + options |
| 6 | MINOR | css | Chỉ light palette | Dark palette qua `prefers-color-scheme: dark` cho popup + options |

## Feature mới (đợt 2)

1. **History panel**: tab thứ 3 trong popup — danh sách 50 entry gần nhất (dịch/viết lại, từ mọi entry-point), bấm để nạp lại vào ô nhập, nút Xóa hết. Ghi 1 nơi duy nhất ở background để tránh trùng lặp popup/content.
2. **Per-site toggle**: tắt/bật bong bóng dịch trên site hiện tại ngay từ popup; live-apply qua storage.onChanged; quản lý danh sách (bật lại) ở options page.
3. **Dark mode aware**: cả popup + options tôn trọng `prefers-color-scheme: dark` (light vẫn mặc định).

## Trạng thái (Round 2)

- [x] Deep review + plan
- [x] Fix #1–#5
- [x] Features: history panel, per-site toggle, dark mode aware
- [x] `node --check` (8 file) + tests (8/8 pass) + manifest hợp lệ

## Review Log (Round 2)

### Vòng 2
- Self-review: không regressed fix đợt 1 (escape langTag/viaTag vẫn còn; removeAll trước create còn; apiKey local còn). saveHistory của popup đã bỏ — chỉ background ghi (1 nguồn sự thật). content.js render card vẫn textContent cho original/result; langTag/viaTag vẫn escape. renderHistory dùng textContent — không XSS từ history (kẻ tấn công có thể ghi storage? chỉ extension tự ghi). `node --check` pass cả popup.js/background.js/options.js/content.js; `node tests/translate.fallback.test.mjs` 8/8 pass.

