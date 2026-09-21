import { getSettings } from './js/settings.js';
import { chatCompletions, buildTranslateMessages, buildRewriteMessages } from './js/api.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'translate-auto',
    title: 'Dịch nhanh (Tự động Vi ⇄ En)',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'translate-vi-en',
    title: 'Dịch Việt → Anh',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'translate-en-vi',
    title: 'Dịch Anh → Việt',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'rewrite-natural',
    title: 'Viết lại tự nhiên',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'rewrite-professional',
    title: 'Viết lại chuyên nghiệp',
    contexts: ['selection']
  });
});

async function doTranslate(text, source, target) {
  const t = (text || '').trim();
  if (!t) throw new Error('Văn bản trống — hãy bôi đen văn bản cần dịch rồi thử lại.');
  const s = await getSettings();
  const { messages, resolved } = buildTranslateMessages(t, source, target);
  const result = await chatCompletions({
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    model: s.model,
    messages,
    temperature: 0.3
  });
  return { text: result, ...resolved };
}

async function doRewrite(text, mode) {
  const s = await getSettings();
  const messages = buildRewriteMessages(text, mode);
  const result = await chatCompletions({
    baseUrl: s.baseUrl,
    apiKey: s.apiKey,
    model: s.model,
    messages,
    temperature: Number(s.temperature ?? 0.5)
  });
  return { text: result };
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const selected = (info.selectionText || '').trim();
  if (!selected || !tab?.id) return;
  try {
    let payload;
    if (info.menuItemId === 'translate-vi-en') payload = await doTranslate(selected, 'vi', 'en');
    else if (info.menuItemId === 'translate-en-vi') payload = await doTranslate(selected, 'en', 'vi');
    else if (info.menuItemId === 'rewrite-natural') payload = await doRewrite(selected, 'natural');
    else if (info.menuItemId === 'rewrite-professional') payload = await doRewrite(selected, 'professional');
    else payload = await doTranslate(selected, 'auto', 'auto');

    await chrome.tabs.sendMessage(tab.id, {
      type: 'VIEN_SHOW_RESULT',
      original: selected,
      result: payload.text,
      kind: info.menuItemId.startsWith('rewrite') ? 'rewrite' : 'translate'
    });
  } catch (e) {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'VIEN_SHOW_RESULT', original: selected, result: '❌ ' + e.message, error: true });
    } catch {}
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'translate-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'VIEN_TRANSLATE_SHORTCUT' });
});

// Central message hub: popup + content script call background to avoid CORS
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg?.type === 'TRANSLATE') {
      const r = await doTranslate(msg.text, msg.source, msg.target);
      sendResponse({ ok: true, ...r });
    } else if (msg?.type === 'REWRITE') {
      const r = await doRewrite(msg.text, msg.mode);
      sendResponse({ ok: true, ...r });
    } else if (msg?.type === 'GET_SETTINGS') {
      sendResponse({ ok: true, settings: await getSettings() });
    } else {
      sendResponse({ ok: false, error: 'Unknown message' });
    }
  })().catch((e) => sendResponse({ ok: false, error: e.message }));
  return true; // async response
}
);
