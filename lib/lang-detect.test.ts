import { describe, expect, it } from 'vitest';
import {
  detectLang,
  looksLikeAsrGarbage,
  looksLikeRealChinese,
  looksLikeRealEnglish,
  resolveSpeechTargetLang,
  softPageSourceLang,
  targetLangFor,
  updateSpeechSourceState,
} from './lang-detect';

describe('lang-detect (F3 UNIT)', () => {
  it('TC-F3-U01 Happy: Chinese', () => {
    expect(detectLang('这是一段中文内容')).toBe('zh');
    expect(targetLangFor('zh')).toBe('en');
  });

  it('TC-F3-U02 Happy: English', () => {
    expect(detectLang('This is English text')).toBe('en');
    expect(targetLangFor('en')).toBe('zh');
  });

  it('detects Latin ASR garbage from English-only mishear', () => {
    expect(
      looksLikeAsrGarbage(
        'arnrnrnrinderendertelederendertelederendertelederennono',
      ),
    ).toBe(true);
    expect(looksLikeAsrGarbage('Hello everyone welcome')).toBe(false);
  });

  it('real English vs garbage', () => {
    expect(looksLikeRealEnglish('Hello everyone welcome to the show')).toBe(
      true,
    );
    expect(
      looksLikeRealEnglish('arnrnrnrinderendertelederendertelederennono'),
    ).toBe(false);
    expect(looksLikeRealChinese('专门看你们的')).toBe(true);
  });

  it('garbage ASR does not flip sticky source away from Chinese', () => {
    let state = updateSpeechSourceState(
      { source: null, streak: 0 },
      '专门看你们的',
    );
    expect(state.source).toBe('zh');
    state = updateSpeechSourceState(
      state,
      'ABC volley is arnrnrnrinderendertelederennono',
    );
    expect(state.source).toBe('zh');
    expect(
      resolveSpeechTargetLang({
        sourceState: state,
        pageTitle: '脱口秀大会',
        pageSample: '专门看你们的'.repeat(3),
      }),
    ).toBe('en');
  });

  it('switches to en→zh when clear English is recognized', () => {
    let state = updateSpeechSourceState(
      { source: null, streak: 0 },
      '专门看你们的',
    );
    expect(resolveSpeechTargetLang({ sourceState: state })).toBe('en');
    state = updateSpeechSourceState(
      state,
      'Thank you so much for coming tonight',
    );
    expect(state.source).toBe('en');
    expect(resolveSpeechTargetLang({ sourceState: state })).toBe('zh');
  });

  it('soft page bootstrap only when no sticky source', () => {
    expect(
      softPageSourceLang({
        pageTitle: 'Stand-up Comedy Special',
        pageSample: 'Subscribe like and share '.repeat(10),
      }),
    ).toBe('en');
    expect(
      resolveSpeechTargetLang({
        pageTitle: 'Stand-up Comedy Special',
        pageSample: 'Subscribe like and share '.repeat(10),
      }),
    ).toBe('zh');
  });
});
