# ViEn Translate + AI Rewrite 🌐

[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](https://developer.chrome.com/docs/extensions/mv3/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue.svg)](https://developer.chrome.com/docs/extensions/)
[![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI%20Compatible-orange.svg)](https://platform.openai.com/docs/api-reference/chat)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Chrome Extension (Manifest V3) dịch **Việt ⇄ Anh** và **viết lại bằng AI**.
Dịch chạy ngay không cần cấu hình. Viết lại dùng mọi provider chuẩn OpenAI `/chat/completions`: OpenAI, OpenRouter, Groq, Together, Ollama, LM Studio, vLLM...

> 🇬🇧 English summary below.

---

## ✨ Tính năng

### 🌍 Dịch
- 🔄 **Tự động** phát hiện Việt ⇄ Anh (không cần cấu hình AI)
- 🇻🇳➡️🇬🇧 Việt → Anh / 🇬🇧➡️🇻🇳 Anh → Việt
- Bôi đen văn bản trên bất kỳ trang web nào → hiện nút **🌐 Dịch**
- Chuột phải → **Dịch nhanh** (Auto / VI→EN / EN→VI)
- Phím tắt `Alt+T` để dịch vùng đang chọn
- 🔊 Đọc cả văn bản gốc và bản dịch (đúng giọng vi-VN / en-US theo chiều dịch)
- 📋 Copy 1 click (riêng nút Copy gốc / Copy dịch)

### ✨ Viết lại bằng AI (3 mode)
| Mode | Mô tả |
|------|-------|
| 💼 **Chuyên nghiệp** | Lịch sự, chuẩn công sở / học thuật |
| 💬 **Tự nhiên** | Như người bản xứ, trôi chảy |
| 📝 **Chi tiết** | Mở rộng, rõ ý, thêm ngữ cảnh |

- Viết lại ngay trong popup
- Viết lại ngay trong bong bóng (card) trên trang web, giữ nguyên ngôn ngữ gốc

### 🔌 Custom Provider (chỉ cho Viết lại)
- Cấu hình qua `Base URL + API Key + Model`
- Nút **📥 lấy danh sách models** tự động từ `/models`
- Nút **🔌 Test kết nối** trước khi lưu
- Chạy local hoàn toàn với Ollama / LM Studio (không tốn phí, riêng tư)

---

## 📦 Cài đặt (dev)

1. Mở `chrome://extensions` → bật **Developer mode**
2. Bấm **Load unpacked** → chọn thư mục này
3. Dịch dùng ngay, không cần cấu hình. Chỉ khi dùng **✨ Viết lại** mới cần cấu hình AI: bấm icon extension → **⚙** → nhập:
   - **Base URL:** `https://api.openai.com/v1`
   - **API Key:** `sk-...`
   - **Model:** `gpt-4o-mini`
4. Bấm **Test kết nối** → **Lưu**

### ⚙️ Ví dụ provider

| Provider | Base URL | Model ví dụ | Ghi chú |
|----------|----------|-------------|---------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | Cần API key trả phí |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o-mini` | Nhiều model free |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.1-8b-instant` | Rất nhanh, có free tier |
| Together | `https://api.together.xyz/v1` | `meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo` | — |
| Ollama (local) | `http://localhost:11434/v1` | `qwen2.5:7b` | Key điền `ollama` |
| LM Studio (local) | `http://localhost:1234/v1` | tên model đã load | Key bất kỳ |

> Local model: chạy `ollama pull qwen2.5:7b && ollama serve`, rồi cấu hình Base URL trỏ về localhost.

---

## 🚀 Cách dùng

**Popup:**
1. Bấm icon extension
2. Tab **🌍 Dịch**: chọn chiều dịch → nhập text → **Dịch**
3. Tab **✨ Viết lại**: chọn mode → nhập câu → **Viết lại**

**Trên trang web:**
1. Bôi đen đoạn văn bản bất kỳ
2. Bấm nút nổi **🌐 Dịch**, hoặc chuột phải → Dịch nhanh
3. Card kết quả hiện: văn bản gốc + bản dịch (kèm Copy / 🔊 Đọc riêng từng phần) + box Viết lại

**Phím tắt:**
- `Alt+T`: dịch văn bản đang chọn (đổi tại `chrome://extensions/shortcuts`)

---

## 🗂️ Cấu trúc dự án

```
manifest.json                 # Manifest V3: popup, background, content-script, commands
popup.html / css/popup.css / js/popup.js
options.html / css/options.css / js/options.js   # Trang cài đặt provider AI (cho Rewrite)
background.js                 # Context menu + message hub (dịch trực tiếp, rewrite qua AI)
content.js / css/content.css  # Bong bóng dịch khi bôi đen (FAB + card)
js/translate.js               # Dịch trực tiếp (chunk + retry + cache)
js/tts.js                     # Text-to-Speech (đọc gốc/dịch đúng giọng vi-VN/en-US)
js/api.js                     # Client OpenAI-compatible cho Rewrite
js/settings.js                # Storage + detect ngôn ngữ
icons/                        # icon16/48/128
```

**Luồng gọi:** `popup / content` → `chrome.runtime.sendMessage` → `background.js` → dịch trực tiếp (không cần AI) hoặc `fetch(BaseURL/chat/completions)` cho Rewrite → trả kết quả về. Cách này tránh lỗi CORS của trang web.

---

## 🔒 Quyền (permissions)

| Quyền | Vì sao cần |
|-------|------------|
| `storage` | Lưu BaseURL / Key / Model cho Rewrite + lịch sử |
| `contextMenus` | Menu chuột phải dịch nhanh |
| `scripting`, `activeTab` | Lấy text vùng chọn, phím tắt |
| `<all_urls>` | Content-script bong bóng dịch mọi trang |

API Key chỉ lưu trong `chrome.storage.local` trên máy bạn, không gửi đi đâu ngoài Base URL bạn cấu hình. Chức năng Dịch không yêu cầu API Key.

---

## 🛠️ Phát triển

```bash
# Không cần build, code JS thuần
# Sửa file → vào chrome://extensions → bấm Reload (⟳) trên extension
# Lưu ý: sau khi Reload phải F5 lại các tab web đang mở (content-script cũ mất kết nối)
```

---

## 🇬🇧 English (short)

**ViEn Translate + AI Rewrite** — Manifest V3 Chrome extension for Vietnamese ⇄ English translation + AI rewriting (Professional / Natural / Detailed). Translation works out of the box; rewriting uses any OpenAI-compatible provider via `Base URL + API Key + Model`. Features: select-to-translate bubble, right-click quick translate, `Alt+T` shortcut, popup translator/rewriter, TTS for both source and translation, local models (Ollama/LM Studio) supported.

---

## 📄 License

MIT — feel free to fork and customize.
