export type TermGloss = {
  term: string;
  /** IPA for English (e.g. /ˈsɒftweə/), pinyin for Chinese (e.g. ruǎn jiàn). */
  phonetic?: string;
  /** Independent dictionary sense — not a passage snippet. */
  meaning: string;
  /** Short example sentence. */
  example?: string;
};

export type ExplainResult = {
  translation: string;
  terms: TermGloss[];
};

const STOP_EN = new Set([
  'the',
  'and',
  'for',
  'with',
  'this',
  'that',
  'from',
  'have',
  'has',
  'was',
  'were',
  'are',
  'been',
  'they',
  'them',
  'their',
  'what',
  'when',
  'where',
  'which',
  'while',
  'about',
  'into',
  'than',
  'then',
  'also',
  'just',
  'more',
  'most',
  'very',
  'only',
  'over',
  'such',
  'some',
  'any',
  'not',
  'but',
  'you',
  'your',
  'our',
  'its',
  'his',
  'her',
  'who',
  'how',
  'why',
  'all',
  'can',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'does',
  'did',
  'doing',
  'don',
  'ain',
]);

const POS_ZH: Record<string, string> = {
  noun: '名词',
  verb: '动词',
  adjective: '形容词',
  adverb: '副词',
  pronoun: '代词',
  preposition: '介词',
  conjunction: '连词',
  interjection: '感叹词',
  determiner: '限定词',
  article: '冠词',
  numeral: '数词',
  auxiliary: '助动词',
};

function localizePos(pos: string | undefined, targetLang: 'zh' | 'en'): string {
  if (!pos) return '';
  if (targetLang === 'en') return pos;
  return POS_ZH[pos.toLowerCase()] ?? pos;
}

const EN_POS_PREFIX =
  /^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|article|auxiliary|numeral)\.\s*/i;

/** True when text is mostly English (no useful Chinese). */
export function meaningNeedsZh(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  if (cjk >= 2 && cjk >= latin * 0.35) return false;
  return latin >= 4;
}

/** True when text is mostly Chinese but target wants English. */
export function meaningNeedsEn(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  return cjk >= 2 && latin < cjk;
}

/**
 * Force keyword meanings into targetLang (EN→ZH ⇒ Chinese defs).
 * Call after AI / free dict — models and EN dictionaries often ignore the rule.
 */
export async function ensureTermsMatchTargetLang(
  terms: TermGloss[],
  targetLang: 'zh' | 'en',
  translateText: (text: string) => Promise<string>,
): Promise<TermGloss[]> {
  const out: TermGloss[] = [];
  for (const t of terms) {
    let meaning = t.meaning.trim();
    if (targetLang === 'zh') {
      meaning = meaning.replace(EN_POS_PREFIX, (_, p: string) => {
        const zh = localizePos(p, 'zh');
        return zh ? `${zh}。` : '';
      });
      if (meaningNeedsZh(meaning)) {
        try {
          const zh = (await translateText(meaning)).trim();
          if (zh && !meaningNeedsZh(zh)) meaning = zh;
          else if (zh && /[\u4e00-\u9fff]/.test(zh)) meaning = zh;
        } catch {
          /* keep */
        }
      }
    } else if (targetLang === 'en' && meaningNeedsEn(meaning)) {
      try {
        const en = (await translateText(meaning)).trim();
        if (en) meaning = en;
      } catch {
        /* keep */
      }
    }
    out.push({ ...t, meaning: meaning || t.meaning });
  }
  return out;
}

function asTermGloss(row: unknown): TermGloss | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  const term = String(o.term ?? '').trim();
  const phonetic = String(o.phonetic ?? o.ipa ?? o.pinyin ?? '').trim();
  const meaning = String(o.meaning ?? o.gloss ?? o.definition ?? '').trim();
  const example = String(o.example ?? o.sentence ?? '').trim();
  if (!term || !meaning) return null;
  if (/^见译文语境/.test(meaning)) return null;
  return {
    term,
    ...(phonetic ? { phonetic } : {}),
    meaning,
    ...(example ? { example } : {}),
  };
}

/** Parse model JSON with rich term fields (backward compatible with gloss). */
export function parseExplainPayload(raw: string): ExplainResult | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as {
      translation?: unknown;
      terms?: unknown;
    };
    const translation = typeof obj.translation === 'string' ? obj.translation.trim() : '';
    if (!translation) return null;
    const terms: TermGloss[] = [];
    if (Array.isArray(obj.terms)) {
      for (const row of obj.terms) {
        const t = asTermGloss(row);
        if (t) terms.push(t);
      }
    }
    return { translation, terms: terms.slice(0, 8) };
  } catch {
    return null;
  }
}

