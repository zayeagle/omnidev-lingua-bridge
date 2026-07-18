import { publicPrefsItem } from '../lib/public-prefs';
import { translateViewport, restoreOriginals } from '../lib/page-translate';
import {
  requestTranslate,
  requestExplain,
  requestTranscribe,
  requestSpeak,
} from '../lib/runtime-ai';
import {
  findPrimaryVideo,
  pageHasWatchableVideo,
  startSpeechPipeline,
} from '../lib/speech-pipeline';
import { freeSpeechSupported, startFreeSpeechPipeline } from '../lib/free-speech';
import { hideCue, setCaptionCloseHandler, showCue } from '../lib/caption-ui';
import {
  stopVoicePlayback,
  unlockVoicePlayback,
  speakWithBrowserTts,
  speakTranslationVoice,
  isVoiceUnlocked,
} from '../lib/voice-playback';
import { t } from '../lib/i18n';
import {
  detectLang,
  resolveSpeechTargetLang,
  targetLangFor,
  updateSpeechSourceState,
  type SpeechSourceState,
} from '../lib/lang-detect';
import type { IflytekPipeline, SpeechMode } from '../lib/storage';
import { normalizeIflytekPipeline, normalizeSpeechMode } from '../lib/storage';
import {
  isPageSpeechModeRequest,
  isPageSpeechRequest,
  isPageStatusRequest,
} from '../lib/messages';
import { showToast } from '../lib/toast-ui';
import { diagError, diagInfo, diagWarn } from '../lib/diag';
import { friendlyError } from '../lib/friendly-error';
import {
  getSelectedText,
  getSelectionRect,
  hideSelectionBubble,
  isEventInsideBubble,
  setBubbleResult,
  showSelectionBubble,
} from '../lib/selection-bubble';

