import { applyDomI18n, t } from '../../lib/i18n';
import { publicPrefsItem } from '../../lib/public-prefs';
import { setEnabled, setSpeechMode } from '../../lib/settings-store';
import type { IflytekPipeline, SpeechMode } from '../../lib/storage';
import {
  normalizeIflytekPipeline,
  normalizeSpeechMode,
} from '../../lib/storage';
import type { PageStatusResponse } from '../../lib/messages';
import { isPageSpeechStateEvent } from '../../lib/messages';
import { siLiveItem, type SiLiveState } from '../../lib/si-live';
import {
  ensureTabContent,
  getActiveTab,
  isTabBlocked,
  queryTabStatus,
  setTabSpeechMode,
  toggleTabSpeech,
} from '../../lib/tab-bridge';

applyDomI18n();

const enabledEl = document.getElementById('enabled') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLParagraphElement;
const optionsLink = document.getElementById('open-options') as HTMLAnchorElement;
const siToggleBtn = document.getElementById('siToggle') as HTMLButtonElement;
const speechInputs = Array.from(
  document.querySelectorAll<HTMLInputElement>('input[name="speechMode"]'),
);

const stEnabled = document.getElementById('stEnabled') as HTMLElement;
const stLang = document.getElementById('stLang') as HTMLElement;
const stProvider = document.getElementById('stProvider') as HTMLElement;
const stPipeline = document.getElementById('stPipeline') as HTMLElement;
const stSpeech = document.getElementById('stSpeech') as HTMLElement;
const stSi = document.getElementById('stSi') as HTMLElement;
const stVideo = document.getElementById('stVideo') as HTMLElement;

let lastActionError = '';
/** Last known video presence — used for optimistic SI sync (caption ×). */
let lastHasVideo: boolean | null = null;

function setStatus(text: string, kind: '' | 'ok' | 'err' = '') {
  statusEl.textContent = text;
  statusEl.className = `status${kind ? ` ${kind}` : ''}`;
}

function selectedSpeech(): SpeechMode {
  const checked = speechInputs.find((el) => el.checked);
  return checked?.value === 'voice' ? 'voice' : 'caption';
}

function setSpeechUi(mode: SpeechMode) {
  for (const el of speechInputs) el.checked = el.value === mode;
}

function providerLabel(id: string): string {
  if (id === 'iflytek') return t('providerIflytek');
  if (id === 'openai') return 'OpenAI';
  if (id === 'deepseek') return 'DeepSeek';
  if (id === 'openrouter') return 'OpenRouter';
  if (id === 'anthropic') return 'Anthropic';
  return id || 'Custom';
}

function pipelineLabel(providerId: string, pipeline: IflytekPipeline): string {
  if (providerId !== 'iflytek') return t('pipelineNa');
  return pipeline === 'simult' ? t('pipelineSimult') : t('pipelineComposed');
}

type BridgeState = {
  connected: boolean;
  page: PageStatusResponse | null;
  connectError?: string;
};

async function loadBridge(): Promise<BridgeState> {
  const tab = await getActiveTab();
  if ('error' in tab) {
    return { connected: false, page: null, connectError: tab.error };
  }
  // System / Web Store tabs: idle popup must not show the SI-start restriction error.
  if (isTabBlocked(tab)) {
    return { connected: false, page: null };
  }
  const ready = await ensureTabContent(tab.id);
  if (!ready) {
    return {
      connected: false,
      page: null,
      connectError: t('errInjectFailed'),
    };
  }
  const page = await queryTabStatus(tab.id);
  if (!page?.ok) {
    return {
      connected: false,
      page: null,
      connectError: t('errInjectFailed'),
    };
  }
  return { connected: true, page };
}

