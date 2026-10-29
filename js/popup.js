import { getSettings } from './settings.js';
import { guessLang } from './tts.js';

// Lazy-load speak (chứa speechSynthesis) CHỈ khi user bấm 🔊.
// Trên Windows, chạm vào speechSynthesis lúc popup mở làm block 1-3s.
let _speakFn = null;
async function speakLazy(text, langCode) {
  if (!_speakFn) {
    const m = await import('./tts.js');
    _speakFn = m.speak;
  }
  _speakFn(text, langCode);
}

const $ = (id) => document.getElementById(id);

// Giữ lang code chính xác từ background (translateFree resolvePair)
// để TTS đọc đúng giọng vi-VN / en-US, không đoán bằng regex.
let lastSrc = null; // { text, lang }
let lastDst = null; // { text, lang }

function kindLabel(kind) {
  return kind === 'rewrite' ? '✨ Viết lại' : '🌍 Dịch';
}

// --- History tab ---
// History do background ghi (1 nơi duy nhất cho cả popup + content script);
// popup chỉ đọc + xóa. List render bằng DOM API (textContent), không innerHTML.
function renderHistory() {
  const list = $('historyList');
  if (!list) return;
  chrome.storage.local.get('history', ({ history = [] }) => {
    list.textContent = '';
    if (!history.length) {
      const empty = document.createElement('p');
      empty.className = 'history-empty';
      empty.textContent = 'Chưa có lịch sử. Dịch hoặc viết lại để lưu vào đây.';
      list.appendChild(empty);
      return;
    }
    for (const entry of history) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'history-item';

      const head = document.createElement('div');
      head.className = 'history-item-head';
      head.textContent = `${kindLabel(entry.kind)} · ${new Date(entry.time || Date.now()).toLocaleString('vi-VN')}`;

      const input = document.createElement('div');
      input.className = 'history-item-text';
      input.textContent = entry.input || '';

      const output = document.createElement('div');
      output.className = 'history-item-output';
      output.textContent = entry.output || '';

      item.append(head, input, output);
      item.title = 'Bấm để nạp lại';
      item.addEventListener('click', () => {
        if (entry.kind === 'rewrite') {
          document.querySelector('.tab[data-tab="rewrite"]')?.click();
          $('rewriteInput').value = entry.input || '';
        } else {
          document.querySelector('.tab[data-tab="translate"]')?.click();
          $('inputText').value = entry.input || '';
        }
        showResult(entry.output || '', kindLabel(entry.kind));
      });
      list.appendChild(item);
    }
  });
}

$('btnClearHistory').addEventListener('click', async () => {
  if (!confirm('Xóa toàn bộ lịch sử dịch?')) return;
  try { await chrome.storage.local.remove('history'); } catch {}
  renderHistory();
});

const tabBtns = document.querySelectorAll('.tab');
tabBtns.forEach((b) =>
  b.addEventListener('click', () => {
    tabBtns.forEach((x) => {
      x.classList.remove('active');
      x.setAttribute('aria-pressed', 'false');
    });
    b.classList.add('active');
    b.setAttribute('aria-pressed', 'true');
    const tab = b.dataset.tab;
    ['translate', 'rewrite', 'history'].forEach((t) => {
      $('tab-' + t).classList.toggle('hidden', tab !== t);
    });
    if (tab === 'history') renderHistory();
  })
);

// --- Per-site toggle: bật/tắt bong bóng dịch trên site hiện tại ---
async function initSiteToggle() {
  const toggle = $('siteToggle');
  if (!toggle) return;
  let hostname = '';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url || '');
    if (!/^https?:$/.test(url.protocol) || !url.hostname) {
      toggle.classList.add('hidden');
      return;
    }
    hostname = url.hostname;
    toggle.addEventListener('change', async () => {
      try {
        const { vienDisabledSites = [] } = await chrome.storage.local.get('vienDisabledSites');
        let sites = Array.isArray(vienDisabledSites) ? vienDisabledSites : [];
        if (toggle.checked) {
          sites = sites.filter((h) => h !== hostname);
        } else if (!sites.includes(hostname)) {
          sites.push(hostname);
        }
        await chrome.storage.local.set({ vienDisabledSites: sites });
      } catch {}
    });
    const { vienDisabledSites = [] } = await chrome.storage.local.get('vienDisabledSites');
    toggle.checked = !(Array.isArray(vienDisabledSites) && vienDisabledSites.includes(hostname));
  } catch {
    toggle.classList.add('hidden');
  }
}

