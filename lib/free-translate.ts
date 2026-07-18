/** Free (no API Key) ZH↔EN translation: Chrome Translator → LibreTranslate. */

export const LIBRE_TRANSLATE_ENDPOINTS = [
  'https://libretranslate.de/translate',
  'https://translate.argosopentech.com/translate',
  'https://libretranslate.com/translate',
] as const;

type ChromeTranslator = {
  translate: (text: string) => Promise<string>;
  destroy?: () => void;
};

type TranslatorStatic = {
  availability: (opts: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<string>;
  create: (opts: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (m: { addEventListener: (type: string, cb: (e: { loaded: number }) => void) => void }) => void;
  }) => Promise<ChromeTranslator>;
};

function getTranslatorApi(): TranslatorStatic | null {
  const g = globalThis as unknown as { Translator?: TranslatorStatic };
  return g.Translator ?? null;
}

function bcp47(lang: 'zh' | 'en'): string {
  return lang === 'zh' ? 'zh' : 'en';
}

/** Try on-device Chrome Translator (window / content). Returns null if unavailable. */
export async function translateWithChromeTranslator(
  texts: string[],
  targetLang: 'zh' | 'en',
  sourceLang: 'zh' | 'en' | 'auto' = 'auto',
): Promise<string[] | null> {
  const Api = getTranslatorApi();
  if (!Api || !texts.length) return null;

  const source =
    sourceLang === 'auto' ? (targetLang === 'zh' ? 'en' : 'zh') : sourceLang;
  const target = bcp47(targetLang);
  const src = bcp47(source);

  try {
    const availability = await Api.availability({
      sourceLanguage: src,
      targetLanguage: target,
    });
    if (availability === 'unavailable') return null;

    const translator = await Api.create({
      sourceLanguage: src,
      targetLanguage: target,
    });
    try {
      const out: string[] = [];
      for (const t of texts) {
        if (!t.trim()) {
          out.push(t);
          continue;
        }
        out.push(await translator.translate(t));
      }
      return out;
    } finally {
      translator.destroy?.();
    }
  } catch {
    return null;
  }
}

type LibreBody = {
  translatedText?: string | string[];
  error?: string;
};

async function postLibre(
  endpoint: string,
  texts: string[],
  targetLang: 'zh' | 'en',
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: texts.length === 1 ? texts[0] : texts,
        source: 'auto',
        target: targetLang === 'zh' ? 'zh' : 'en',
        format: 'text',
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      /failed to fetch|networkerror|load failed/i.test(msg)
        ? `无法连接 ${new URL(endpoint).host}`
        : msg,
    );
  }
  const raw = await res.text();
  let data: LibreBody = {};
  try {
    data = JSON.parse(raw) as LibreBody;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    throw new Error(data.error || `免费翻译服务不可用 (${res.status})`);
  }
  const t = data.translatedText;
  if (typeof t === 'string') {
    return texts.length === 1 ? [t] : texts.map(() => t);
  }
  if (Array.isArray(t) && t.length === texts.length) {
    return t.map(String);
  }
  throw new Error('免费翻译返回格式异常');
}

/** Network free fallback (background or content). */
export async function translateWithLibreTranslate(
  texts: string[],
  targetLang: 'zh' | 'en',
  endpoints: readonly string[] = LIBRE_TRANSLATE_ENDPOINTS,
): Promise<string[]> {
  if (!texts.length) return [];
  if (texts.every((t) => !t.trim())) return texts.map(() => '');

  let lastErr: unknown;
  for (const endpoint of endpoints) {
    try {
      return await postLibre(endpoint, texts, targetLang);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('免费翻译失败，可配置 API Key 使用 AI 路径');
}

/**
 * Content-side: Chrome Translator first, else null (caller → background).
 */
export async function tryLocalFreeTranslate(
  texts: string[],
  targetLang: 'zh' | 'en',
): Promise<string[] | null> {
  return translateWithChromeTranslator(texts, targetLang);
}
