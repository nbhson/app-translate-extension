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
