// Dịch theo chuỗi fallback:
//   Google (free) -> MyMemory (free) -> LibreTranslate (free) -> Lingva (free) -> LLM (lớp cuối)
// Không cần API key cho các tầng free. LLM chỉ gọi khi tất cả tầng free đều lỗi
// (rate-limit / timeout / rỗng) VÀ đã cấu hình BaseURL + API Key + Model.

import { detectLang } from './settings.js';

const TRANSLATE_MAX_CHARS = 4200;
const FREE_TIMEOUT_MS = 8000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// LRU cache đơn giản trong memory (service worker có thể restart -> mất cache, chấp nhận được)
const _cache = new Map();
const CACHE_LIMIT = 500;
function cacheGet(k) {
  if (!_cache.has(k)) return undefined;
  const v = _cache.get(k);
  _cache.delete(k);
  _cache.set(k, v);
  return v;
}
function cacheSet(k, v) {
  if (_cache.has(k)) _cache.delete(k);
  _cache.set(k, v);
  if (_cache.size > CACHE_LIMIT) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function chunkBySentence(text, maxLen) {
  if (text.length <= maxLen) return [text];
  const parts = text.split(/(?<=[.!?])\s+/);
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > maxLen) {
      if (cur) chunks.push(cur.trim());
      if (p.length > maxLen) {
        for (let i = 0; i < p.length; i += maxLen) chunks.push(p.slice(i, i + maxLen));
        cur = '';
      } else cur = p;
    } else cur = cur ? cur + ' ' + p : p;
  }
  if (cur) chunks.push(cur.trim());
  return chunks.filter(Boolean);
}

export function resolvePair(text, source, target) {
  let src = source || 'auto';
  let tgt = target || 'auto';
  if (src === 'auto' || tgt === 'auto') {
    const detected = src === 'auto' ? detectLang(text) : src;
    src = detected === 'auto' ? 'en' : detected;
    tgt = src === 'vi' ? 'en' : 'vi';
    // nếu user ép 1 chiều cụ thể thì tôn trọng
    if (source !== 'auto' && target === 'auto') {
      src = source;
      tgt = source === 'vi' ? 'en' : 'vi';
    }
    if (target !== 'auto' && source === 'auto') {
      tgt = target;
      src = target === 'vi' ? 'en' : 'vi';
    }
  }
  return { source: src, target: tgt };
}

