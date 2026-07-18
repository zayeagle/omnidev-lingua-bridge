import { describe, expect, it } from 'vitest';
import {
  applyToggle,
  applySpeechMode,
  canEnable,
  hasEncryptedKey,
  hasIflytekCredentials,
  hasStoredCredential,
  hasValidApiKey,
  isIflytekProvider,
  isValidBaseUrl,
  normalizeSpeechMode,
  normalizePageMode,
  applyPageMode,
  requiresBaseUrlTrustAck,
  resolveEnabledAfterSave,
  validateAiConfig,
  DEFAULT_AI_CONFIG,
  DEFAULT_SECURITY,
  DEFAULT_SETTINGS,
} from './storage';

describe('storage helpers (F1 UNIT)', () => {
  it('TC-F1-U01 Happy: validateAiConfig persists shape', () => {
    const cfg = validateAiConfig({
      apiKey: ' sk-test ',
      baseUrl: 'https://api.openai.com/v1/',
      chatModel: 'gpt-4o-mini',
    });
    expect(cfg.apiKey).toBe('sk-test');
    expect(cfg.baseUrl).toBe('https://api.openai.com/v1');
    expect(hasValidApiKey(cfg)).toBe(true);
  });

  it('TC-F1-U02 Err: empty key rejected', () => {
    expect(() => validateAiConfig({ apiKey: '  ' })).toThrow(/API Key/);
  });

  it('TC-F13-U01/U02: enable without API Key allowed', () => {
    expect(canEnable(DEFAULT_SETTINGS)).toBe(true);
    const result = applyToggle(DEFAULT_SETTINGS, true);
    expect(result.settings.enabled).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('TC-F13-U03: validateAiConfig allowEmptyKey', () => {
    const cfg = validateAiConfig({ apiKey: '' }, { allowEmptyKey: true });
    expect(cfg.apiKey).toBe('');
    expect(hasValidApiKey(cfg)).toBe(false);
  });

  it('TC-F1-U04 Boundary: auto-enable when key becomes valid', () => {
    const aiConfig = validateAiConfig({ apiKey: 'sk-ok', baseUrl: DEFAULT_AI_CONFIG.baseUrl });
    const next = { ...DEFAULT_SETTINGS, aiConfig };
    expect(resolveEnabledAfterSave(DEFAULT_SETTINGS, next)).toBe(true);
  });

  it('TC-F6-U01/U02 https-only Base URL', () => {
    expect(isValidBaseUrl('not-a-url')).toBe(false);
    expect(isValidBaseUrl('http://api.openai.com/v1')).toBe(false);
    expect(isValidBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(() => validateAiConfig({ apiKey: 'sk', baseUrl: 'http://evil.test' })).toThrow(
      /https/,
    );
    expect(() => validateAiConfig({ apiKey: 'sk', baseUrl: 'ftp://x' })).toThrow(/Base URL/);
    expect(requiresBaseUrlTrustAck('https://api.openai.com/v1')).toBe(false);
    expect(requiresBaseUrlTrustAck('https://api.deepseek.com/v1')).toBe(true);
  });

  it('speechMode only caption|voice', () => {
    expect(normalizeSpeechMode('voice')).toBe('voice');
    expect(normalizeSpeechMode('other')).toBe('caption');
    expect(applySpeechMode(DEFAULT_SETTINGS, 'voice').speechMode).toBe('voice');
  });

  it('TC-F17: default pageMode is selection', () => {
    expect(DEFAULT_SETTINGS.pageMode).toBe('selection');
    expect(normalizePageMode('auto')).toBe('auto');
    expect(normalizePageMode('other')).toBe('selection');
    expect(applyPageMode(DEFAULT_SETTINGS, 'auto').pageMode).toBe('auto');
  });

  it('iflytek credentials require APPID + Key + Secret', () => {
    const incomplete = validateAiConfig(
      { providerId: 'iflytek', apiKey: 'k', iflytekAppId: 'app', iflytekApiSecret: '' },
      { allowEmptyKey: true },
    );
    expect(isIflytekProvider(incomplete)).toBe(true);
    expect(hasIflytekCredentials(incomplete)).toBe(false);
    expect(hasValidApiKey(incomplete)).toBe(false);

    const ok = validateAiConfig({
      providerId: 'iflytek',
      apiKey: 'k',
      iflytekAppId: 'app',
      iflytekApiSecret: 'sec',
    });
    expect(hasIflytekCredentials(ok)).toBe(true);
    expect(hasValidApiKey(ok)).toBe(true);
    expect(ok.sttModel).toBe('mul_cn');
    expect(ok.iflytekSttProduct).toBe('mul_cn');
    expect(ok.iflytekMtProduct).toBe('its');
    expect(ok.iflytekTtsProduct).toBe('oral');
    expect(ok.iflytekPipeline).toBe('composed');
  });

  it('iflytekPipeline simult is preserved', () => {
    const cfg = validateAiConfig({
      providerId: 'iflytek',
      apiKey: 'k',
      iflytekAppId: 'app',
      iflytekApiSecret: 'sec',
      iflytekPipeline: 'simult',
    });
    expect(cfg.iflytekPipeline).toBe('simult');
    expect(cfg.sttModel).toBe('simult');
  });

  it('iflytek composed product selection is preserved', () => {
    const cfg = validateAiConfig({
      providerId: 'iflytek',
      apiKey: 'k',
      iflytekAppId: 'app',
      iflytekApiSecret: 'sec',
      iflytekPipeline: 'composed',
      iflytekSttProduct: 'dialect',
      iflytekMtProduct: 'its',
      iflytekTtsProduct: 'online',
    });
    expect(cfg.iflytekSttProduct).toBe('dialect');
    expect(cfg.sttModel).toBe('dialect');
    expect(cfg.iflytekTtsProduct).toBe('online');
    expect(cfg.ttsModel).toBe('online');
  });

  it('security vault flag ignores remembered passphrase', () => {
    expect(DEFAULT_SECURITY.rememberedPassphrase).toBe('');
    expect(
      hasEncryptedKey({
        hardeningEnabled: true,
        saltB64: 's',
        ivB64: 'i',
        cipherB64: 'c',
        rememberedPassphrase: '',
      }),
    ).toBe(true);
  });

  it('TC-S-U01-ish: hardened iflytek credential needs appId only in storage', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      aiConfig: {
        ...DEFAULT_AI_CONFIG,
        providerId: 'iflytek' as const,
        apiKey: '',
        iflytekAppId: 'app',
        iflytekApiSecret: '',
      },
      security: {
        hardeningEnabled: true,
        saltB64: 's',
        ivB64: 'i',
        cipherB64: 'cipher',
        rememberedPassphrase: '',
      },
    };
    expect(hasEncryptedKey(settings.security)).toBe(true);
    expect(hasStoredCredential(settings)).toBe(true);
  });
});