/** Pick candidate keywords from source (content words only). */
export function pickKeywordCandidates(source: string, limit = 5): string[] {
  const text = source.trim();
  if (!text) return [];
  const out: string[] = [];

  const cjk = text.match(/[\u4e00-\u9fff]{2,4}/g) ?? [];
  for (const w of cjk) {
    if (out.length >= limit) break;
    if (!out.includes(w)) out.push(w);
  }

  const en = text.match(/\b[A-Za-z][A-Za-z'-]{2,}\b/g) ?? [];
  for (const w of en) {
    if (out.length >= limit) break;
    const lower = w.toLowerCase();
    if (STOP_EN.has(lower)) continue;
    if (!out.some((t) => t.toLowerCase() === lower)) out.push(w);
  }
  return out;
}

type FreeDictEntry = {
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    definitions?: Array<{ definition?: string; example?: string }>;
  }>;
};

async function lookupEnglishFree(word: string): Promise<{
  phonetic?: string;
  pos?: string;
  definitionEn: string;
  exampleEn?: string;
} | null> {
  const q = word.toLowerCase().replace(/[^a-z'-]/gi, '');
  if (q.length < 2) return null;
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(q)}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as FreeDictEntry[];
    const entry = data[0];
    if (!entry) return null;
    const phonetic =
      entry.phonetic ||
      entry.phonetics?.find((p) => p.text)?.text ||
      '';
    const def = entry.meanings?.[0]?.definitions?.[0];
    const definitionEn = def?.definition?.trim();
    if (!definitionEn) return null;
    return {
      ...(phonetic ? { phonetic } : {}),
      pos: entry.meanings?.[0]?.partOfSpeech,
      definitionEn,
      ...(def?.example ? { exampleEn: def.example } : {}),
    };
  } catch {
    return null;
  }
}

export type BuildFreeExplainOpts = {
  /** Learner target: EN→ZH ⇒ zh; ZH→EN ⇒ en. Meanings follow this. */
  targetLang?: 'zh' | 'en';
  translateText?: (text: string) => Promise<string>;
};

/**
 * Free-path explain: dictionary + translate meanings into targetLang.
 * EN→ZH: Chinese definitions; ZH→EN: English definitions.
 */
export async function buildFreeExplain(
  source: string,
  translation: string,
  opts: BuildFreeExplainOpts = {},
): Promise<ExplainResult> {
  const targetLang = opts.targetLang ?? 'zh';
  const translate = opts.translateText;
  const candidates = pickKeywordCandidates(source, 5);
  const terms: TermGloss[] = [];

  for (const w of candidates) {
    const isCjk = /[\u4e00-\u9fff]/.test(w);

    if (isCjk) {
      // Chinese headword → meaning in targetLang (EN when 中译英, ZH gloss when 英译中 rare)
      let meaning = '';
      if (translate) {
        try {
          meaning = (await translate(w)).trim();
        } catch {
          /* ignore */
        }
      }
      terms.push({
        term: w,
        meaning:
          meaning ||
          (targetLang === 'en'
            ? 'Chinese term — configure API Key for pinyin, definition & examples'
            : '汉语词条：配置 API Key 后可获得拼音、独立释义与例句'),
      });
      continue;
    }

    const looked = await lookupEnglishFree(w);
    if (looked) {
      const posLabel = localizePos(looked.pos, targetLang);
      let def = looked.definitionEn;
      if (targetLang === 'zh' && translate) {
        try {
          const zh = (await translate(looked.definitionEn)).trim();
          if (zh && !meaningNeedsZh(zh)) def = zh;
          else if (zh && /[\u4e00-\u9fff]/.test(zh)) def = zh;
        } catch {
          /* keep EN — ensureTermsMatchTargetLang will retry */
        }
      }
      let example = looked.exampleEn;
      if (example && targetLang === 'zh' && translate) {
        try {
          const exZh = (await translate(example)).trim();
          if (exZh && /[\u4e00-\u9fff]/.test(exZh)) {
            example = `${example}（${exZh}）`;
          }
        } catch {
          /* keep EN example */
        }
      }
      const sep = targetLang === 'zh' ? '。' : '. ';
      terms.push({
        term: w,
        ...(looked.phonetic ? { phonetic: looked.phonetic } : {}),
        meaning: posLabel ? `${posLabel}${sep}${def}` : def,
        ...(example ? { example } : {}),
      });
      continue;
    }

    let meaning = '';
    if (translate) {
      try {
        meaning = (await translate(w)).trim();
      } catch {
        /* ignore */
      }
    }
    terms.push({
      term: w,
      meaning:
        meaning ||
        (targetLang === 'zh'
          ? '暂无词典释义；配置 API Key 可获得音标、中文释义与例句'
          : 'No dictionary entry — configure API Key for IPA, definition & examples'),
    });
  }

  const localized = translate
    ? await ensureTermsMatchTargetLang(terms, targetLang, translate)
    : terms;
  return { translation, terms: localized };
}

/** System prompt for AI keyword cards. */
export const EXPLAIN_SYSTEM_PROMPT = `You are a bilingual vocabulary tutor for Chinese↔English learners.
Return ONLY compact JSON (no markdown):
{"translation":"...","terms":[{"term":"...","phonetic":"...","meaning":"...","example":"..."}]}

Rules for each term (pick 3–6 content words/phrases; skip function words like the/and/的/了):
- phonetic: English → IPA in slashes e.g. /ˈsɒftweə(r)/; Chinese → Hanyu Pinyin e.g. ruǎnjiàn. Never leave empty for real words.
- meaning: ONE independent dictionary sense. Language MUST match targetLang exactly:
  - targetLang=zh → meaning entirely in Chinese (e.g. "形容词。很大的；最大的。")
  - targetLang=en → meaning entirely in English
  NEVER write English definitions when targetLang=zh. MUST NOT paste the passage translation. No "见译文语境".
- example: short sentence in the source language; if helpful, add a brief gloss in targetLang in parentheses.
- Keep JSON valid and short.`;
