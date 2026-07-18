import type {
  TranslateResponse,
  ExplainResponse,
  TranscribeResponse,
  SpeakResponse,
} from './messages';
import { publicPrefsItem } from './public-prefs';
import { tryLocalFreeTranslate } from './free-translate';
import {
  buildFreeExplain,
  ensureTermsMatchTargetLang,
  type ExplainResult,
} from './vocab-explain';
import { friendlyError } from './friendly-error';

function friendlyNetError(raw: string): string {
  const mapped = friendlyError(raw);
  if (mapped !== raw) return mapped;
  if (/failed to fetch|networkerror|load failed|网络/i.test(raw)) {
    return '翻译服务连不上（网络或免费接口不可用）。可配置 API Key，或稍后重试';
  }
  return raw;
}

/** True when settings have a configured provider credential. */
async function providerConfigured(): Promise<boolean> {
  try {
    const prefs = await publicPrefsItem.getValue();
    return !!prefs?.hasApiKey;
  } catch {
    return false;
  }
}

async function viaAiTranslate(
  texts: string[],
  targetLang: 'zh' | 'en',
): Promise<string[]> {
  const res = (await browser.runtime.sendMessage({
    type: 'ai.translate',
    texts,
    sourceLang: 'auto',
    targetLang,
  })) as TranslateResponse;

  if (!res?.ok) {
    throw new Error(res && 'error' in res ? res.error : '翻译失败');
  }
  return res.translations;
}

async function translateForGloss(
  text: string,
  targetLang: 'zh' | 'en',
  preferProvider: boolean,
): Promise<string> {
  if (preferProvider) {
    try {
      const [t] = await viaAiTranslate([text], targetLang);
      if (t?.trim()) return t.trim();
    } catch {
      /* degrade */
    }
  }
  const local = await tryLocalFreeTranslate([text], targetLang);
  if (local?.[0]?.trim()) return local[0].trim();

  if (!preferProvider) {
    const [t] = await viaAiTranslate([text], targetLang);
    return (t ?? '').trim();
  }
  return '';
}

/**
 * Translate texts.
 * Rule: if provider credentials are configured → provider first, free only on failure.
 */
export async function requestTranslate(
  texts: string[],
  targetLang: 'zh' | 'en',
  opts?: { preferAi?: boolean },
): Promise<string[]> {
  const preferProvider =
    opts?.preferAi ?? (await providerConfigured());

  if (preferProvider) {
    try {
      return await viaAiTranslate(texts, targetLang);
    } catch (e) {
      const local = await tryLocalFreeTranslate(texts, targetLang);
      if (local) return local;
      const raw = e instanceof Error ? e.message : String(e);
      throw new Error(friendlyNetError(raw));
    }
  }

  const local = await tryLocalFreeTranslate(texts, targetLang);
  if (local) return local;

  try {
    return await viaAiTranslate(texts, targetLang);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(friendlyNetError(raw));
  }
}

/**
 * Explain / bubble translate.
 * Same rule: configured provider first; free only as degradation.
 */
export async function requestExplain(
  text: string,
  targetLang: 'zh' | 'en',
  opts?: { preferAi?: boolean },
): Promise<ExplainResult> {
  const preferProvider =
    opts?.preferAi ?? (await providerConfigured());

  const localize = async (
    terms: ExplainResult['terms'],
  ): Promise<ExplainResult['terms']> =>
    ensureTermsMatchTargetLang(terms, targetLang, (t) =>
      translateForGloss(t, targetLang, preferProvider),
    );

  const fromTranslation = async (translation: string): Promise<ExplainResult> => {
    const built = await buildFreeExplain(text, translation, {
      targetLang,
      translateText: (t) => translateForGloss(t, targetLang, preferProvider),
    });
    return {
      translation: built.translation,
      terms: await localize(built.terms),
    };
  };

  if (preferProvider) {
    try {
      const res = (await browser.runtime.sendMessage({
        type: 'ai.explain',
        text,
        targetLang,
      })) as ExplainResponse;
      if (res?.ok) {
        const terms = (res.terms ?? [])
          .map((t) => ({
            term: t.term,
            phonetic: t.phonetic,
            meaning: t.meaning || t.gloss || '',
            example: t.example,
          }))
          .filter((t) => t.term && t.meaning);
        return {
          translation: res.translation,
          terms: await localize(terms),
        };
      }
    } catch {
      /* iFlytek has no explain — use MT product */
    }
    try {
      const [translation] = await requestTranslate([text], targetLang, {
        preferAi: true,
      });
      return fromTranslation(translation ?? '');
    } catch (e) {
      const local = await tryLocalFreeTranslate([text], targetLang);
      if (local?.[0]) return fromTranslation(local[0]);
      const raw = e instanceof Error ? e.message : String(e);
      throw new Error(friendlyNetError(raw));
    }
  }

  try {
    const local = await tryLocalFreeTranslate([text], targetLang);
    if (local?.[0]) return fromTranslation(local[0]);
  } catch {
    /* fall through */
  }

  try {
    const res = (await browser.runtime.sendMessage({
      type: 'ai.explain',
      text,
      targetLang,
    })) as ExplainResponse;

    if (!res?.ok) {
      throw new Error(res && 'error' in res ? res.error : '讲解失败');
    }
    const terms = (res.terms ?? [])
      .map((t) => ({
        term: t.term,
        phonetic: t.phonetic,
        meaning: t.meaning || t.gloss || '',
        example: t.example,
      }))
      .filter((t) => t.term && t.meaning);
    return {
      translation: res.translation,
      terms: await localize(terms),
    };
  } catch (e) {
    try {
      const [translation] = await requestTranslate([text], targetLang, {
        preferAi: false,
      });
      return fromTranslation(translation ?? '');
    } catch {
      const raw = e instanceof Error ? e.message : String(e);
      throw new Error(friendlyNetError(raw));
    }
  }
}

export async function requestTranscribe(
  audioBase64: string,
  mimeType: string,
  targetLang: 'zh' | 'en' = 'zh',
  wantAudio = false,
): Promise<{
  text: string;
  translation?: string;
  audioBase64?: string;
  mimeType?: string;
}> {
  const res = (await browser.runtime.sendMessage({
    type: 'ai.transcribe',
    audioBase64,
    mimeType,
    targetLang,
    wantAudio,
  })) as TranscribeResponse;

  if (!res?.ok) {
    throw new Error(res && 'error' in res ? res.error : '语音识别失败');
  }
  return {
    text: res.text,
    translation: res.translation,
    audioBase64: res.audioBase64,
    mimeType: res.mimeType,
  };
}

export async function requestSpeak(
  text: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  const res = (await browser.runtime.sendMessage({
    type: 'ai.speak',
    text,
  })) as SpeakResponse;

  if (!res?.ok) {
    throw new Error(res && 'error' in res ? res.error : '语音合成失败');
  }
  return { audioBase64: res.audioBase64, mimeType: res.mimeType };
}
