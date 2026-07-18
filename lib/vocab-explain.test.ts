import { describe, expect, it, vi } from 'vitest';
import {
  buildFreeExplain,
  ensureTermsMatchTargetLang,
  meaningNeedsZh,
  parseExplainPayload,
  pickKeywordCandidates,
} from './vocab-explain';

describe('vocab-explain (F19)', () => {
  it('TC-F19-U01 parse rich explain JSON', () => {
    const r = parseExplainPayload(
      '```json\n{"translation":"你好","terms":[{"term":"hello","phonetic":"/həˈləʊ/","meaning":"感叹词。问候语。","example":"Hello, everyone."}]}\n```',
    );
    expect(r?.translation).toBe('你好');
    expect(r?.terms[0]?.meaning).toContain('问候');
  });

  it('accepts legacy gloss field as meaning', () => {
    const r = parseExplainPayload(
      '{"translation":"测试","terms":[{"term":"test","gloss":"试验"}]}',
    );
    expect(r?.terms[0]?.meaning).toBe('试验');
  });

  it('rejects 见译文语境 snippets', () => {
    const r = parseExplainPayload(
      '{"translation":"x","terms":[{"term":"software","gloss":"见译文语境：……"}]}',
    );
    expect(r?.terms).toEqual([]);
  });

  it('picks content keywords', () => {
    const ks = pickKeywordCandidates(
      'Software fundamentals matter more than ever',
    );
    expect(ks.map((k) => k.toLowerCase())).toContain('software');
    expect(ks.map((k) => k.toLowerCase())).not.toContain('than');
  });

  it('meaningNeedsZh detects English defs', () => {
    expect(
      meaningNeedsZh(
        'noun. The process of moving an idea from concept to reality.',
      ),
    ).toBe(true);
    expect(meaningNeedsZh('名词。把想法变为现实的过程。')).toBe(false);
  });

  it('ensureTermsMatchTargetLang translates EN gloss to ZH', async () => {
    const out = await ensureTermsMatchTargetLang(
      [
        {
          term: 'implementation',
          meaning:
            'noun. The process of moving an idea from concept to reality.',
        },
      ],
      'zh',
      async () => '名词。把想法从概念变为现实的过程。',
    );
    expect(out[0]?.meaning).toMatch(/[\u4e00-\u9fff]/);
    expect(out[0]?.meaning).not.toMatch(/^noun\./i);
  });
});

