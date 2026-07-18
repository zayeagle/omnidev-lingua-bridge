/** Storage schema + pure helpers (UNIT-testable without browser). */

import { sanitizeIflytekToken } from './iflytek/auth';
import {
  DEFAULT_IFLYTEK_MT,
  DEFAULT_IFLYTEK_STT,
  DEFAULT_IFLYTEK_TTS,
  normalizeIflytekMtProduct,
  normalizeIflytekSttProduct,
  normalizeIflytekTtsProduct,
  type IflytekMtProductId,
  type IflytekSttProductId,
  type IflytekTtsProductId,
} from './iflytek/products';

export type SpeechMode = 'caption' | 'voice';

/** Page text UX: selection bubble (default) or full-page auto translate. */
export type PageMode = 'selection' | 'auto';

/**
 * iFlytek speech path:
 * - composed: STT + MT + TTS (products selectable; defaults = 多语种+翻译新+超拟人)
 * - simult: 控制台「同声传译」一体 WebSocket
 */
export type IflytekPipeline = 'composed' | 'simult';

export type {
  IflytekMtProductId,
  IflytekSttProductId,
  IflytekTtsProductId,
};

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  sttModel: string;
  ttsModel: string;
  /** UI preset: openai | deepseek | anthropic | openrouter | iflytek | custom */
  providerId?: string;
  /** iFlytek APPID (when providerId=iflytek) */
  iflytekAppId?: string;
  /** iFlytek APISecret (APIKey uses apiKey field for vault compatibility) */
  iflytekApiSecret?: string;
  /** Which iFlytek product line to use for video SI */
  iflytekPipeline?: IflytekPipeline;
  /** Composed-line STT console product (default mul_cn) */
  iflytekSttProduct?: IflytekSttProductId;
  /** Composed-line MT console product (default its) */
  iflytekMtProduct?: IflytekMtProductId;
  /** Composed-line TTS console product (default oral) */
  iflytekTtsProduct?: IflytekTtsProductId;
}

export type SecurityState = {
  hardeningEnabled: boolean;
  saltB64: string;
  ivB64: string;
  cipherB64: string;
  /**
   * @deprecated Never persist. Kept optional for migrate-delete of old profiles.
   * Unlock lives only in SW memory (`key-session`).
   */
  rememberedPassphrase?: string;
};

export interface ExtensionSettings {
  enabled: boolean;
  /** Simultaneous interpretation output: silent captions or spoken translation. */
  speechMode: SpeechMode;
  /** Default selection bubble; auto = viewport full-page translate. */
  pageMode: PageMode;
  aiConfig: AiConfig;
  security: SecurityState;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  chatModel: 'gpt-4o-mini',
  sttModel: 'whisper-1',
  ttsModel: 'tts-1',
  providerId: 'openai',
  iflytekAppId: '',
  iflytekApiSecret: '',
  iflytekPipeline: 'composed',
  iflytekSttProduct: DEFAULT_IFLYTEK_STT,
  iflytekMtProduct: DEFAULT_IFLYTEK_MT,
  iflytekTtsProduct: DEFAULT_IFLYTEK_TTS,
};

export function normalizeIflytekPipeline(mode: unknown): IflytekPipeline {
  return mode === 'simult' ? 'simult' : 'composed';
}

export const IFLYTEK_BASE_URL = 'https://itrans.xf-yun.com';

export function isIflytekProvider(config: Pick<AiConfig, 'providerId'>): boolean {
  return (config.providerId ?? '').trim() === 'iflytek';
}

/** APPID + APIKey + APISecret all present (APIKey may be unlocked in memory). */
export function hasIflytekCredentials(config: AiConfig): boolean {
  return (
    !!(config.iflytekAppId ?? '').trim() &&
    !!config.apiKey.trim() &&
    !!(config.iflytekApiSecret ?? '').trim()
  );
}

export const DEFAULT_SECURITY: SecurityState = {
  hardeningEnabled: false,
  saltB64: '',
  ivB64: '',
  cipherB64: '',
  rememberedPassphrase: '',
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: false,
  speechMode: 'caption',
  pageMode: 'selection',
  aiConfig: { ...DEFAULT_AI_CONFIG },
  security: { ...DEFAULT_SECURITY },
};

export function hasValidApiKey(config: AiConfig): boolean {
  if (isIflytekProvider(config)) {
    return hasIflytekCredentials(config);
  }
  return config.apiKey.trim().length > 0;
}

export function hasEncryptedKey(security: SecurityState): boolean {
  return security.hardeningEnabled && security.cipherB64.trim().length > 0;
}

/** Plaintext key present, or encrypted vault configured. */
export function hasStoredCredential(settings: ExtensionSettings): boolean {
  if (hasEncryptedKey(settings.security)) {
    // iFlytek APISecret lives inside the vault when hardened — only APPID remains clear.
    if (isIflytekProvider(settings.aiConfig)) {
      return !!(settings.aiConfig.iflytekAppId ?? '').trim();
    }
    return true;
  }
  return hasValidApiKey(settings.aiConfig);
}

/** Only https — http Base URL would MITM the Bearer token. */
export function isValidBaseUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Host of default OpenAI endpoint (no trust checkbox required). */
export function isDefaultAiHost(baseUrl: string): boolean {
  try {
    return new URL(baseUrl.trim()).hostname === 'api.openai.com';
  } catch {
    return false;
  }
}