function isRateLimitError(e) {
  const msg = String(e?.message || '');
  return /429|quá nhiều|rate.?limit|limit|quota|503|502|504/i.test(msg);
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = FREE_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      const err = new Error(`Hết thời gian chờ (${Math.round(timeoutMs / 1000)}s).`);
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function checkRetryable(res, attempt, retries) {
  if (!RETRYABLE_STATUS.has(res.status) || attempt >= retries) return false;
  let delay = Math.pow(2, attempt) * 400 + Math.random() * 200;
  try {
    const ra = res.headers.get('Retry-After');
    if (ra) delay = Math.max(delay, parseInt(ra, 10) * 1000);
  } catch {}
  await sleep(delay);
  return true;
}

// ---- Provider 1: Google GTX (mặc định, nhanh nhất) ----
async function googleChunk(text, sl, tl, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url =
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=` +
        encodeURIComponent(text);
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        if (await checkRetryable(res, attempt, retries)) continue;
        const err = new Error(`Google Translate lỗi ${res.status}`);
        if (res.status === 429) err.code = 'RATE_LIMIT';
        throw err;
      }
      const data = await res.json();
      let out = '';
      if (data?.[0]) {
        for (const seg of data[0]) if (seg?.[0]) out += seg[0];
      }
      out = String(out || '').trim();
      if (!out && attempt < retries && text.length > 3) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (!out) throw new Error('Google Translate trả về rỗng.');
      return out;
    } catch (e) {
      lastErr = e;
      if (e?.code === 'TIMEOUT' || e?.code === 'RATE_LIMIT') throw e;
      const retryable = /Failed to fetch|NetworkError|network/i.test(e.message || '');
      if (retryable && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 350 + Math.random() * 150);
        continue;
      }
      if (attempt >= retries) throw e instanceof Error ? e : new Error(String(e));
      await sleep(Math.pow(2, attempt) * 300);
    }
  }
  throw lastErr || new Error('Google Translate thất bại.');
}

// ---- Provider 2: MyMemory (free, không key; ~500 ký tự/request, ~5000 ký tự/ngày anon) ----
async function myMemoryChunk(text, sl, tl, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const url =
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
        `&langpair=${encodeURIComponent(sl + '|' + tl)}`;
      const res = await fetchWithTimeout(url);
      if (!res.ok) {
        if (await checkRetryable(res, attempt, retries)) continue;
        const err = new Error(`MyMemory lỗi ${res.status}`);
        if (res.status === 429) err.code = 'RATE_LIMIT';
        throw err;
      }
      const data = await res.json();
      if (data?.responseStatus === 429 || /limit|quota|exceeded/i.test(data?.responseDetails || '')) {
        const err = new Error('MyMemory hết quota miễn phí trong ngày.');
        err.code = 'RATE_LIMIT';
        throw err;
      }
      const out = String(data?.responseData?.translatedText || '').trim();
      if (!out && attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (!out) throw new Error('MyMemory trả về rỗng.');
      return out;
    } catch (e) {
      lastErr = e;
      if (e?.code === 'TIMEOUT' || e?.code === 'RATE_LIMIT') throw e;
      if (attempt >= retries) throw e instanceof Error ? e : new Error(String(e));
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr || new Error('MyMemory thất bại.');
}

// ---- Provider 3: LibreTranslate public (Argos, không key) ----
const LIBRE_URL = 'https://translate.argosopentech.com/translate';
async function libreChunk(text, sl, tl, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(
        LIBRE_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, source: sl, target: tl, format: 'text' })
        }
      );
      if (!res.ok) {
        if (await checkRetryable(res, attempt, retries)) continue;
        const err = new Error(`LibreTranslate lỗi ${res.status}`);
        if (res.status === 429) err.code = 'RATE_LIMIT';
        throw err;
      }
      const data = await res.json();
      const out = String(data?.translatedText || '').trim();
      if (!out && attempt < retries) {
        await sleep(300 * (attempt + 1));
        continue;
      }
      if (!out) throw new Error('LibreTranslate trả về rỗng.');
      return out;
    } catch (e) {
      lastErr = e;
      if (e?.code === 'TIMEOUT' || e?.code === 'RATE_LIMIT') throw e;
      if (attempt >= retries) throw e instanceof Error ? e : new Error(String(e));
      await sleep(300 * (attempt + 1));
    }
  }
  throw lastErr || new Error('LibreTranslate thất bại.');
}

// ---- Provider 4: Lingva (wrapper Google qua domain khác, né limit IP) ----
const LINGVA_BASES = ['https://lingva.ml', 'https://lingva.thedaviddelta.com'];
async function lingvaChunk(text, sl, tl, retries = 0) {
  let lastErr = null;
  for (const base of LINGVA_BASES) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const url = `${base}/api/v1/${sl}/${tl}/${encodeURIComponent(text)}`;
        const res = await fetchWithTimeout(url);
        if (!res.ok) {
          if (await checkRetryable(res, attempt, retries)) continue;
          const err = new Error(`Lingva lỗi ${res.status}`);
          if (res.status === 429) err.code = 'RATE_LIMIT';
          throw err;
        }
        const data = await res.json();
        const out = String(data?.translation || '').trim();
        if (!out) throw new Error('Lingva trả về rỗng.');
        return out;
      } catch (e) {
        lastErr = e;
        // thử mirror tiếp theo thay vì retry cùng base
        break;
      }
    }
  }
  throw lastErr || new Error('Lingva thất bại.');
}

// Thứ tự fallback + giới hạn ký tự mỗi request của từng provider
const FREE_PROVIDERS = [
  { id: 'google', label: 'Google', maxChars: TRANSLATE_MAX_CHARS, run: googleChunk },
  { id: 'mymemory', label: 'MyMemory', maxChars: 450, run: myMemoryChunk },
  { id: 'libre', label: 'LibreTranslate', maxChars: 1200, run: libreChunk },
  { id: 'lingva', label: 'Lingva', maxChars: 2500, run: lingvaChunk }
];

async function runFreeProvider(provider, text, sl, tl) {
  const chunks = chunkBySentence(text, provider.maxChars);
  const outs = [];
  for (const c of chunks) {
    const r = await provider.run(c, sl, tl);
    outs.push(r || c);
  }
  const joined = outs.join(' ').trim();
  if (!joined) throw new Error(`${provider.label} trả về rỗng.`);
  return joined;
}

function llmConfigured(llm) {
  return !!(llm?.baseUrl && llm?.apiKey && llm?.model);
}

async function runLlmProvider(text, sl, tl, llm) {
  // Dynamic import để translate.js không phụ thuộc tĩnh vào api.js
  // (tránh cycle khi api.js import settings).
  const { chatCompletions, buildTranslateMessages } = await import('./api.js');
  const messages = buildTranslateMessages(text, sl, tl);
  const out = await chatCompletions({
    baseUrl: llm.baseUrl,
    apiKey: llm.apiKey,
    model: llm.model,
    messages,
    temperature: 0.2,
    timeoutMs: 60000
  });
  const cleaned = String(out || '').trim();
  if (!cleaned) throw new Error('LLM trả về rỗng.');
  return cleaned;
}

/**
 * Dịch với fallback: free -> free -> ... -> LLM (cuối cùng).
 * @param {string} text
 * @param {string} source 'auto' | 'vi' | 'en'
 * @param {string} target 'auto' | 'vi' | 'en'
 * @param {{ llm?: { baseUrl, apiKey, model }, onStep?: (info) => void }} opts
 * @returns {{ text, source, target, provider, providerLabel, tried }}
 */
export async function translateWithFallback(text, source = 'auto', target = 'auto', opts = {}) {
  const t = (text || '').trim();
  if (!t) throw new Error('Văn bản trống.');
  const { source: sl, target: tl } = resolvePair(t, source, target);

  const cacheKey = `${sl}|${tl}|${t}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) {
    return { text: hit.text, source: sl, target: tl, provider: hit.provider, providerLabel: hit.providerLabel, tried: [], cached: true };
  }

  const tried = [];
  for (const p of FREE_PROVIDERS) {
    try {
      opts?.onStep?.({ provider: p.id, phase: 'try' });
      const out = await runFreeProvider(p, t, sl, tl);
      const result = { text: out, source: sl, target: tl, provider: p.id, providerLabel: p.label, tried };
      cacheSet(cacheKey, { text: out, provider: p.id, providerLabel: p.label });
      opts?.onStep?.({ provider: p.id, phase: 'ok' });
      return result;
    } catch (e) {
      tried.push({ provider: p.id, label: p.label, error: e?.message || String(e), rateLimit: isRateLimitError(e) });
      opts?.onStep?.({ provider: p.id, phase: 'fail', error: e?.message });
      // thử provider free tiếp theo
    }
  }

  // Lớp cuối cùng: LLM (chỉ khi đã cấu hình)
  if (llmConfigured(opts?.llm)) {
    try {
      opts?.onStep?.({ provider: 'llm', phase: 'try' });
      // LLM chịu được đoạn dài, chunk 4000 ký tự để tránh vượt context
      const chunks = chunkBySentence(t, 4000);
      const outs = [];
      for (const c of chunks) {
        outs.push(await runLlmProvider(c, sl, tl, opts.llm));
      }
      const out = outs.join(' ').trim();
      if (!out) throw new Error('LLM trả về rỗng.');
      const result = { text: out, source: sl, target: tl, provider: 'llm', providerLabel: `LLM (${opts.llm.model})`, tried };
      cacheSet(cacheKey, { text: out, provider: 'llm', providerLabel: result.providerLabel });
      opts?.onStep?.({ provider: 'llm', phase: 'ok' });
      return result;
    } catch (e) {
      tried.push({ provider: 'llm', label: 'LLM', error: e?.message || String(e), rateLimit: isRateLimitError(e) });
      opts?.onStep?.({ provider: 'llm', phase: 'fail', error: e?.message });
    }
  } else {
    tried.push({ provider: 'llm', label: 'LLM', error: 'Chưa cấu hình AI (Base URL / API Key / Model).', rateLimit: false, skipped: true });
  }

  const details = tried.map((x) => `${x.label}: ${x.error}`).join(' | ');
  const hint = llmConfigured(opts?.llm)
    ? ''
    : ' Mẹo: cấu hình AI ở ⚙ (Base URL + API Key + Model) để có thêm lớp fallback LLM cuối cùng.';
  throw new Error(`Tất cả nguồn dịch đều lỗi (${tried.length} nguồn). ${details}.${hint}`);
}

// Giữ tương thích ngược: trước đây background/popup chỉ gọi translateFree.
export async function translateFree(text, source = 'auto', target = 'auto', opts = {}) {
  return translateWithFallback(text, source, target, opts);
}
