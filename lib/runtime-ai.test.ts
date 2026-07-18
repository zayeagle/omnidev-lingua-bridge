/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./public-prefs', () => ({
  publicPrefsItem: {
    getValue: vi.fn(),
  },
}));

vi.mock('./free-translate', () => ({
  tryLocalFreeTranslate: vi.fn(),
}));

import { publicPrefsItem } from './public-prefs';
import { tryLocalFreeTranslate } from './free-translate';
import { requestTranslate } from './runtime-ai';

describe('requestTranslate provider-first', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn(),
      },
    });
  });

  it('with credentials: calls provider before free', async () => {
    vi.mocked(publicPrefsItem.getValue).mockResolvedValue({
      enabled: true,
      speechMode: 'caption',
      pageMode: 'selection',
      hasApiKey: true,
      providerId: 'iflytek',
      iflytekPipeline: 'composed',
    });
    const send = vi.mocked(browser.runtime.sendMessage);
    send.mockResolvedValue({ ok: true, translations: ['你好'] });
    vi.mocked(tryLocalFreeTranslate).mockResolvedValue(['免费']);

    const out = await requestTranslate(['hello'], 'zh');
    expect(out).toEqual(['你好']);
    expect(send).toHaveBeenCalled();
    expect(tryLocalFreeTranslate).not.toHaveBeenCalled();
  });

  it('with credentials: free only after provider fails', async () => {
    vi.mocked(publicPrefsItem.getValue).mockResolvedValue({
      enabled: true,
      speechMode: 'caption',
      pageMode: 'selection',
      hasApiKey: true,
      providerId: 'iflytek',
      iflytekPipeline: 'composed',
    });
    vi.mocked(browser.runtime.sendMessage).mockResolvedValue({
      ok: false,
      error: '供应商挂了',
    });
    vi.mocked(tryLocalFreeTranslate).mockResolvedValue(['降级译文']);

    const out = await requestTranslate(['hello'], 'zh');
    expect(out).toEqual(['降级译文']);
    expect(tryLocalFreeTranslate).toHaveBeenCalled();
  });

  it('without credentials: free first', async () => {
    vi.mocked(publicPrefsItem.getValue).mockResolvedValue({
      enabled: true,
      speechMode: 'caption',
      pageMode: 'selection',
      hasApiKey: false,
      providerId: 'openai',
      iflytekPipeline: 'composed',
    });
    vi.mocked(tryLocalFreeTranslate).mockResolvedValue(['本地']);
    const send = vi.mocked(browser.runtime.sendMessage);

    const out = await requestTranslate(['hello'], 'zh');
    expect(out).toEqual(['本地']);
    expect(send).not.toHaveBeenCalled();
  });
});