function paintLive(
  prefs: {
    enabled: boolean;
    hasApiKey: boolean;
    speechMode: SpeechMode;
    providerId: string;
    iflytekPipeline: IflytekPipeline;
  },
  bridge: BridgeState,
  opts?: { preferError?: string },
) {
  const page = bridge.page;
  const speechOn = page && page.ok ? page.speechOnThisPage : false;
  const hasVideo = page && page.ok ? page.hasVideo : null;
  const providerId = prefs.providerId;
  const pipeline = prefs.iflytekPipeline;
  const mode = prefs.speechMode;

  stEnabled.textContent = prefs.enabled ? t('stateOn') : t('stateOff');
  stLang.textContent = t('directionZhEn');
  stProvider.textContent = `${providerLabel(providerId)}${
    prefs.hasApiKey ? t('keyConfigured') : t('keyMissing')
  }`;
  stPipeline.textContent = pipelineLabel(providerId, pipeline);
  stSpeech.textContent =
    mode === 'voice' ? t('modeVoice') : t('modeCaption');

  if (!bridge.connected) {
    stSi.textContent = t('siNotConnected');
    stSi.className = 'err';
    stVideo.textContent = bridge.connectError || t('refreshPageHint');
  } else {
    lastHasVideo = hasVideo;
    stSi.textContent = speechOn ? t('siOnPage') : t('siOffPage');
    stSi.className = speechOn ? 'on' : '';
    stVideo.textContent = hasVideo ? t('videoDetected') : t('videoMissing');
    if (!hasVideo) stVideo.className = 'err';
    else stVideo.className = '';
  }

  siToggleBtn.disabled = !prefs.enabled;
  siToggleBtn.textContent = speechOn ? t('siStop') : t('siStart');
  siToggleBtn.classList.toggle('active', speechOn);

  if (opts?.preferError) {
    setStatus(opts.preferError, 'err');
    return;
  }
  if (!prefs.enabled) {
    setStatus(t('statusClosed'), '');
    return;
  }
  if (!bridge.connected) {
    // connectError = real failure; missing error = restricted/idle (no red banner).
    if (bridge.connectError) {
      setStatus(bridge.connectError, 'err');
    } else {
      setStatus(t('statusNotConnected'), '');
    }
    return;
  }
  const bits = [
    t('stateOn'),
    providerLabel(providerId),
    pipelineLabel(providerId, pipeline),
    mode === 'voice' ? t('statusVoiceShort') : t('statusCaptionShort'),
    speechOn ? t('statusSiRunning') : t('statusSiIdle'),
    hasVideo ? t('statusHasVideo') : t('statusNoVideo'),
  ];
  setStatus(bits.join(' · '), speechOn ? 'ok' : '');
}

async function refresh(opts?: { preferError?: string }) {
  const prefs = await publicPrefsItem.getValue();
  enabledEl.checked = !!prefs.enabled;
  setSpeechUi(normalizeSpeechMode(prefs.speechMode));
  const bridge = await loadBridge();
  paintLive(
    {
      enabled: !!prefs.enabled,
      hasApiKey: !!prefs.hasApiKey,
      speechMode: normalizeSpeechMode(prefs.speechMode),
      providerId: prefs.providerId ?? 'openai',
      iflytekPipeline: normalizeIflytekPipeline(prefs.iflytekPipeline),
    },
    bridge,
    opts,
  );
  return bridge;
}

/**
 * Caption × closes SI in the page — update button + 实时状态 immediately,
 * then re-query the tab so footer bits stay accurate.
 */
async function syncFromSiLive(live: SiLiveState | null | undefined) {
  if (!live) return;
  const tab = await getActiveTab();
  if ('error' in tab || isTabBlocked(tab)) return;
  if (live.tabId != null && live.tabId !== tab.id) return;

  lastActionError = '';
  const prefs = await publicPrefsItem.getValue();
  const speechOn = !!live.speechOnThisPage;
  const mode = normalizeSpeechMode(live.speechMode || prefs.speechMode);
  setSpeechUi(mode);

  // Optimistic paint so「关闭同传」/实时状态 flip without waiting on messaging.
  paintLive(
    {
      enabled: !!prefs.enabled,
      hasApiKey: !!prefs.hasApiKey,
      speechMode: mode,
      providerId: prefs.providerId ?? 'openai',
      iflytekPipeline: normalizeIflytekPipeline(prefs.iflytekPipeline),
    },
    {
      connected: true,
      page: {
        ok: true,
        enabled: !!prefs.enabled,
        speechOnThisPage: speechOn,
        speechMode: mode,
        hasApiKey: !!prefs.hasApiKey,
        hasVideo: lastHasVideo !== false,
        providerId: prefs.providerId ?? 'openai',
        iflytekPipeline: normalizeIflytekPipeline(prefs.iflytekPipeline),
      },
    },
  );
  await refresh();
}

