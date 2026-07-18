import { detectLang } from '../lang-detect';
import type { AiConfig } from '../storage';
import {
  hasIflytekCredentials,
  isIflytekProvider,
  normalizeIflytekPipeline,
} from '../storage';
import { sanitizeIflytekToken, type IflytekCreds } from './auth';
import { iflytekTranslate } from './mt';
import {
  DEFAULT_IFLYTEK_MT,
  DEFAULT_IFLYTEK_STT,
  DEFAULT_IFLYTEK_TTS,
  normalizeIflytekMtProduct,
  normalizeIflytekSttProduct,
  normalizeIflytekTtsProduct,
} from './products';
import { iflytekSimultChunk, type SimultResult } from './simult';
import { iflytekTranscribe } from './stt';
import { iflytekSynthesize } from './tts';

export {
  buildWsAuthUrl,
  hmacSha256Base64,
  sanitizeIflytekToken,
  wsSignatureOrigin,
} from './auth';
export { iflytekTranslate } from './mt';
export { iflytekTranscribe } from './stt';
export { iflytekSynthesize } from './tts';
export { iflytekSimultChunk } from './simult';
export {
  DEFAULT_IFLYTEK_MT,
  DEFAULT_IFLYTEK_STT,
  DEFAULT_IFLYTEK_TTS,
  IFLYTEK_MT_PRODUCTS,
  IFLYTEK_STT_PRODUCTS,
  IFLYTEK_TTS_PRODUCTS,
  getIflytekMtProduct,
  getIflytekSttProduct,
  getIflytekTtsProduct,
  normalizeIflytekMtProduct,
  normalizeIflytekSttProduct,
  normalizeIflytekTtsProduct,
} from './products';

export function credsFromAiConfig(config: AiConfig): IflytekCreds {
  if (!hasIflytekCredentials(config)) {
    throw new Error('讯飞凭证不完整');
  }
  return {
    appId: sanitizeIflytekToken(config.iflytekAppId ?? ''),
    apiKey: sanitizeIflytekToken(config.apiKey),
    apiSecret: sanitizeIflytekToken(config.iflytekApiSecret ?? ''),
  };
}

export function shouldUseIflytek(config: AiConfig): boolean {
  return isIflytekProvider(config) && hasIflytekCredentials(config);
}

export function isIflytekSimultPipeline(config: AiConfig): boolean {
  return (
    shouldUseIflytek(config) &&
    normalizeIflytekPipeline(config.iflytekPipeline) === 'simult'
  );
}

export async function iflytekTranslateTexts(
  config: AiConfig,
  texts: string[],
  opts: { sourceLang?: string; targetLang?: string },
): Promise<string[]> {
  // Text MT is always available (bubble / page), even when video SI uses 同声传译.
  return iflytekTranslate(credsFromAiConfig(config), texts, {
    ...opts,
    productId: normalizeIflytekMtProduct(
      config.iflytekMtProduct ?? config.chatModel ?? DEFAULT_IFLYTEK_MT,
    ),
  });
}

export async function iflytekTranscribeAudio(
  config: AiConfig,
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  return iflytekTranscribe(
    credsFromAiConfig(config),
    audioBase64,
    mimeType,
    normalizeIflytekSttProduct(
      config.iflytekSttProduct ?? config.sttModel ?? DEFAULT_IFLYTEK_STT,
    ),
  );
}

export async function iflytekSimultTranscribe(
  config: AiConfig,
  audioBase64: string,
  mimeType: string,
  opts: { targetLang?: 'zh' | 'en'; wantAudio?: boolean },
): Promise<SimultResult> {
  return iflytekSimultChunk(credsFromAiConfig(config), audioBase64, mimeType, opts);
}

export async function iflytekSpeak(
  config: AiConfig,
  text: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  const lang = detectLang(text);
  // English translation must use an EN voice — Chinese oral products often
  // return empty / unusable audio for Latin-only text (cn→en voice SI).
  if (lang === 'en') {
    return iflytekSynthesize(credsFromAiConfig(config), text, {
      productId: 'online_x2_john',
    });
  }
  // Simult pipeline has no separate TTS product picker; use SI Chinese voice.
  if (isIflytekSimultPipeline(config)) {
    return iflytekSynthesize(credsFromAiConfig(config), text, {
      productId: 'online_x2_xiaoguo',
    });
  }
  return iflytekSynthesize(credsFromAiConfig(config), text, {
    productId: normalizeIflytekTtsProduct(
      config.iflytekTtsProduct ?? config.ttsModel ?? DEFAULT_IFLYTEK_TTS,
    ),
  });
}
