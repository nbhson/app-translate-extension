import { getSettings } from './settings.js';

const $ = (id) => document.getElementById(id);

const tabBtns = document.querySelectorAll('.tab');
tabBtns.forEach((b) =>
  b.addEventListener('click', () => {
    tabBtns.forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    const tab = b.dataset.tab;
    $('tab-translate').classList.toggle('hidden', tab !== 'translate');
    $('tab-rewrite').classList.toggle('hidden', tab !== 'rewrite');
  })
);

function sendMsg(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error || 'Lỗi không xác định'));
      resolve(res);
    });
  });
}

function setLoading(on, btn) {
  $('loading').classList.toggle('hidden', !on);
  if (btn) btn.disabled = on;
}
function showError(msg) {
  const box = $('errorBox');
  if (!msg) { box.classList.add('hidden'); box.textContent = ''; return; }
  box.textContent = msg;
  box.classList.remove('hidden');
}
function showResult(text, meta = '') {
  $('resultBox').classList.remove('hidden');
  $('resultText').textContent = text;
  $('resultMeta').textContent = meta;
}

async function refreshStatus() {
  // Đọc trực tiếp từ storage, KHÔNG qua service worker
  // (gọi SW lúc popup mở sẽ bắt Chrome đánh thức SW => popup hiện rất chậm)
  let settings = null;
  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }
  const el = $('providerStatus');
  if (!settings?.apiKey || !settings?.baseUrl || !settings?.model) {
    el.textContent = '⚠ Chưa cấu hình provider — bấm ⚙ để cài đặt';
    el.className = 'status warn';
  } else {
    try {
      const u = new URL(settings.baseUrl);
      el.textContent = `✓ ${settings.model} @ ${u.host}`;
    } catch {
      el.textContent = `✓ ${settings.model}`;
    }
    el.className = 'status ok';
  }
  if (settings?.defaultPair) $('langPair').value = settings.defaultPair;
  if (settings?.defaultRewriteMode) {
    const r = document.querySelector(`input[name="mode"][value="${settings.defaultRewriteMode}"]`);
    if (r) r.checked = true;
  }
}

$('btnTranslate').addEventListener('click', async () => {
  showError('');
  const text = $('inputText').value.trim();
  if (!text) return showError('Vui lòng nhập văn bản cần dịch.');
  const pair = $('langPair').value;
  const map = { 'vi-en': ['vi', 'en'], 'en-vi': ['en', 'vi'], auto: ['auto', 'auto'] };
  const [source, target] = map[pair] || ['auto', 'auto'];
  setLoading(true, $('btnTranslate'));
  try {
    const res = await sendMsg({ type: 'TRANSLATE', text, source, target });
    showResult(res.text, `${res.source} → ${res.target}`);
    saveHistory({ kind: 'translate', input: text, output: res.text });
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false, $('btnTranslate'));
  }
});

$('btnRewrite').addEventListener('click', async () => {
  showError('');
  let text = $('rewriteInput').value.trim() || $('inputText').value.trim();
  if (!text) return showError('Vui lòng nhập văn bản cần viết lại.');
  const mode = document.querySelector('input[name="mode"]:checked')?.value || 'natural';
  setLoading(true, $('btnRewrite'));
  try {
    const res = await sendMsg({ type: 'REWRITE', text, mode });
    const label = { professional: 'Chuyên nghiệp 💼', natural: 'Tự nhiên 💬', detailed: 'Chi tiết 📝' }[mode];
    showResult(res.text, `Viết lại • ${label}`);
    saveHistory({ kind: 'rewrite', input: text, output: res.text });
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false, $('btnRewrite'));
  }
});

$('btnClear').addEventListener('click', () => {
  $('inputText').value = '';
  $('rewriteInput').value = '';
  $('resultBox').classList.add('hidden');
  showError('');
});

$('btnCopy').addEventListener('click', async () => {
  const t = $('resultText').textContent;
  if (!t) return;
  await navigator.clipboard.writeText(t);
  $('btnCopy').textContent = '✅';
  setTimeout(() => ($('btnCopy').textContent = '📋'), 1200);
});

$('btnSpeak').addEventListener('click', () => {
  const t = $('resultText').textContent;
  if (!t) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t) ? 'vi-VN' : 'en-US';
  speechSynthesis.speak(u);
});

$('swapLang').addEventListener('click', () => {
  const sel = $('langPair');
  if (sel.value === 'vi-en') sel.value = 'en-vi';
  else if (sel.value === 'en-vi') sel.value = 'vi-en';
});

function openOptions() {
  chrome.runtime.openOptionsPage();
}
$('openOptions').addEventListener('click', openOptions);
$('footerOptions').addEventListener('click', (e) => { e.preventDefault(); openOptions(); });

async function saveHistory(entry) {
  try {
    const { history = [] } = await chrome.storage.local.get('history');
    history.unshift({ ...entry, time: Date.now() });
    await chrome.storage.local.set({ history: history.slice(0, 20) });
  } catch {}
}

// Enter (không shift) để dịch nhanh
$('inputText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('btnTranslate').click(); }
});

refreshStatus().catch(() => {});
