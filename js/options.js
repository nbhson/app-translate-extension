import { DEFAULT_SETTINGS, getSettings, saveSettings } from './settings.js';
import { chatCompletions, listModels } from './api.js';

const $ = (id) => document.getElementById(id);

function showMsg(text, ok) {
  const el = $('msg');
  el.textContent = text;
  el.className = ok ? 'ok' : 'err';
}

async function load() {
  const s = await getSettings();
  $('baseUrl').value = s.baseUrl;
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  $('defaultPair').value = s.defaultPair;
  $('defaultRewriteMode').value = s.defaultRewriteMode;
  $('temperature').value = s.temperature;
}

$('toggleKey').addEventListener('click', () => {
  $('apiKey').type = $('apiKey').type === 'password' ? 'text' : 'password';
});

$('btnSave').addEventListener('click', async () => {
  const patch = {
    baseUrl: $('baseUrl').value.trim(),
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    defaultPair: $('defaultPair').value,
    defaultRewriteMode: $('defaultRewriteMode').value,
    temperature: Math.min(1, Math.max(0, Number($('temperature').value || 0.5)))
  };
  if (!patch.baseUrl || !patch.model) return showMsg('Vui lòng nhập Base URL và Model.', false);
  await saveSettings(patch);
  showMsg('Đã lưu cấu hình ✓', true);
});

$('btnReset').addEventListener('click', async () => {
  await saveSettings({ ...DEFAULT_SETTINGS });
  await load();
  showMsg('Đã reset về mặc định.', true);
});

$('btnTest').addEventListener('click', async () => {
  const btn = $('btnTest');
  btn.disabled = true;
  const t0 = Date.now();
  const timer = setInterval(() => {
    showMsg(`Đang test kết nối... ${((Date.now() - t0) / 1000).toFixed(0)}s`, true);
  }, 500);
  try {
    const out = await chatCompletions({
      baseUrl: $('baseUrl').value.trim(),
      apiKey: $('apiKey').value.trim(),
      model: $('model').value.trim(),
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      temperature: 0,
      timeoutMs: 30000
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    showMsg(`Kết nối thành công ✓ (${secs}s) Model trả lời: ` + out.slice(0, 100), true);
  } catch (e) {
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    showMsg(`Test thất bại sau ${secs}s: ` + e.message, false);
  } finally {
    clearInterval(timer);
    btn.disabled = false;
  }
});

$('fetchModels').addEventListener('click', async () => {
  try {
    showMsg('Đang lấy danh sách models...', true);
    const ids = await listModels({ baseUrl: $('baseUrl').value.trim(), apiKey: $('apiKey').value.trim() });
    const dl = $('modelList');
    dl.innerHTML = '';
    ids.forEach((id) => {
      const o = document.createElement('option');
      o.value = id;
      dl.appendChild(o);
    });
    showMsg(`Tìm thấy ${ids.length} models ✓`, true);
  } catch (e) {
    showMsg('Không lấy được models: ' + e.message, false);
  }
});

load();
