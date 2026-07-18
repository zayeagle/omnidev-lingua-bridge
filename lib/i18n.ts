/**
 * Extension UI i18n — follows the browser/OS UI language via chrome.i18n.
 * Translation product scope remains Chinese↔English only.
 */

type MessageTable = Record<string, { message: string }>;

/** English fallback when browser.i18n is unavailable (unit tests). */
const FALLBACK: MessageTable = {
  extName: { message: 'Lingua Bridge' },
  popupSub: {
    message: 'Chinese↔English only · selection bubble · video SI',
  },
  stateOn: { message: 'On' },
  stateOff: { message: 'Off' },
  directionZhEn: { message: 'ZH ↔ EN only (auto by source)' },
  keyConfigured: { message: ' · key configured' },
  keyMissing: { message: ' · no key (free path)' },
  pipelineSimult: { message: 'Simultaneous interpretation (all-in-one)' },
  pipelineComposed: { message: 'Composed (STT + MT + TTS)' },
  pipelineNa: { message: '— (not iFlytek)' },
  providerIflytek: { message: 'iFlytek' },
  modeCaption: { message: 'Silent captions' },
  modeVoice: { message: 'Voice interpretation' },
  siStart: { message: 'Start SI' },
  siStop: { message: 'Stop SI' },
  siOnPage: { message: 'On (this page)' },
  siOffPage: { message: 'Off' },
  siNotConnected: { message: 'Not connected to page' },
  videoDetected: { message: 'Video detected' },
  videoMissing: { message: 'No video detected' },
  refreshPageHint: { message: 'Open a normal webpage and refresh' },
  statusClosed: { message: 'Off' },
  statusNotConnected: { message: 'Not connected to this page' },
  statusSiRunning: { message: 'SI on' },
  statusSiIdle: { message: 'SI off' },
  statusHasVideo: { message: 'has video' },
  statusNoVideo: { message: 'no video' },
  statusVoiceShort: { message: 'voice' },
  statusCaptionShort: { message: 'captions' },
  errEnableMasterFirst: { message: 'Turn on the master switch first' },
  errInjectFailed: {
    message:
      'Cannot connect to this page. Refresh the video page, then start SI.',
  },
  errSiStartFailed: {
    message:
      'Failed to start SI: confirm this page has a video and was refreshed',
  },
  errSiStopFailed: { message: 'Failed to stop SI' },
  siStartedPlay: { message: 'SI on — click play on the video' },
  siStartedNoVideo: {
    message: 'SI on — no video yet; audio capture starts when one plays',
  },
  siStopped: { message: 'SI stopped' },
  openSettings: { message: 'Open settings' },
  optionsTitle: { message: 'Lingua Bridge Settings' },
  bubbleTranslate: { message: 'Translate' },
  bubbleResultTitle: { message: 'Translation' },
  bubbleOriginal: { message: 'Original' },
  bubbleTranslated: { message: 'Translated' },
  bubbleKeywords: { message: 'Keywords' },
  bubbleFold: { message: 'Collapse' },
  bubbleExpand: { message: 'Expand' },
  bubbleCloseResult: { message: 'Close' },
  bubbleExamplePrefix: { message: 'e.g. ' },
  bubbleFail: { message: 'Translation failed' },
  bubblePageTranslate: { message: 'Translate page' },
  bubblePageTranslateHint: {
    message: 'Translate the current viewport (from the bubble menu)',
  },
  bubbleMore: { message: 'More' },
  bubbleClose: { message: 'Close' },
  bubbleSiToggle: { message: 'Video SI on this page' },
  bubbleSiHint: {
    message: 'Start / stop simultaneous interpretation for this tab',
  },
  toastPageTranslated: { message: 'Viewport translated' },
  toastPageTranslateFail: { message: 'Page translation failed' },
  toastTranslateFail: { message: 'Translation failed' },
};

function getMessageApi():
  | ((key: string, substitutions?: string | string[]) => string)
  | undefined {
  const g = globalThis as unknown as {
    browser?: {
      i18n?: { getMessage?: (k: string, s?: string | string[]) => string };
    };
    chrome?: {
      i18n?: { getMessage?: (k: string, s?: string | string[]) => string };
    };
  };
  return g.browser?.i18n?.getMessage ?? g.chrome?.i18n?.getMessage;
}

function readMessage(key: string, substitutions?: string | string[]): string {
  try {
    const api = getMessageApi();
    if (typeof api === 'function') {
      const msg = api(key, substitutions);
      if (msg) return msg;
    }
  } catch {
    /* vitest / non-extension */
  }
  const raw = FALLBACK[key]?.message ?? key;
  if (!substitutions) return raw;
  const list = Array.isArray(substitutions) ? substitutions : [substitutions];
  return raw.replace(/\$(\d+)\$/g, (_, n: string) => list[Number(n) - 1] ?? '');
}

/** Localized string for the current browser UI language. */
export function t(key: string, substitutions?: string | string[]): string {
  return readMessage(key, substitutions);
}

/** UI language bucket used by the extension chrome (not translation direction). */
export function uiLang(): 'zh' | 'en' {
  try {
    const g = globalThis as unknown as {
      browser?: { i18n?: { getUILanguage?: () => string } };
      chrome?: { i18n?: { getUILanguage?: () => string } };
    };
    const raw =
      g.browser?.i18n?.getUILanguage?.() ||
      g.chrome?.i18n?.getUILanguage?.() ||
      '';
    const loc = raw.toLowerCase().replace(/_/g, '-');
    if (loc.startsWith('zh')) return 'zh';
    return 'en';
  } catch {
    return 'en';
  }
}

/**
 * Apply data-i18n / data-i18n-title / data-i18n-placeholder / data-i18n-aria
 * on elements under root (defaults to document).
 */
export function applyDomI18n(root: ParentNode = document): void {
  const doc = root instanceof Document ? root : document;
  try {
    doc.documentElement.lang = uiLang() === 'zh' ? 'zh-CN' : 'en';
  } catch {
    /* ignore */
  }

  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.title = t(key);
  });

  root.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria');
    if (key) el.setAttribute('aria-label', t(key));
  });

  root
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      '[data-i18n-placeholder]',
    )
    .forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) el.placeholder = t(key);
    });
}
