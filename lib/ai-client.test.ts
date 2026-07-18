import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mapHttpError,
  sanitizeErrorMessage,
  translateTexts,
  AiClientError,
} from './ai-client';
import { handleAiRequest } from './ai-handler';
import { DEFAULT_SETTINGS, type ExtensionSettings } from './storage';

const config = {
  apiKey: 'sk-secret-key',
  baseUrl: 'https://api.example.com/v1',
  chatModel: 'gpt-4o-mini',
  sttModel: 'whisper-1',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ai-client (F2 UNIT)', () => {
  it('TC-F2-U01 Happy: translate returns lines', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '["你好"]' } }],
          }),
      }),
    );
    const out = await translateTexts(config, ['Hello']);
    expect(out).toEqual(['你好']);
  });

  it('TC-F2-U02 Err: 401 maps to check key', () => {
    const err = mapHttpError(401, 'unauthorized');
    expect(err).toBeInstanceOf(AiClientError);
    expect(err.message).toMatch(/API Key/);
  });

  it('TC-F2-U03 Err: network then retry succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '["世界"]' } }],
          }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const out = await translateTexts(config, ['World']);
    expect(out).toEqual(['世界']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('TC-F2-U04 Boundary: empty text skips HTTP', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await translateTexts(config, ['', '  ']);
    expect(out).toEqual(['', '']);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never leaks api key in sanitize', () => {
    expect(sanitizeErrorMessage('bad sk-secret-key oops', 'sk-secret-key')).toBe(
      'bad [REDACTED] oops',
    );
  });

  it('TC-S3-U02: sanitize redacts iflytekApiSecret', () => {
    expect(
      sanitizeErrorMessage(
        'boom key=sk-iflytek-key secret=sec-xyz-token',
        'sk-iflytek-key',
        'sec-xyz-token',
      ),
    ).toBe('boom key=[REDACTED] secret=[REDACTED]');
  });
});

describe('ai-handler messaging (F2 INT-ish)', () => {
  it('TC-F2-I01 content→handler translate batch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '["一","二"]' } }],
          }),
      }),
    );
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      aiConfig: config,
    };
    const res = await handleAiRequest(settings, {
      type: 'ai.translate',
      texts: ['one', 'two'],
      targetLang: 'zh',
    });
    expect(res.ok).toBe(true);
    if (res.ok && 'translations' in res) {
      expect(res.translations).toEqual(['一', '二']);
    }
  });

  it('handleAiRequest never returns raw api key in error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(`network boom ${config.apiKey}`)),
    );
    const settings: ExtensionSettings = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      aiConfig: config,
    };
    const res = await handleAiRequest(settings, {
      type: 'ai.translate',
      texts: ['x'],
      targetLang: 'zh',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toContain(config.apiKey);
      expect(res.error).toContain('[REDACTED]');
    }
  });
});
