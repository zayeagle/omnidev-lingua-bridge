import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handleAiRequest } from '../ai-handler';
import * as iflytek from './index';
import { isIflytekSimultPipeline } from './index';
import { DEFAULT_SETTINGS, validateAiConfig } from '../storage';

describe('iflytek routing (F23 UNIT)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects incomplete iflytek credentials', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      aiConfig: validateAiConfig(
        { providerId: 'iflytek', apiKey: '', iflytekAppId: '', iflytekApiSecret: '' },
        { allowEmptyKey: true },
      ),
    };
    const res = await handleAiRequest(settings, {
      type: 'ai.translate',
      texts: ['hi'],
      targetLang: 'zh',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/讯飞/);
  });

  it('simult pipeline still uses text MT for bubble/page translate', async () => {
    const aiConfig = validateAiConfig({
      providerId: 'iflytek',
      apiKey: 'k',
      iflytekAppId: 'app',
      iflytekApiSecret: 'sec',
      iflytekPipeline: 'simult',
      iflytekMtProduct: 'its',
    });
    expect(isIflytekSimultPipeline(aiConfig)).toBe(true);
    const mt = vi
      .spyOn(iflytek, 'iflytekTranslateTexts')
      .mockResolvedValue(['你好']);
    const res = await handleAiRequest(
      { ...DEFAULT_SETTINGS, aiConfig },
      { type: 'ai.translate', texts: ['hi'], targetLang: 'zh' },
    );
    expect(mt).toHaveBeenCalledOnce();
    expect(res.ok).toBe(true);
    if (res.ok && 'translations' in res) {
      expect(res.translations).toEqual(['你好']);
    }
  });

  it('composed pipeline chains STT then MT after recognition text', async () => {
    const aiConfig = validateAiConfig({
      providerId: 'iflytek',
      apiKey: 'k',
      iflytekAppId: 'app',
      iflytekApiSecret: 'sec',
      iflytekPipeline: 'composed',
    });
    const stt = vi
      .spyOn(iflytek, 'iflytekTranscribeAudio')
      .mockResolvedValue('Hello world');
    const mt = vi
      .spyOn(iflytek, 'iflytekTranslateTexts')
      .mockResolvedValue(['你好世界']);

    const res = await handleAiRequest(
      { ...DEFAULT_SETTINGS, aiConfig },
      {
        type: 'ai.transcribe',
        audioBase64: 'AA==',
        mimeType: 'audio/pcm',
        targetLang: 'zh',
      },
    );

    expect(stt).toHaveBeenCalledOnce();
    expect(mt).toHaveBeenCalledOnce();
    expect(mt.mock.calls[0]?.[1]).toEqual(['Hello world']);
    expect(res.ok).toBe(true);
    if (res.ok && 'translation' in res) {
      expect(res.text).toBe('Hello world');
      expect(res.translation).toBe('你好世界');
    }
  });
});
