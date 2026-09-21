// Shared constants: language pairs + rewrite modes + default settings
export const LANG_PAIRS = {
  'vi-en': { source: 'vi', target: 'en', label: 'Việt → Anh' },
  'en-vi': { source: 'en', target: 'vi', label: 'Anh → Việt' },
  auto: { source: 'auto', target: 'auto', label: 'Tự động' }
};

export const REWRITE_MODES = {
  professional: {
    id: 'professional',
    label: 'Chuyên nghiệp',
    icon: '💼',
    desc: 'Lịch sự, chuẩn công sở / học thuật'
  },
  natural: {
    id: 'natural',
    label: 'Tự nhiên',
    icon: '💬',
    desc: 'Như người bản xứ, trôi chảy'
  },
  detailed: {
    id: 'detailed',
    label: 'Chi tiết',
    icon: '📝',
    desc: 'Mở rộng, rõ ý, thêm ngữ cảnh'
  }
};

export const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  defaultPair: 'auto',
  defaultRewriteMode: 'natural',
  temperature: 0.5
};

export async function getSettings() {
  const stored = await chrome.storage.sync.get(Object.keys(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(patch) {
  await chrome.storage.sync.set(patch);
}

export function detectLang(text) {
  // Heuristic: Vietnamese diacritics => vi, else en
  const viPattern = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
  return viPattern.test(text) ? 'vi' : 'en';
}

export function normalizeBaseUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}
