// OpenAI-compatible chat completions client — CHỈ dùng cho REWRITE (AI).
// Dịch (TRANSLATE) dùng Google miễn phí ở js/translate.js, không tốn token.
// Works with OpenAI, OpenRouter, Together, Groq, Ollama (/v1), LM Studio, vLLM...
import { normalizeBaseUrl } from './settings.js';

export async function fetchWithTimeout(url, opts = {}, timeoutMs = 30000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error(`Hết thời gian chờ (${Math.round(timeoutMs / 1000)}s). Kiểm tra Base URL / mạng, hoặc model local chưa load xong.`);
    }
    throw new Error(`Lỗi mạng: ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletions({ baseUrl, apiKey, model, messages, temperature = 0.5, timeoutMs = 60000 }) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('Chưa cấu hình Base URL.');
  if (!apiKey) throw new Error('Chưa cấu hình API Key. Vào Cài đặt (⚙) để nhập.');
  if (!model) throw new Error('Chưa cấu hình Model.');

  const res = await fetchWithTimeout(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, temperature, stream: false })
  }, timeoutMs);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API lỗi ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('API trả về rỗng.');
  return content;
}

export async function listModels({ baseUrl, apiKey, timeoutMs = 15000 }) {
  const base = normalizeBaseUrl(baseUrl);
  if (!base) throw new Error('Chưa cấu hình Base URL.');
  const res = await fetchWithTimeout(`${base}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  }, timeoutMs);
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Không lấy được models (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const ids = (data?.data || []).map((m) => m.id).filter(Boolean).sort();
  return ids;
}

const REWRITE_SYSTEM = {
  professional:
    'You are a professional editor. Rewrite the text in the SAME language, formal and polished tone suitable for work / email / academic writing. Fix grammar, use precise vocabulary. Return ONLY the rewritten text, no explanations.',
  natural:
    'You are a native speaker editor. Rewrite the text in the SAME language to sound natural, fluent and conversational like a native speaker. Keep the original meaning, short and easy to read. Return ONLY the rewritten text.',
  detailed:
    'You are a thorough writing assistant. Rewrite and expand the text in the SAME language: clarify ideas, add helpful context, use richer sentences while keeping the original meaning. Do not add false facts. Return ONLY the rewritten text.'
};

export function buildRewriteMessages(text, mode) {
  const sys = REWRITE_SYSTEM[mode] || REWRITE_SYSTEM.natural;
  return [
    { role: 'system', content: sys },
    { role: 'user', content: text }
  ];
}