/** Non-default https hosts require explicit user acknowledgement. */
export function requiresBaseUrlTrustAck(baseUrl: string): boolean {
  if (!isValidBaseUrl(baseUrl)) return false;
  return !isDefaultAiHost(baseUrl);
}

export function normalizeSpeechMode(mode: unknown): SpeechMode {
  return mode === 'voice' ? 'voice' : 'caption';
}

export function normalizePageMode(mode: unknown): PageMode {
  return mode === 'auto' ? 'auto' : 'selection';
}

/** Validate and normalize AI config. Throws with user-facing message. */
export function validateAiConfig(
  input: Partial<AiConfig>,
  opts: { allowEmptyKey?: boolean } = {},
): AiConfig {
  const providerId = (input.providerId ?? DEFAULT_AI_CONFIG.providerId ?? 'openai').trim();
  const isIflytek = providerId === 'iflytek';
  const apiKey = isIflytek
    ? sanitizeIflytekToken(input.apiKey ?? '')
    : (input.apiKey ?? '').trim();
  const iflytekAppId = sanitizeIflytekToken(input.iflytekAppId ?? '');
  const iflytekApiSecret = sanitizeIflytekToken(input.iflytekApiSecret ?? '');

  if (isIflytek) {
    if (!opts.allowEmptyKey) {
      if (!apiKey) throw new Error('讯飞 APIKey 不能为空');
      if (!iflytekAppId) throw new Error('讯飞 APPID 不能为空');
      if (!iflytekApiSecret) throw new Error('讯飞 APISecret 不能为空');
    }
    const iflytekPipeline = normalizeIflytekPipeline(input.iflytekPipeline);
    const iflytekSttProduct = normalizeIflytekSttProduct(
      input.iflytekSttProduct ?? input.sttModel,
    );
    const iflytekMtProduct = normalizeIflytekMtProduct(
      input.iflytekMtProduct ?? input.chatModel,
    );
    const iflytekTtsProduct = normalizeIflytekTtsProduct(
      input.iflytekTtsProduct ?? input.ttsModel,
    );
    return {
      apiKey,
      baseUrl: IFLYTEK_BASE_URL,
      chatModel: iflytekPipeline === 'simult' ? 'iflytek-simult' : iflytekMtProduct,
      sttModel: iflytekPipeline === 'simult' ? 'simult' : iflytekSttProduct,
      ttsModel: iflytekPipeline === 'simult' ? 'simult-tts' : iflytekTtsProduct,
      providerId: 'iflytek',
      iflytekAppId,
      iflytekApiSecret,
      iflytekPipeline,
      iflytekSttProduct,
      iflytekMtProduct,
      iflytekTtsProduct,
    };
  }

  if (!apiKey && !opts.allowEmptyKey) {
    throw new Error('API Key 不能为空');
  }
  const baseUrl = (input.baseUrl ?? DEFAULT_AI_CONFIG.baseUrl).trim().replace(/\/$/, '');
  if (!isValidBaseUrl(baseUrl)) {
    throw new Error('Base URL 无效，须为 https:// 地址（禁止 http）');
  }
  return {
    apiKey,
    baseUrl,
    chatModel: (input.chatModel ?? DEFAULT_AI_CONFIG.chatModel).trim() || DEFAULT_AI_CONFIG.chatModel,
    sttModel: (input.sttModel ?? DEFAULT_AI_CONFIG.sttModel).trim() || DEFAULT_AI_CONFIG.sttModel,
    ttsModel: (input.ttsModel ?? DEFAULT_AI_CONFIG.ttsModel).trim() || DEFAULT_AI_CONFIG.ttsModel,
    providerId: providerId || 'custom',
    iflytekAppId,
    iflytekApiSecret,
    iflytekPipeline: normalizeIflytekPipeline(input.iflytekPipeline),
    iflytekSttProduct: normalizeIflytekSttProduct(
      input.iflytekSttProduct ?? input.sttModel,
    ),
    iflytekMtProduct: normalizeIflytekMtProduct(
      input.iflytekMtProduct ?? input.chatModel,
    ),
    iflytekTtsProduct: normalizeIflytekTtsProduct(
      input.iflytekTtsProduct ?? input.ttsModel,
    ),
  };
}

/** After a valid Key is saved, enable by default (zero-ops). */
export function resolveEnabledAfterSave(
  previous: ExtensionSettings,
  next: ExtensionSettings,
): boolean {
  if (hasStoredCredential(next)) {
    return true;
  }
  return previous.enabled;
}

/** Master switch never requires API Key — free translate path is always available. */
export function canEnable(_settings: ExtensionSettings): boolean {
  return true;
}

export function applyToggle(
  settings: ExtensionSettings,
  wantEnabled: boolean,
): { settings: ExtensionSettings; error?: string } {
  return { settings: { ...settings, enabled: wantEnabled } };
}

export function applySpeechMode(
  settings: ExtensionSettings,
  mode: unknown,
): ExtensionSettings {
  return { ...settings, speechMode: normalizeSpeechMode(mode) };
}

export function applyPageMode(
  settings: ExtensionSettings,
  mode: unknown,
): ExtensionSettings {
  return { ...settings, pageMode: normalizePageMode(mode) };
}
