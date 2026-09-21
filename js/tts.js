// Helper TTS dùng lang code chính xác (vi/en) thay vì đoán bằng regex.
// Dùng cho popup (module). Content-script copy bản inline vì nó là classic script.

export function langToLocale(code) {
  if (code === 'vi') return 'vi-VN';
  if (code === 'en') return 'en-US';
  return code || 'en-US';
}

function pickVoice(locale) {
  try {
    const voices = speechSynthesis.getVoices?.() || [];
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

// Đảm bảo voices đã load (Chrome load async)
let _voicesReady = false;
try {
  if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => { _voicesReady = true; };
  }
} catch {}

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
