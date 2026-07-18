/** Browser Web Speech SI path when no API Key (mic-based; video-track needs AI STT). */

import type { CuePayload } from './caption-ui';
import type { SpeechMode } from './storage';
import { speakWithBrowserTts, stopVoicePlayback } from './voice-playback';

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
  resultIndex: number;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type FreeSpeechOptions = {
  /**
   * Prefer `shouldSpeak` so 同传样式 switches apply live without restarting mic.
   * Frozen `mode` kept for backward compatibility.
   */
  mode?: SpeechMode;
  shouldSpeak?: () => boolean;
  /** Page/UI language hint for recognition + translate target. */
  listenLang: 'zh' | 'en';
  translate: (text: string, targetLang: 'zh' | 'en') => Promise<string>;
  onCaption: (cue: CuePayload & { translation: string }) => void;
  onError?: (message: string) => void;
};

export function freeSpeechSupported(): boolean {
  return !!getSpeechRecognitionCtor();
}

/**
 * Mic-based SI: recognize → translate → caption or speechSynthesis.
 * Note: does not capture HTMLVideoElement audio (needs API Key STT).
 */
export function startFreeSpeechPipeline(opts: FreeSpeechOptions): { stop: () => void } {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    opts.onError?.('当前浏览器不支持语音识别；配置 API Key 可用 AI 视频同传');
    return { stop: () => undefined };
  }

  let stopped = false;
  const recognition = new Ctor();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = opts.listenLang === 'zh' ? 'zh-CN' : 'en-US';

  const targetLang = opts.listenLang === 'zh' ? 'en' : 'zh';
  const wantSpeak = () =>
    opts.shouldSpeak?.() ?? opts.mode === 'voice';

  recognition.onresult = (ev) => {
    void (async () => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const row = ev.results[i];
        if (!row?.isFinal) continue;
        const transcript = row[0]?.transcript?.trim();
        if (!transcript) continue;
        try {
          const translated = await opts.translate(transcript, targetLang);
          if (stopped) return;
          opts.onCaption({ text: transcript, translation: translated });
          // Re-check after translate await — style may have switched to 静默字幕.
          if (!wantSpeak()) {
            stopVoicePlayback();
            return;
          }
          speakWithBrowserTts(
            translated,
            targetLang === 'zh' ? 'zh' : 'en',
          );
        } catch (e) {
          if (stopped) return;
          opts.onError?.(e instanceof Error ? e.message : '免费语音传译失败');
        }
      }
    })();
  };

  recognition.onerror = (ev) => {
    if (stopped) return;
    if (ev.error === 'not-allowed') {
      opts.onError?.('麦克风权限被拒绝；或配置 API Key 使用视频音轨同传');
    }
  };

  recognition.onend = () => {
    if (!stopped) {
      try {
        recognition.start();
      } catch {
        /* ignore restart races */
      }
    }
  };

  try {
    recognition.start();
  } catch {
    opts.onError?.('无法启动浏览器语音识别');
  }

  return {
    stop: () => {
      stopped = true;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      stopVoicePlayback();
    },
  };
}
