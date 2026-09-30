// Smoke test cho chuỗi fallback dịch:
//   Google -> MyMemory -> LibreTranslate -> Lingva -> LLM (cuối cùng)
// Chạy: node --test tests/
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { translateWithFallback, translateFree, resolvePair } from '../js/translate.js';
import { buildTranslateMessages } from '../js/api.js';

function res429() {
  return { ok: false, status: 429, headers: { get: () => null } };
}

describe('resolvePair', () => {
  it('auto: tiếng Việt -> en', () => {
    assert.deepEqual(resolvePair('Xin chào bạn', 'auto', 'auto'), { source: 'vi', target: 'en' });
  });
  it('auto: tiếng Anh -> vi', () => {
    assert.deepEqual(resolvePair('Hello world', 'auto', 'auto'), { source: 'en', target: 'vi' });
  });
});

describe('buildTranslateMessages', () => {
  it('tạo system prompt dịch vi->en, chỉ trả bản dịch', () => {
    const msgs = buildTranslateMessages('Xin chào', 'vi', 'en');
    assert.equal(msgs.length, 2);
    assert.match(msgs[0].content, /Vietnamese/i);
    assert.match(msgs[0].content, /English/i);
    assert.match(msgs[0].content, /ONLY the translated text/i);
    assert.equal(msgs[1].content, 'Xin chào');
  });
});

describe('translateWithFallback', () => {
  beforeEach(() => {
    globalThis.fetch = undefined;
  });

  it('Google 429 -> fallback MyMemory thành công, ghi nhận tried', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('translate.googleapis.com')) return res429();
      if (String(url).includes('mymemory')) {
        return { ok: true, json: async () => ({ responseStatus: 200, responseData: { translatedText: 'Hello fallback test' } }) };
      }
      throw new Error('Không mong đợi gọi tới: ' + url);
    };
    const r = await translateWithFallback('Xin chào fallback test', 'vi', 'en');
    assert.equal(r.text, 'Hello fallback test');
    assert.equal(r.provider, 'mymemory');
    assert.equal(r.tried.length, 1);
    assert.equal(r.tried[0].provider, 'google');
  });

  it('tất cả free lỗi + chưa cấu hình LLM -> lỗi tổng hợp kèm gợi ý AI', async () => {
    globalThis.fetch = async () => res429();
    await assert.rejects(
      () => translateWithFallback('Đoạn lỗi tổng hợpTest no llm', 'vi', 'en', { llm: {} }),
      (e) => {
        assert.match(e.message, /Tất cả nguồn dịch đều lỗi/);
        assert.match(e.message, /Google/);
        assert.match(e.message, /MyMemory/);
        assert.match(e.message, /LibreTranslate/);
        assert.match(e.message, /Lingva/);
        assert.match(e.message, /LLM/);
        return true;
      }
    );
  });

  it('tất cả free lỗi + có LLM -> LLM là lớp cuối cùng', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('/chat/completions')) {
        return { ok: true, json: async () => ({ choices: [{ message: { content: 'Hello via LLM' } }] }) };
      }
      return res429();
    };
    const r = await translateWithFallback('Đoạn test LLM cuối cùngTest', 'vi', 'en', {
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', model: 'gpt-4o-mini' }
    });
    assert.equal(r.provider, 'llm');
    assert.equal(r.text, 'Hello via LLM');
    assert.equal(r.tried.length, 4); // 4 tầng free đều đã thử
  });

  it('translateFree tương thích ngược, trả cùng kết quả chain', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('translate.googleapis.com')) {
        return {
          ok: true,
          json: async () => [[['Hello compat', 'Xin chào']]]
        };
      }
      throw new Error('Không mong đợi gọi tới: ' + url);
    };
    const r = await translateFree('Xin chào compatTest', 'vi', 'en');
    assert.equal(r.text, 'Hello compat');
    assert.equal(r.provider, 'google');
  });

  it('kết quả đã cache -> không gọi fetch nữa', async () => {
    globalThis.fetch = async (url) => {
      if (String(url).includes('translate.googleapis.com')) {
        return { ok: true, json: async () => [[['Hi cached', 'Chào']]] };
      }
      throw new Error('Không mong đợi gọi tới: ' + url);
    };
    const text = 'Chào cacheTest';
    const first = await translateWithFallback(text, 'vi', 'en');
    assert.equal(first.cached, undefined);
    globalThis.fetch = async () => {
      throw new Error('Cache hit nên không được gọi fetch');
    };
    const second = await translateWithFallback(text, 'vi', 'en');
    assert.equal(second.cached, true);
    assert.equal(second.text, first.text);
  });
});