enabledEl.addEventListener('change', async () => {
  try {
    lastActionError = '';
    const next = await setEnabled(enabledEl.checked);
    enabledEl.checked = next.enabled;
    await refresh();
  } catch (e) {
    enabledEl.checked = false;
    setStatus(e instanceof Error ? e.message : String(e), 'err');
  }
});

for (const el of speechInputs) {
  el.addEventListener('change', async () => {
    try {
      lastActionError = '';
      const mode = selectedSpeech();
      stSpeech.textContent =
        mode === 'voice' ? t('modeVoice') : t('modeCaption');
      // Push style to the page first so TTS on/off is immediate.
      const tab = await getActiveTab();
      if (!('error' in tab) && !isTabBlocked(tab)) {
        await ensureTabContent(tab.id);
        await setTabSpeechMode(tab.id, mode);
      }
      await setSpeechMode(mode);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), 'err');
      await refresh();
    }
  });
}

siToggleBtn.addEventListener('click', async () => {
  siToggleBtn.disabled = true;
  try {
    const prefs = await publicPrefsItem.getValue();
    if (!prefs.enabled) {
      lastActionError = t('errEnableMasterFirst');
      setStatus(lastActionError, 'err');
      return;
    }

    const tab = await getActiveTab();
    if ('error' in tab) {
      lastActionError = tab.error;
      await refresh({ preferError: lastActionError });
      return;
    }
    // Restriction message only when user tries to start SI.
    if (isTabBlocked(tab)) {
      lastActionError = tab.blocked;
      await refresh({ preferError: lastActionError });
      return;
    }

    const ready = await ensureTabContent(tab.id);
    if (!ready) {
      lastActionError = t('errInjectFailed');
      await refresh({ preferError: lastActionError });
      return;
    }

    const page = await queryTabStatus(tab.id);
    const currentlyOn = !!(page && page.ok && page.speechOnThisPage);
    const result = await toggleTabSpeech(tab.id, !currentlyOn);

    if (!result.ok) {
      lastActionError =
        result.error ||
        (currentlyOn ? t('errSiStopFailed') : t('errSiStartFailed'));
      await refresh({ preferError: lastActionError });
      return;
    }

    lastActionError = '';
    const bridge = await refresh();
    if (bridge.connected && bridge.page?.ok && bridge.page.speechOnThisPage) {
      setStatus(
        bridge.page.hasVideo ? t('siStartedPlay') : t('siStartedNoVideo'),
        'ok',
      );
    } else if (bridge.connected) {
      setStatus(t('siStopped'), '');
    }
  } finally {
    const prefs = await publicPrefsItem.getValue();
    siToggleBtn.disabled = !prefs.enabled;
  }
});

optionsLink.addEventListener('click', (e) => {
  e.preventDefault();
  browser.runtime.openOptionsPage();
});

function bindFoldableSections(): void {
  for (const section of document.querySelectorAll<HTMLElement>('.foldable')) {
    const key = section.dataset.foldKey;
    const toggle = section.querySelector<HTMLButtonElement>('.fold-toggle');
    if (!toggle) continue;

    const apply = (folded: boolean) => {
      section.classList.toggle('is-folded', folded);
      toggle.setAttribute('aria-expanded', folded ? 'false' : 'true');
      if (key) {
        try {
          localStorage.setItem(key, folded ? '1' : '0');
        } catch {
          /* ignore */
        }
      }
    };

    let initial = false;
    if (key) {
      try {
        initial = localStorage.getItem(key) === '1';
      } catch {
        initial = false;
      }
    }
    apply(initial);

    toggle.addEventListener('click', () => {
      apply(!section.classList.contains('is-folded'));
    });
  }
}

bindFoldableSections();

// Caption × / page navigation — SW writes session:siLive; also accept direct events.
browser.runtime.onMessage.addListener((message) => {
  if (!isPageSpeechStateEvent(message)) return;
  void syncFromSiLive({
    tabId: null,
    speechOnThisPage: message.speechOnThisPage,
    speechMode: normalizeSpeechMode(message.speechMode),
    rev: Date.now(),
  });
});
void siLiveItem.watch((live) => {
  void syncFromSiLive(live);
});

void publicPrefsItem.getValue().then(() => refresh());
void publicPrefsItem.watch(() => {
  void refresh(lastActionError ? { preferError: lastActionError } : undefined);
});
void refresh();
