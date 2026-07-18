export type LangCode = 'zh' | 'en' | 'unknown';

const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/;
const LATIN_RE = /[A-Za-z]/;
const CJK_COUNT_RE = /[\u4e00-\u9fff]/g;

/** Heuristic ZH/EN detector for short text nodes. */
export function detectLang(text: string): LangCode {
  const sample = text.trim();
  if (!sample) return 'unknown';

  let cjk = 0;
  let latin = 0;
  for (const ch of sample) {
    if (CJK_RE.test(ch)) cjk++;
    else if (LATIN_RE.test(ch)) latin++;
  }

  if (cjk === 0 && latin === 0) return 'unknown';
  if (cjk >= latin * 0.5 && cjk > 0) return 'zh';
  if (latin > 0 && cjk === 0) return 'en';
  if (latin > cjk * 2) return 'en';
  if (cjk > 0) return 'zh';
  return 'unknown';
}

/** Opposite language for zero-ops auto convert. */
export function targetLangFor(source: LangCode): 'zh' | 'en' | null {
  if (source === 'zh') return 'en';
  if (source === 'en') return 'zh';
  return null;
}

/** Count CJK ideographs in text (for page/title bias). */
export function countCjk(text: string): number {
  return (text.match(CJK_COUNT_RE) ?? []).length;
}

/**
 * Latin-only ASR garbage often appears when Chinese audio is forced through
 * English-only recognition (language_type=3) — e.g. "arnrnrnrinderender…".
 */
export function looksLikeAsrGarbage(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (countCjk(t) > 0) return false;
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 8) return false;
  const vowels = (t.match(/[aeiouAEIOU]/g) ?? []).length;
  const ratio = vowels / letters;
  if (ratio < 0.18) return true;
  if (/(.)\1{4,}/i.test(t)) return true;
  if (/(ender|arnr|rnrn|teleder)/i.test(t)) return true;
  return false;
}

/** Clear spoken English (not garbage / not a single noise token). */
export function looksLikeRealEnglish(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikeAsrGarbage(t) || detectLang(t) !== 'en') return false;
  const words = t.split(/\s+/).filter((w) => /[A-Za-z]{2,}/.test(w));
  if (
    /\b(the|a|an|is|are|was|were|to|of|and|in|you|i|we|they|this|that|it|my|your|for|with|on|at|be|have|has|do|does|not|but|so|if|as|from|or)\b/i.test(
      t,
    )
  ) {
    return words.length >= 1;
  }
  const letters = (t.match(/[A-Za-z]/g) ?? []).length;
  const vowels = (t.match(/[aeiouAEIOU]/g) ?? []).length;
  return words.length >= 2 && letters >= 10 && vowels / letters >= 0.25;
}

/** Clear spoken Chinese. */
export function looksLikeRealChinese(text: string): boolean {
  const t = text.trim();
  if (!t || looksLikeAsrGarbage(t)) return false;
  return countCjk(t) >= 2 && detectLang(t) === 'zh';
}

/** Soft bootstrap only — first SI chunk before any ASR evidence. */
export function softPageSourceLang(opts: {
  pageTitle?: string;
  pageSample?: string;
}): 'zh' | 'en' {
  const title = opts.pageTitle ?? '';
  const sample = opts.pageSample ?? '';
  const pageCjk = countCjk(title) + countCjk(sample.slice(0, 800));
  const pageLatin = (sample.match(/[A-Za-z]/g) ?? []).length;
  if (pageCjk >= 4 && pageCjk >= pageLatin * 0.15) return 'zh';
  if (pageLatin >= 40 && pageCjk < 2) return 'en';
  const pageLang = detectLang(`${title}\n${sample.slice(0, 400)}`);
  if (pageLang === 'en') return 'en';
  if (pageLang === 'zh') return 'zh';
  return 'zh';
}

export type SpeechSourceState = {
  /** Locked spoken language after confident ASR; null = not yet. */
  source: 'zh' | 'en' | null;
  /** Consecutive confident hits for current source. */
  streak: number;
};

/**
 * Update sticky spoken-language from a recognition line.
 * - Chinese (CJK) locks / flips immediately.
 * - Real English flips after 1 confirming hit (or immediately if unlocked).
 * - ASR garbage never changes direction.
 */
export function updateSpeechSourceState(
  state: SpeechSourceState,
  recognitionText: string,
): SpeechSourceState {
  const t = recognitionText.trim();
  if (!t || looksLikeAsrGarbage(t)) return state;

  if (looksLikeRealChinese(t)) {
    if (state.source === 'zh') {
      return { source: 'zh', streak: state.streak + 1 };
    }
    return { source: 'zh', streak: 1 };
  }

  if (looksLikeRealEnglish(t)) {
    if (state.source === 'en') {
      return { source: 'en', streak: state.streak + 1 };
    }
    // First evidence or flip from zh after a clear English utterance.
    if (state.source === null || state.streak >= 1) {
      return { source: 'en', streak: 1 };
    }
    return state;
  }

  return state;
}

/**
 * Translation target for the next SI chunk (opposite of spoken source).
 * Uses sticky ASR source when available; otherwise soft page bootstrap.
 */
export function resolveSpeechTargetLang(opts: {
  sourceState?: SpeechSourceState;
  lastSource?: string;
  pageTitle?: string;
  pageSample?: string;
}): 'zh' | 'en' {
  let source = opts.sourceState?.source ?? null;

  // Backward-compatible path: infer from lastSource when no sticky state.
  if (!source && opts.lastSource?.trim()) {
    const probe = updateSpeechSourceState(
      { source: null, streak: 0 },
      opts.lastSource,
    );
    source = probe.source;
  }

  if (!source) {
    source = softPageSourceLang({
      pageTitle: opts.pageTitle,
      pageSample: opts.pageSample,
    });
  }

  return source === 'zh' ? 'en' : 'zh';
}
