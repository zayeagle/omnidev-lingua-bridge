import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  translateWithChromeTranslator,
  translateWithLibreTranslate,
} from './free-translate';

describe('free-translate (F14)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('TC-F14-U02: Chrome Translator missing → null', async () => {
    vi.stubGlobal('Translator', undefined);
    const out = await translateWithChromeTranslator(['hello'], 'zh');
    expect(out).toBeNull();
  });

  it('LibreTranslate maps batch response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ translatedText: ['你好', '世界'] }),
      })),
    );
    const out = await translateWithLibreTranslate(['hello', 'world'], 'zh', [
      'https://example.test/translate',
    ]);
    expect(out).toEqual(['你好', '世界']);
  });
});
