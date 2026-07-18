/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDomI18n, t, uiLang } from './i18n';

describe('i18n', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('falls back to English catalog without browser.i18n', () => {
    expect(t('bubbleTranslate')).toBe('Translate');
    expect(t('siStart')).toBe('Start SI');
  });

  it('uiLang maps zh-* to zh', () => {
    vi.stubGlobal('browser', {
      i18n: { getUILanguage: () => 'zh-CN', getMessage: () => '' },
    });
    expect(uiLang()).toBe('zh');
  });

  it('applyDomI18n fills data-i18n nodes', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span data-i18n="openSettings">x</span>';
    applyDomI18n(root);
    expect(root.querySelector('span')?.textContent).toBe('Open settings');
  });
});
