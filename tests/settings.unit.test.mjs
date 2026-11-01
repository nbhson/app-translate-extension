// Unit test cho logic dịch core (các hàm pure, không đụng DOM/network):
//  - js/settings.js: detectLang, normalizeBaseUrl, LANG_PAIRS/REWRITE_MODES
//  - js/translate.js: resolvePair (xác định chiều dịch)
// Chạy: node --test tests/
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectLang, normalizeBaseUrl, LANG_PAIRS, REWRITE_MODES, DEFAULT_SETTINGS } from '../js/settings.js';
import { resolvePair } from '../js/translate.js';

describe('detectLang (heuristic dấu tiếng Việt)', () => {
  it('có dấu -> vi', () => {
    assert.equal(detectLang('Xin chào thế giới'), 'vi');
    assert.equal(detectLang('HỌ SINH ĐẠI HỌC'), 'vi'); // không phân biệt hoa/thường
    assert.equal(detectLang('đường'), 'vi'); // chữ đ
  });
  it('không dấu -> en', () => {
    assert.equal(detectLang('Hello world'), 'en');
    assert.equal(detectLang(''), 'en');
    assert.equal(detectLang('123 !@#'), 'en');
  });
});

describe('normalizeBaseUrl', () => {
  it('cắt dấu / thừa ở cuối', () => {
    assert.equal(normalizeBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
    assert.equal(normalizeBaseUrl('https://api.openai.com/v1///'), 'https://api.openai.com/v1');
  });
  it('trim khoảng trắng + rỗng -> rỗng', () => {
    assert.equal(normalizeBaseUrl('  https://x.y/v1  '), 'https://x.y/v1');
    assert.equal(normalizeBaseUrl(''), '');
    assert.equal(normalizeBaseUrl(undefined), '');
  });
});

describe('resolvePair (chiều dịch ViEn)', () => {
  it('auto: tiếng Việt -> en', () => {
    assert.deepEqual(resolvePair('Xin chào bạn', 'auto', 'auto'), { source: 'vi', target: 'en' });
  });
  it('auto: tiếng Anh -> vi', () => {
    assert.deepEqual(resolvePair('Hello world', 'auto', 'auto'), { source: 'en', target: 'vi' });
  });
  it('ép chiều cụ thể vi->en giữ nguyên', () => {
    assert.deepEqual(resolvePair('Hello', 'vi', 'en'), { source: 'vi', target: 'en' });
  });
  it('source cụ thể + target auto -> suy ra chiều đối', () => {
    assert.deepEqual(resolvePair('Xin chào', 'vi', 'auto'), { source: 'vi', target: 'en' });
    assert.deepEqual(resolvePair('Hello', 'en', 'auto'), { source: 'en', target: 'vi' });
  });
  it('target cụ thể + source auto -> chiều theo target (chỉ hỗ trợ vi<->en)', () => {
    assert.deepEqual(resolvePair('Hello', 'auto', 'en'), { source: 'vi', target: 'en' });
    assert.deepEqual(resolvePair('Xin chào', 'auto', 'vi'), { source: 'en', target: 'vi' });
  });
  it('đầu vào rỗng/undefined -> mặc định en->vi (không dấu)', () => {
    assert.deepEqual(resolvePair('', 'auto', 'auto'), { source: 'en', target: 'vi' });
    assert.deepEqual(resolvePair('Hello', undefined, undefined), { source: 'en', target: 'vi' });
  });
});

describe('constants khớp UI (settings.js)', () => {
  it('LANG_PAIRS có đủ vi-en / en-vi / auto', () => {
    assert.deepEqual(Object.keys(LANG_PAIRS).sort(), ['auto', 'en-vi', 'vi-en']);
    assert.equal(LANG_PAIRS['vi-en'].source, 'vi');
    assert.equal(LANG_PAIRS['en-vi'].target, 'vi');
  });
  it('REWRITE_MODES có 3 mode và khớp mode mặc định', () => {
    assert.deepEqual(Object.keys(REWRITE_MODES).sort(), ['detailed', 'natural', 'professional']);
    assert.ok(REWRITE_MODES[DEFAULT_SETTINGS.defaultRewriteMode], 'defaultRewriteMode phải trỏ tới mode tồn tại');
  });
  it('defaultPair khớp key LANG_PAIRS', () => {
    assert.ok(LANG_PAIRS[DEFAULT_SETTINGS.defaultPair]);
  });
});
