// Floating translate bubble: select text => show quick button => click to translate
(() => {
  if (window.__vienInjected) return;
  window.__vienInjected = true;

  let fabBtn = null;
  let card = null;

  function removeFab() { fabBtn?.remove(); fabBtn = null; }
  function removeCard() { card?.remove(); card = null; }

  function getSelectedText() {
    return (window.getSelection()?.toString() || '').trim();
  }

  function ttsLocale(code) {
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
        voices.find((v) => (v.lang || '').toLowerCase() === String(locale).toLowerCase()) ||
        voices.find((v) => (v.lang || '').toLowerCase().startsWith(base)) ||
        null
      );
    } catch { return null; }
  }
  try { speechSynthesis.getVoices?.(); } catch {}

  function speakText(text, langCode) {
    const t = (text || '').trim();
    if (!t) return;
    const locale = ttsLocale(langCode || (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(t) ? 'vi' : 'en'));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = locale;
    const v = pickVoice(locale);
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }

  function showFab(x, y) {
    removeFab();
    fabBtn = document.createElement('button');
    fabBtn.className = 'vien-fab';
    fabBtn.textContent = '🌐 Dịch';
    fabBtn.style.left = `${x}px`;
    fabBtn.style.top = `${y}px`;
    fabBtn.onmousedown = (e) => e.preventDefault();
    fabBtn.onclick = () => {
      const t = getSelectedText();
      if (t) translateSelection(t);
      removeFab();
    };
    document.body.appendChild(fabBtn);
  }

  async function copyText(t) {
    try {
      await navigator.clipboard.writeText(t);
      return;
    } catch {}
    // Fallback cho trang http / khi clipboard API bị chặn
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('copy failed');
  }

  function showCard(original, result, isError, langs) {
    removeCard();
    const srcLang = langs?.source || '';
    const tgtLang = langs?.target || '';
    const langTag = srcLang && tgtLang ? ` (${srcLang.toUpperCase()}→${tgtLang.toUpperCase()})` : '';
    card = document.createElement('div');
    card.className = 'vien-card';
    card.innerHTML = `
      <div class="vien-card-head"><strong>${isError ? '❌ Lỗi' : '🌐 ViEn Translate' + langTag}</strong><button type="button" class="vien-close">✕</button></div>
      <div class="vien-label">📝 Gốc${srcLang ? ' (' + srcLang.toUpperCase() + ')' : ''}</div>
      <div class="vien-orig"></div>
      <div class="vien-actions">
        <button type="button" data-act="copy-orig">📋 Copy gốc</button>
        <button type="button" data-act="speak-orig">🔊 Đọc gốc</button>
      </div>
      <div class="vien-label">🌍 Bản dịch${tgtLang ? ' (' + tgtLang.toUpperCase() + ')' : ''}</div>
      <div class="vien-result"></div>
      <div class="vien-actions">
        <button type="button" data-act="copy">📋 Copy dịch</button>
        <button type="button" data-act="speak">🔊 Đọc dịch</button>
      </div>
      ${isError ? '' : `
      <div class="vien-divider"></div>
      <div class="vien-rewrite-head">
        <span>✨ Viết lại</span>
        <select class="vien-mode">
          <option value="natural" selected>💬 Tự nhiên</option>
          <option value="professional">💼 Chuyên nghiệp</option>
          <option value="detailed">📝 Chi tiết</option>
        </select>
      </div>
      <div class="vien-rewrite vien-rewrite-empty">Bấm “Viết lại” để AI viết lại đoạn gốc đã tô đen (giữ nguyên ngôn ngữ).</div>
      <div class="vien-actions">
        <button type="button" data-act="copy-rewrite">📋 Copy</button>
        <button type="button" data-act="rewrite">✨ Viết lại</button>
      </div>`}`;
    card.querySelector('.vien-orig').textContent = original.slice(0, 500);
    card.querySelector('.vien-result').textContent = result;
    // Cách ly popover khỏi handler chuột của trang (Gmail/SPA hay chặn sự kiện)
    ['mousedown', 'mouseup', 'click'].forEach((ev) =>
      card.addEventListener(ev, (e) => e.stopPropagation())
    );
    card.querySelector('.vien-close').onclick = removeCard;

    const translated = result; // bản dịch, chỉ để hiển thị
    const sourceForRewrite = original; // viết lại đoạn GỐC đã tô đen, giữ nguyên ngôn ngữ gốc
    let rewritten = '';

    const flash = (btn, okText, failText, fn) => {
      btn.onclick = async (e) => {
        const b = e.currentTarget;
        try {
          await fn();
          b.textContent = okText;
        } catch {
          b.textContent = failText;
        }
        setTimeout(() => (b.textContent = b.dataset.label), 1500);
      };
      btn.dataset.label = btn.textContent;
    };

    flash(card.querySelector('[data-act="copy"]'), '✅ Copied', '❌ Copy lỗi', async () => {
      await copyText(translated);
    });
    flash(card.querySelector('[data-act="copy-orig"]'), '✅ Copied', '❌ Copy lỗi', async () => {
      await copyText(original);
    });
    flash(card.querySelector('[data-act="speak"]'), '🔊 Đang đọc...', '❌ Lỗi đọc', async () => {
      speakText(translated, tgtLang);
    });
    flash(card.querySelector('[data-act="speak-orig"]'), '🔊 Đang đọc...', '❌ Lỗi đọc', async () => {
      speakText(original, srcLang);
    });

    if (isError) {
      document.body.appendChild(card);
      return;
    }

    const rewriteBox = card.querySelector('.vien-rewrite');
    const modeSel = card.querySelector('.vien-mode');
    const rewriteBtn = card.querySelector('[data-act="rewrite"]');
    rewriteBtn.dataset.label = rewriteBtn.textContent;
    rewriteBtn.onclick = (e) => {
      const btn = e.currentTarget;
      if (btn.disabled) return;
      if (!chrome.runtime?.id) {
        rewriteBox.textContent = '🔄 Extension vừa được Reload. Tải lại trang (F5) rồi thử lại.';
        rewriteBox.classList.remove('vien-rewrite-empty');
        return;
      }
      const mode = modeSel.value;
      const modeLabel = modeSel.options[modeSel.selectedIndex].text;
      btn.disabled = true;
      btn.textContent = '⏳ Đang viết lại...';
      rewriteBox.textContent = '⏳ Đang viết lại...';
      rewriteBox.classList.remove('vien-rewrite-empty');
      chrome.runtime.sendMessage({ type: 'REWRITE', text: sourceForRewrite, mode }, (res) => {
        btn.disabled = false;
        btn.textContent = btn.dataset.label;
        if (chrome.runtime.lastError) {
          rewriteBox.textContent = '❌ ' + chrome.runtime.lastError.message;
          return;
        }
        if (res?.ok) {
          rewritten = res.text;
          rewriteBox.textContent = res.text;
          card.querySelector('.vien-rewrite-head span').textContent = '✨ Viết lại • ' + modeLabel;
        } else {
          rewriteBox.textContent = '❌ ' + (res?.error || 'lỗi không xác định');
        }
      });
    };
    flash(card.querySelector('[data-act="copy-rewrite"]'), '✅ Copied', '❌ Chưa có gì', async () => {
      if (!rewritten) throw new Error('empty');
      await copyText(rewritten);
    });
    document.body.appendChild(card);
  }

  function sendTranslate(text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'TRANSLATE', text, source: 'auto', target: 'auto' }, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res?.ok) return reject(new Error(res?.error));
        resolve(res);
      });
    });
  }

  async function translateSelection(text) {
    // Script cũ còn sót sau khi Reload extension sẽ mất kết nối -> báo rõ
    if (!chrome.runtime?.id) {
      showCard(text, '🔄 Extension vừa được Reload/cập nhật.\nVui lòng tải lại trang (F5) rồi thử lại.', true);
      return;
    }
    showCard(text, '⏳ Đang dịch...', false);
    try {
      const res = await sendTranslate(text);
      showCard(text, res.text, false, { source: res.source, target: res.target });
    } catch (e) {
      const msg = e.message || 'lỗi';
      if (/context invalidated/i.test(msg)) {
        showCard(text, '🔄 Extension vừa được Reload/cập nhật.\nVui lòng tải lại trang (F5) rồi thử lại.', true);
      } else {
        showCard(text, '❌ ' + msg, true);
      }
    }
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target?.closest?.('.vien-card, .vien-fab')) return;
    setTimeout(() => {
      const t = getSelectedText();
      if (t && t.length > 1 && t.length < 3000) {
        const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();
        showFab(rect.left + window.scrollX, rect.bottom + window.scrollY + 6);
      } else {
        removeFab();
      }
    }, 10);
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target?.closest?.('.vien-card, .vien-fab')) {
      removeFab();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { removeFab(); removeCard(); }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'VIEN_SHOW_RESULT') {
      showCard(msg.original || '', msg.result || '', !!msg.error, { source: msg.source, target: msg.target });
    } else if (msg?.type === 'VIEN_TRANSLATE_SHORTCUT') {
      const t = getSelectedText();
      if (t) translateSelection(t);
    }
  });
})();
