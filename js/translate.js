// Dịch miễn phí qua Google Translate (giống app-live-translate-extension).
// Không cần API key, không tốn token AI. Chỉ dùng cho TRANSLATE.
// REWRITE vẫn dùng AI (js/api.js -> background.js doRewrite).

import { detectLang } from './settings.js';

const TRANSLATE_MAX_CHARS = 4200;
const TRANSLATE_TIMEOUT_MS = 8500;
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

async function fetchOne(text, sl, tl, retries = 2) {
  const cacheKey = `${sl}|${tl}|${text}`;
  const hit = cacheGet(cacheKey);
  if (hit !== undefined) return hit;

  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TRANSLATE_TIMEOUT_MS);
    try {
      const url =
        `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=` +
        encodeURIComponent(text);
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
          let delay = Math.pow(2, attempt) * 400 + Math.random() * 200;
          try {
            const ra = res.headers.get('Retry-After');
            if (ra) delay = Math.max(delay, parseInt(ra, 10) * 1000);
          } catch {}
          await sleep(delay);
          continue;
        }
        throw new Error(`Google Translate lỗi ${res.status}`);
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
      if (out) cacheSet(cacheKey, out);
      return out;
    } catch (e) {
      lastErr = e;
      if (e?.name === 'AbortError') throw new Error('Google Translate hết thời gian chờ (8.5s), thử lại.');
      const retryable = /Failed to fetch|NetworkError|network/i.test(e.message || '');
      if (retryable && attempt < retries) {
        await sleep(Math.pow(2, attempt) * 350 + Math.random() * 150);
        continue;
      }
      if (attempt >= retries) throw e instanceof Error ? e : new Error(String(e));
      await sleep(Math.pow(2, attempt) * 300);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr || new Error('Dịch thất bại.');
}

export async function translateFree(text, source = 'auto', target = 'auto') {
  const t = (text || '').trim();
  if (!t) throw new Error('Văn bản trống.');
  const { source: sl, target: tl } = resolvePair(t, source, target);

  if (t.length > TRANSLATE_MAX_CHARS) {
    const chunks = chunkBySentence(t, TRANSLATE_MAX_CHARS);
    const outs = [];
    for (const c of chunks) {
      const r = await fetchOne(c, sl, tl);
      outs.push(r || c);
    }
    return { text: outs.join(' '), source: sl, target: tl };
  }
  const out = await fetchOne(t, sl, tl);
  if (!out) throw new Error('Google Translate trả về rỗng, thử lại sau.');
  return { text: out, source: sl, target: tl };
}
