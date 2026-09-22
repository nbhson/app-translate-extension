// Helper TTS dùng lang code chính xác (vi/en) thay vì đoán bằng regex.
// Dùng cho popup (module). Content-script copy bản inline vì nó là classic script.
//
// QUAN TRỌNG (fix popup mở chậm trên Windows):
// - KHÔNG gọi speechSynthesis.getVoices() ở top-level lúc import.
//   Trên Windows, Chrome phải liệt kê toàn bộ SAPI/OneCore voices hệ thống,
//   có thể block main thread 1-3s khiến popup hiện rất lâu.
// - Voices chỉ được nạp lười (lazy) khi user thật sự bấm nút 🔊.

export function langToLocale(code) {
  if (code === 'vi') return 'vi-VN';
  if (code === 'en') return 'en-US';
  return code || 'en-US';
}

// Cache voices sau lần nạp đầu, kèm listener async (không block lúc import)
let _voicesCache = null;
let _voicesHooked = false;

function ensureVoicesHook() {
  if (_voicesHooked) return;
  _voicesHooked = true;
  try {
    if (typeof speechSynthesis !== 'undefined' && 'onvoiceschanged' in speechSynthesis) {
      speechSynthesis.onvoiceschanged = () => { _voicesCache = null; };
    }
  } catch {}
}

function getVoicesLazy() {
  try {
    ensureVoicesHook();
    if (_voicesCache) return _voicesCache;
    // Lần đầu user bấm 🔊 mới gọi — lúc này popup đã hiện xong nên không sao.
    const v = speechSynthesis.getVoices?.() || [];
    if (v.length) _voicesCache = v;
    return v;
  } catch {
    return [];
  }
}

function pickVoice(locale) {
  try {
    const voices = getVoicesLazy();
    if (!voices.length) return null;
    const base = (locale || '').split('-')[0].toLowerCase();
    return (
      voices.find((v) => (v.lang || '').toLowerCase() === locale.toLowerCase()) ||
      voices.find((v) => (v.lang || '').toLowerCase().startsWith(base)) ||
      null
    );
  } catch {
    return null;
  }
}

export function speak(text, langCode) {
  const t = (text || '').trim();
  if (!t) return;
  const locale = langToLocale(langCode);
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = locale;
  const v = pickVoice(locale);
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

// Fallback khi chưa có lang code (vd: đọc input trước khi dịch):
// ưu tiên pair đang chọn, cuối cùng mới đoán bằng dấu tiếng Việt.
export function guessLang(text, preferred) {
  if (preferred === 'vi' || preferred === 'en') return preferred;
  const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viPattern.test(text) ? 'vi' : 'en';
}