function sendMsg(msg, timeoutMs = 115000) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error(
        `Hết thời gian chờ (>${Math.round(timeoutMs / 1000)}s) mà background chưa trả lời. ` +
        `Hãy: 1) mở chrome://extensions → bật Developer mode → Inspect service worker xem log [ViEn]; ` +
        `2) kiểm tra mạng tới translate.googleapis.com; ` +
        `3) nếu dùng AI local, kiểm tra server local còn chạy không.`
      ));
    }, timeoutMs);
    chrome.runtime.sendMessage(msg, (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (!res?.ok) return reject(new Error(res?.error || 'Lỗi không xác định'));
      resolve(res);
    });
  });
}

let _loadingTimer = null;
function setLoading(on, btn) {
  $('loading').classList.toggle('hidden', !on);
  if (btn) btn.disabled = on;
  // Đếm giây để user biết request có đang chạy hay đã treo
  if (_loadingTimer) { clearInterval(_loadingTimer); _loadingTimer = null; }
  if (on) {
    const t0 = Date.now();
    const el = $('loadingText');
    _loadingTimer = setInterval(() => {
      if (el) el.textContent = `Đang xử lý... ${((Date.now() - t0) / 1000).toFixed(0)}s`;
    }, 500);
  } else {
    const el = $('loadingText');
    if (el) el.textContent = 'Đang xử lý...';
  }
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
  // Dịch luôn sẵn sàng. Chỉ Rewrite cần provider AI.
  // Đọc trực tiếp từ storage, KHÔNG qua service worker
  // (gọi SW lúc popup mở sẽ bắt Chrome đánh thức SW => popup hiện rất chậm)
  let settings = null;
  try {
    settings = await getSettings();
  } catch {
    settings = null;
  }
  const el = $('providerStatus');
  const aiReady = !!(settings?.apiKey && settings?.baseUrl && settings?.model);
  if (!aiReady) {
    el.textContent = '🌍 Dịch sẵn sàng • ✨ Rewrite cần cấu hình AI (⚙)';
    el.className = 'status warn';
  } else {
    try {
      const u = new URL(settings.baseUrl);
      el.textContent = `🌍 Dịch sẵn sàng • ✨ ${settings.model} @ ${u.host}`;
    } catch {
      el.textContent = `🌍 Dịch sẵn sàng • ✨ ${settings.model}`;
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
    lastSrc = { text, lang: res.source };
    lastDst = { text: res.text, lang: res.target };
    const via = res.providerLabel ? ` • via ${res.providerLabel}` : '';
    showResult(res.text, `${res.source} → ${res.target}${via}`);
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
    const lang = guessLang(text);
    lastSrc = { text, lang };
    lastDst = { text: res.text, lang };
    const label = { professional: 'Chuyên nghiệp 💼', natural: 'Tự nhiên 💬', detailed: 'Chi tiết 📝' }[mode];
    showResult(res.text, `Viết lại • ${label}`);
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
  try {
    await navigator.clipboard.writeText(t);
    $('btnCopy').textContent = '✅';
    setTimeout(() => ($('btnCopy').textContent = '📋'), 1200);
  } catch {
    showError('Không thể copy — trình duyệt chặn clipboard.');
  }
});

$('btnSpeak').addEventListener('click', () => {
  // Loa bản dịch: ưu tiên lang code chính xác từ kết quả dịch
  const t = lastDst?.text || $('resultText').textContent;
  if (!t) return;
  speakLazy(t, lastDst?.lang || guessLang(t));
});

$('btnSpeakSrc').addEventListener('click', () => {
  // Loa văn bản gốc: ưu tiên lang code chính xác từ kết quả dịch
  const t = lastSrc?.text || $('inputText').value.trim() || $('rewriteInput').value.trim();
  if (!t) return;
  speakLazy(t, lastSrc?.lang || guessLang(t));
});

$('btnSpeakInput').addEventListener('click', () => {
  // Loa ngay ở ô nhập (chưa cần dịch): dùng chiều đang chọn, fallback đoán
  const t = $('inputText').value.trim();
  if (!t) return;
  const pair = $('langPair').value;
  const preferred = pair === 'vi-en' ? 'vi' : pair === 'en-vi' ? 'en' : lastSrc?.lang;
  speakLazy(t, lastSrc && lastSrc.text === t ? lastSrc.lang : guessLang(t, preferred));
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

// Enter (không shift) để dịch nhanh
$('inputText').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('btnTranslate').click(); }
});

// Chạy sau khi popup đã paint xong để cửa sổ hiện tức thì.
// getSettingsFast đã có timeout 350ms + cache nên không bao giờ treo popup.
function scheduleStatus() {
  const run = () => refreshStatus().catch(() => {});
  if ('requestIdleCallback' in window) {
    requestIdleCallback(run, { timeout: 500 });
  } else {
    setTimeout(run, 0);
  }
}
scheduleStatus();
initSiteToggle();