/** Stable page key — full navigation / SPA route change clears per-page opts. */
function pageScopeKey(): string {
  return `${location.origin}${location.pathname}${location.search}`;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    let enabled = false;
    let speechMode: SpeechMode = 'caption';
    let hasApiKey = false;
    let providerId = 'openai';
    let iflytekPipeline: IflytekPipeline = 'composed';
    let translating = false;
    let speechStop: (() => void) | null = null;
    let selectionBound = false;
    /** After manual dismiss, ignore reopen for a short window. */
    let suppressBubbleUntil = 0;
    /**
     * Mic / SI for this document only — default off.
     * Opened via selection bubble ⋯ ; cleared on navigation.
     */
    let speechOnThisPage = false;
    let scopeKey = pageScopeKey();
    /** Sticky spoken language for dynamic zh↔en SI (updated from ASR). */
    let speechSourceState: SpeechSourceState = { source: null, streak: 0 };
    /** Bumps on every stop/restart so late async chunks cannot keep speaking. */
    let speechEpoch = 0;
    /**
     * Bumps when leaving 语音传译 so in-flight speakTranslationVoice / free TTS
     * cannot resume after 静默字幕.
     */
    let voiceGate = 0;
    /** Latest cue — re-spoken immediately when switching back to 语音传译. */
    let lastSpeakable: { text: string; lang: 'zh' | 'en' } | null = null;

    const toast = (msg: string) =>
      showToast(friendlyError(msg), { durationMs: 4000 });

    const speechTargetLang = (): 'zh' | 'en' =>
      resolveSpeechTargetLang({
        sourceState: speechSourceState,
        pageTitle: document.title || '',
        pageSample: document.body?.innerText?.slice(0, 800) || '',
      });

    const voiceActive = (epoch: number, gate: number) =>
      epoch === speechEpoch &&
      gate === voiceGate &&
      speechMode === 'voice' &&
      speechOnThisPage;

    const rememberSpeakable = (text: string, lang: 'zh' | 'en') => {
      const trimmed = text.trim();
      if (!trimmed) return;
      lastSpeakable = { text: trimmed, lang };
    };

    const runPageTranslate = async () => {
      if (!enabled || translating) return;
      translating = true;
      try {
        await translateViewport(async (texts, targetLang) =>
          requestTranslate(texts, targetLang),
        );
      } catch (e) {
        toast(e instanceof Error ? e.message : '页面翻译失败');
      } finally {
        translating = false;
      }
    };

    const notifySpeechState = () => {
      void browser.runtime
        .sendMessage({
          type: 'page.speechState',
          speechOnThisPage,
          speechMode,
        })
        .catch(() => {
          /* SW / popup may be unavailable */
        });
    };

    const stopSpeech = () => {
      speechEpoch += 1;
      voiceGate += 1;
      speechStop?.();
      speechStop = null;
      hideCue();
      stopVoicePlayback();
      lastSpeakable = null;
      speechSourceState = { source: null, streak: 0 };
    };

    const ensureSpeech = () => {
      if (!enabled || !speechOnThisPage) {
        stopSpeech();
        return;
      }
      stopSpeech();
      const epoch = speechEpoch;

      if (hasApiKey) {
        const video = findPrimaryVideo();
        if (!video) {
          toast('本页未找到视频；有视频时再开同传');
          return;
        }

        speechStop = startSpeechPipeline(video, {
          mode: speechMode,
          chunkMs: 3200,
          captureFormat: providerId === 'iflytek' ? 'pcm16' : 'webm',
          transcribe: async (audioBase64, mimeType) => {
            // Live speechMode — not the value frozen at pipeline start.
            return requestTranscribe(
              audioBase64,
              mimeType,
              speechTargetLang(),
              speechMode === 'voice',
            );
          },
          output: async (cue, _mode, meta) => {
            if (epoch !== speechEpoch) return;
            const gate = voiceGate;
            // Stick source lang from recognition so next chunks follow speech.
            if (cue.text) {
              const prev = speechSourceState.source;
              speechSourceState = updateSpeechSourceState(
                speechSourceState,
                cue.text,
              );
              if (
                speechSourceState.source &&
                speechSourceState.source !== prev
              ) {
                diagInfo('pipeline', '同传语种已切换', {
                  source: speechSourceState.source,
                  target: speechTargetLang(),
                  preview: cue.text.slice(0, 48),
                });
              }
            }
            // Always show caption so SI is visible even when TTS fails / muted.
            if (cue.text || cue.translation) showCue(cue);
            const speakText = (cue.translation || cue.text || '').trim();
            if (speakText) {
              const detected = detectLang(speakText);
              const speakLang: 'zh' | 'en' =
                detected === 'en' || detected === 'zh'
                  ? detected
                  : speechTargetLang();
              rememberSpeakable(speakText, speakLang);
            }
            // Live gate:「静默字幕」must not speak (and must cut any leftover TTS).
            if (!voiceActive(epoch, gate)) {
              stopVoicePlayback();
              return;
            }
            if (!speakText && !meta?.audioBase64) return;
            const speakLang = lastSpeakable?.lang ?? speechTargetLang();

            try {
              if (!isVoiceUnlocked()) {
                await unlockVoicePlayback();
              }
              if (!voiceActive(epoch, gate)) {
                stopVoicePlayback();
                return;
              }
              const how = await speakTranslationVoice({
                text: speakText,
                lang: speakLang,
                audioBase64: meta?.audioBase64,
                mimeType: meta?.mimeType,
                requestProviderSpeak: () => requestSpeak(speakText),
                shouldContinue: () => voiceActive(epoch, gate),
              });
              if (!voiceActive(epoch, gate)) {
                stopVoicePlayback();
                return;
              }
              if (how === 'none') {
                toast('[播放] 无法播放语音：请点击一下页面以允许声音');
              } else {
                diagInfo('playback', `译文朗读 · ${how} · ${speakLang}`, {
                  chars: speakText.length,
                });
              }
            } catch (e) {
              if (!voiceActive(epoch, gate)) return;
              const raw = e instanceof Error ? e.message : String(e);
              diagError('playback', `播放失败，尝试浏览器朗读：${raw}`);
              if (!speakWithBrowserTts(speakText, speakLang)) {
                toast(`[播放] ${friendlyError(raw)}`);
              }
            }
          },
          onError: (message) => {
            if (epoch !== speechEpoch) return;
            diagError('pipeline', message);
            toast(friendlyError(message));
          },
        }).stop;
        diagInfo('pipeline', '视频同传已启动', {
          providerId,
          speechMode,
          captureFormat: providerId === 'iflytek' ? 'pcm16' : 'webm',
        });
        if (speechMode === 'voice') {
          void unlockVoicePlayback().then((ok) => {
            if (!ok) {
              toast('语音传译：请点击一下页面任意处，以允许播放声音');
              const unlockOnce = () => {
                document.removeEventListener('pointerdown', unlockOnce, true);
                void unlockVoicePlayback();
              };
              document.addEventListener('pointerdown', unlockOnce, true);
            }
          });
        }
        if (video.paused) {
          toast('同传已开：请点击播放视频');
        }
        return;
      }

      if (!freeSpeechSupported()) {
        toast('划词可译；视频同传请配置 API Key');
        return;
      }

      const sample = document.body?.innerText?.slice(0, 400) ?? '';
      const listenLang = detectLang(sample) === 'en' ? 'en' : 'zh';

      speechStop = startFreeSpeechPipeline({
        shouldSpeak: () => speechMode === 'voice' && speechOnThisPage,
        listenLang,
        translate: async (text, targetLang) => {
          const [t] = await requestTranslate([text], targetLang);
          return t ?? text;
        },
        onCaption: (cue) => {
          showCue(cue);
          const text = (cue.translation || cue.text || '').trim();
          if (!text) return;
          const detected = detectLang(text);
          rememberSpeakable(
            text,
            detected === 'en' || detected === 'zh' ? detected : 'zh',
          );
        },
        onError: (message) => toast(message),
      }).stop;
    };

    /**
     * 同传样式切换：立刻开/关朗读，不重启采音（避免字幕闪断）。
     * 静默→语音：解锁并立即重读最近一条字幕；语音→静默：硬停并作废进行中朗读。
     */
    const syncSpeechStylePlayback = (mode: SpeechMode) => {
      if (mode !== 'voice') {
        voiceGate += 1;
        stopVoicePlayback();
        diagInfo('playback', '同传样式→静默字幕：已停止朗读');
        return;
      }
      if (!speechOnThisPage) {
        diagInfo('playback', '同传样式→语音传译：同传未开，待开启后朗读');
        return;
      }
      const epoch = speechEpoch;
      const gate = voiceGate;
      void unlockVoicePlayback().then((ok) => {
        if (!voiceActive(epoch, gate)) return;
        diagInfo(
          'playback',
          ok
            ? '同传样式→语音传译：已解锁，开始朗读'
            : '同传样式→语音传译：请点击页面以允许声音',
        );
        if (!ok) {
          toast('语音传译：请点击一下页面任意处，以允许播放声音');
          const unlockOnce = () => {
            document.removeEventListener('pointerdown', unlockOnce, true);
            void unlockVoicePlayback().then((unlocked) => {
              if (!unlocked || !voiceActive(epoch, gate) || !lastSpeakable) {
                return;
              }
              void speakTranslationVoice({
                text: lastSpeakable.text,
                lang: lastSpeakable.lang,
                requestProviderSpeak: () =>
                  requestSpeak(lastSpeakable!.text),
                shouldContinue: () => voiceActive(epoch, gate),
              });
            });
          };
          document.addEventListener('pointerdown', unlockOnce, true);
          return;
        }
        // Immediately resume TTS with the latest cue (do not wait for next chunk).
        if (!lastSpeakable) return;
        void speakTranslationVoice({
          text: lastSpeakable.text,
          lang: lastSpeakable.lang,
          requestProviderSpeak: () => requestSpeak(lastSpeakable!.text),
          shouldContinue: () => voiceActive(epoch, gate),
        }).then((how) => {
          if (!voiceActive(epoch, gate)) return;
          if (how === 'none') {
            toast('[播放] 无法播放语音：请点击一下页面以允许声音');
          } else {
            diagInfo('playback', `样式切换立即朗读 · ${how}`, {
              chars: lastSpeakable!.text.length,
            });
          }
        });
      });
    };

    /** Apply style from popup message or storage — always syncs TTS on/off. */
    const applySpeechModeLive = (next: SpeechMode) => {
      const mode = normalizeSpeechMode(next);
      if (mode === speechMode) return;
      speechMode = mode;
      syncSpeechStylePlayback(mode);
      notifySpeechState();
    };

    const setSpeechOnThisPage = (
      on: boolean,
    ): { ok: boolean; error?: string } => {
      if (!on) {
        speechOnThisPage = false;
        stopSpeech();
        notifySpeechState();
        toast('本页同传已关闭');
        return { ok: true };
      }
      if (!enabled) {
        return { ok: false, error: '请先打开主开关' };
      }
      speechOnThisPage = true;
      ensureSpeech();
      if (!speechStop) {
        speechOnThisPage = false;
        notifySpeechState();
        const error = hasApiKey
          ? '本页未找到可同传视频，请先打开并播放视频页'
          : '无法启动麦克风同传；视频音轨需配置 API Key';
        toast(error);
        return { ok: false, error };
      }
      notifySpeechState();
      toast(
        hasApiKey
          ? '本页同传已打开（仅限本页）'
          : '本页同传已打开（麦克风；视频音轨需 API Key）',
      );
      return { ok: true };
    };

    // Caption × stops SI so the panel does not reopen on the next cue.
    setCaptionCloseHandler(() => {
      setSpeechOnThisPage(false);
    });

    /** Drop per-page speech when the user navigates to another page/route. */
    const syncPageScope = () => {
      const next = pageScopeKey();
      if (next === scopeKey) return;
      scopeKey = next;
      if (speechOnThisPage) {
        speechOnThisPage = false;
        stopSpeech();
        notifySpeechState();
        toast('已换页，同传已关闭（需划词后在气泡 ⋯ 中重新打开）');
      }
    };

    const openBubbleForSelection = (ev?: MouseEvent) => {
      if (!enabled) return;
      if (Date.now() < suppressBubbleUntil) return;
      if (ev && isEventInsideBubble(ev.target)) return;
      syncPageScope();
      const text = getSelectedText();
      const rect = getSelectionRect();
      if (!text || !rect) return;

      showSelectionBubble(rect, text, {
        speechOnThisPage,
        hasApiKey,
        onToggleSpeechThisPage: (on) => {
          const r = setSpeechOnThisPage(on);
          return r.ok;
        },
        onTranslateSelection: async (selected) => {
          const target = targetLangFor(detectLang(selected)) ?? 'zh';
          try {
            const result = await requestExplain(selected, target);
            setBubbleResult(result.translation, result.terms, selected);
          } catch (e) {
            const msg =
              e instanceof Error ? e.message : t('toastTranslateFail');
            toast(msg);
            throw e;
          }
        },
        onTranslatePage: async () => {
          try {
            hideSelectionBubble();
            await runPageTranslate();
            toast(t('toastPageTranslated'));
          } catch (e) {
            toast(
              e instanceof Error ? e.message : t('toastPageTranslateFail'),
            );
            throw e;
          }
        },
      });
    };

    const onMouseUp = (ev: MouseEvent) => {
      window.setTimeout(() => openBubbleForSelection(ev), 10);
    };

    const onBubbleDismiss = () => {
      suppressBubbleUntil = Date.now() + 600;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        suppressBubbleUntil = Date.now() + 600;
        hideSelectionBubble();
        window.getSelection()?.removeAllRanges();
      }
    };

    const bindSelection = () => {
      if (selectionBound) return;
      document.addEventListener('mouseup', onMouseUp);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('lb-bubble-dismiss', onBubbleDismiss);
      selectionBound = true;
    };

    const unbindSelection = () => {
      if (!selectionBound) return;
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('lb-bubble-dismiss', onBubbleDismiss);
      hideSelectionBubble();
      selectionBound = false;
    };

    const applySettings = async (
      nextEnabled: boolean,
      nextSpeech: SpeechMode,
      nextHasKey: boolean,
      nextProvider: string,
      nextPipeline: IflytekPipeline,
    ) => {
      const enableChanged = nextEnabled !== enabled;
      const speechChanged = nextSpeech !== speechMode;
      const keyChanged = nextHasKey !== hasApiKey;
      const providerChanged = nextProvider !== providerId;
      const pipelineChanged = nextPipeline !== iflytekPipeline;

      enabled = nextEnabled;
      speechMode = nextSpeech;
      hasApiKey = nextHasKey;
      providerId = nextProvider || 'openai';
      iflytekPipeline = nextPipeline;

      if (!enabled) {
        speechOnThisPage = false;
        stopSpeech();
        unbindSelection();
        restoreOriginals();
        hideSelectionBubble();
        return;
      }

      if (enableChanged) restoreOriginals();
      bindSelection();

      // Style toggle must sync playback immediately (before any restart).
      // Assign speechMode first so shouldContinue / free-speech wantSpeak see caption.
      if (speechChanged) {
        syncSpeechStylePlayback(speechMode);
      }

      // Restart capture only when routing/credentials change — not for style-only
      // toggles (live speechMode gates already open/close朗读).
      const needsRestart =
        enableChanged || keyChanged || providerChanged || pipelineChanged;
      if (speechOnThisPage && needsRestart) {
        ensureSpeech();
      } else if (!speechOnThisPage) {
        stopSpeech();
      }
    };

    void publicPrefsItem.getValue().then((s) =>
      applySettings(
        !!s.enabled,
        normalizeSpeechMode(s.speechMode),
        !!s.hasApiKey,
        s.providerId ?? 'openai',
        normalizeIflytekPipeline(s.iflytekPipeline),
      ),
    );

    const unwatch = publicPrefsItem.watch((s) => {
      void applySettings(
        !!s?.enabled,
        normalizeSpeechMode(s?.speechMode),
        !!s?.hasApiKey,
        s?.providerId ?? 'openai',
        normalizeIflytekPipeline(s?.iflytekPipeline),
      );
    });

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!message || typeof message !== 'object') return false;
      if (isPageStatusRequest(message)) {
        sendResponse({
          ok: true,
          enabled,
          speechOnThisPage,
          speechMode,
          hasApiKey,
          hasVideo: pageHasWatchableVideo(),
          providerId,
          iflytekPipeline,
        });
        return true;
      }
      if (isPageSpeechModeRequest(message)) {
        applySpeechModeLive(message.mode);
        sendResponse({ ok: true, speechMode });
        return true;
      }
      if (!isPageSpeechRequest(message)) return false;
      const result = setSpeechOnThisPage(!!message.on);
      sendResponse({
        ok: result.ok,
        speechOnThisPage,
        error: result.error,
      });
      return true;
    });

    window.addEventListener('popstate', syncPageScope);
    window.addEventListener('hashchange', syncPageScope);

    const mo = new MutationObserver(() => {
      syncPageScope();
      if (!enabled) return;
      if (speechOnThisPage && !speechStop) ensureSpeech();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });

    ctx.onInvalidated(() => {
      unwatch();
      mo.disconnect();
      window.removeEventListener('popstate', syncPageScope);
      window.removeEventListener('hashchange', syncPageScope);
      unbindSelection();
      stopSpeech();
    });
  },
});
