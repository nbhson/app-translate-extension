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
  return getSettingsFast();
}

// Bản nhanh, không block popup:
// - trả cache memory nếu có
// - đọc storage.sync nhưng race với timeout 350ms -> fallback defaults
//   (trên Windows/máy yếu, storage.sync lần đầu có thể chậm vài giây)
let _memCache = null;
const SETTINGS_TIMEOUT_MS = 350;

function storageGet(keys) {
  return chrome.storage.sync.get(keys);
}

function withTimeout(promise, ms, fallback) {
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function getSettingsFast() {
  if (_memCache) return _memCache;
  const keys = Object.keys(DEFAULT_SETTINGS);
  try {
    const stored = await withTimeout(storageGet(keys), SETTINGS_TIMEOUT_MS, null);
    if (stored == null) {
      // Hết timeout: trả defaults ngay để popup hiện tức thì,
      // đồng thời refresh ngầm để lần sau có cache.
      _memCache = { ...DEFAULT_SETTINGS };
      storageGet(keys).then((s) => { _memCache = { ...DEFAULT_SETTINGS, ...s }; }).catch(() => {});
      return _memCache;
    }
    _memCache = { ...DEFAULT_SETTINGS, ...stored };
    return _memCache;
  } catch {
    return _memCache || { ...DEFAULT_SETTINGS };
  }
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
