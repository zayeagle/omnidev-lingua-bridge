/** Play TTS audio for voice simultaneous-interpretation mode. */

import { base64ToBytes } from './base64';
import { diagError, diagInfo, diagWarn } from './diag';

let current: HTMLAudioElement | null = null;
let unlocked = false;
let draining = false;
/** Settles the in-flight play promise when stopVoicePlayback runs. */
let settlePlaying: ((ok: boolean) => void) | null = null;

type AudioItem = {
  kind: 'audio';
  audioBase64: string;
  mimeType: string;
  /** Captured at enqueue — dropped if stopVoicePlayback ran since. */
  generation: number;
  resolve: () => void;
  reject: (e: Error) => void;
};

type BrowserItem = {
  kind: 'browser';
  text: string;
  lang: 'zh' | 'en';
  generation: number;
  resolve: () => void;
  reject: (e: Error) => void;
};

type QueueItem = AudioItem | BrowserItem;

const queue: QueueItem[] = [];

function b64ToBlob(audioBase64: string, mimeType: string): Blob {
  const bytes = base64ToBytes(audioBase64);
  if (!bytes.length) throw new Error('音频 base64 无效或为空');
  // Copy into a fresh ArrayBuffer-backed view for BlobPart typing.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: mimeType || 'audio/mpeg' });
}

function stopCurrentAudio(): void {
  if (!current) return;
  current.onended = null;
  current.onerror = null;
  current.pause();
  try {
    if (current.src.startsWith('blob:')) URL.revokeObjectURL(current.src);
  } catch {
    /* ignore */
  }
  current.src = '';
  current = null;
}

/** Bumped on every stop so in-flight speakTranslationVoice can abort mid-await. */
let playbackGeneration = 0;

export function stopVoicePlayback(): void {
  playbackGeneration += 1;
  // Quietly finish pending waiters — do not reject (avoids fallback TTS storms).
  for (const item of queue) item.resolve();
  queue.length = 0;
  stopCurrentAudio();
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  const settle = settlePlaying;
  settlePlaying = null;
  settle?.(true);
  draining = false;
}

/** Call after a user gesture (or SI start) so later plays are allowed. */
export async function unlockVoicePlayback(): Promise<boolean> {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AC) {
      const ctx = new AC();
      if (ctx.state === 'suspended') await ctx.resume();
      void ctx.close();
    }
    // Tiny silent wav — establishes media engagement for this document.
    const silent = new Audio(
      'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=',
    );
    silent.volume = 0.01;
    await silent.play();
    silent.pause();
    if ('speechSynthesis' in window) {
      try {
        // Warm voices + clear paused state (Chrome often stays paused).
        void window.speechSynthesis.getVoices();
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
    }
    unlocked = true;
    diagInfo('playback', '音频播放权限已解锁');
    return true;
  } catch (e) {
    unlocked = false;
    diagWarn('playback', '音频尚未解锁（需用户点击页面）', e);
    return false;
  }
}

export function isVoiceUnlocked(): boolean {
  return unlocked;
}

function pickBrowserVoice(lang: 'zh' | 'en'): SpeechSynthesisVoice | null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const want = lang === 'zh' ? 'zh' : 'en';
  const exact = voices.find((v) =>
    v.lang.toLowerCase().replace('_', '-').startsWith(want === 'zh' ? 'zh' : 'en'),
  );
  return exact ?? null;
}

function playAudioOne(item: AudioItem): Promise<void> {
  return new Promise((resolve, reject) => {
    let url = '';
    let settled = false;
    const finish = (ok: boolean, err?: Error) => {
      if (settled) return;
      settled = true;
      if (settlePlaying === finishAsSettle) settlePlaying = null;
      try {
        if (url) URL.revokeObjectURL(url);
      } catch {
        /* ignore */
      }
      if (current) {
        current.onended = null;
        current.onerror = null;
        if (current.src === url) current = null;
      }
      if (ok) resolve();
      else reject(err ?? new Error('音频播放失败'));
    };
    const finishAsSettle = (ok: boolean) => finish(ok);

    try {
      const blob = b64ToBlob(item.audioBase64, item.mimeType);
      // Tiny payloads are almost never audible speech.
      if (blob.size < 64) {
        finish(false, new Error('合成音频过短或为空'));
        return;
      }
      url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'auto';
      current = audio;
      settlePlaying = finishAsSettle;

      audio.onended = () => finish(true);
      audio.onerror = () => finish(false, new Error('音频解码/播放失败'));
      audio.onloadedmetadata = () => {
        const d = audio.duration;
        if (Number.isFinite(d) && d > 0 && d < 0.08) {
          finish(false, new Error('合成音频过短'));
        }
      };
      audio.src = url;
      void audio
        .play()
        .then(() => {
          diagInfo('playback', '开始播放合成语音', {
            bytes: item.audioBase64.length,
            mime: item.mimeType,
          });
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          finish(false, new Error(`浏览器阻止播放：${msg}`));
        });
    } catch (e) {
      finish(false, e instanceof Error ? e : new Error(String(e)));
    }
  });
}

function playBrowserOne(item: BrowserItem): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!('speechSynthesis' in window)) {
      reject(new Error('浏览器不支持朗读'));
      return;
    }
    let settled = false;
    const finish = (ok: boolean, err?: Error) => {
      if (settled) return;
      settled = true;
      if (settlePlaying === finishAsSettle) settlePlaying = null;
      if (ok) resolve();
      else reject(err ?? new Error('浏览器朗读失败'));
    };
    const finishAsSettle = (ok: boolean) => finish(ok);
    settlePlaying = finishAsSettle;

    try {
      try {
        window.speechSynthesis.resume();
      } catch {
        /* ignore */
      }
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = item.lang === 'zh' ? 'zh-CN' : 'en-US';
      u.rate = 1;
      const voice = pickBrowserVoice(item.lang);
      if (voice) u.voice = voice;
      u.onend = () => finish(true);
      u.onerror = () => finish(false, new Error('浏览器朗读失败'));
      // Do NOT cancel prior utterances here — queue already serializes playback.
      window.speechSynthesis.speak(u);
      diagInfo('playback', '开始浏览器朗读', {
        chars: item.text.length,
        lang: item.lang,
        voice: voice?.name,
      });
    } catch (e) {
      finish(false, e instanceof Error ? e : new Error(String(e)));
    }
  });
}

async function drainQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      // Drop anything enqueued before the latest stop (style → 静默字幕).
      if (item.generation !== playbackGeneration) {
        item.resolve();
        continue;
      }
      try {
        if (item.kind === 'audio') {
          await playAudioOne(item);
        } else {
          await playBrowserOne(item);
        }
        item.resolve();
      } catch (e) {
        item.reject(e instanceof Error ? e : new Error(String(e)));
      }
    }
  } finally {
    draining = false;
    if (queue.length) void drainQueue();
  }
}

/**
 * Queue TTS audio (sequential). Does not cut off the previous sentence mid-play.
 */
export async function playTranslatedSpeech(
  audioBase64: string,
  mimeType = 'audio/mpeg',
): Promise<void> {
  if (!audioBase64) {
    throw new Error('合成音频为空');
  }
  return new Promise((resolve, reject) => {
    queue.push({
      kind: 'audio',
      audioBase64,
      mimeType,
      generation: playbackGeneration,
      resolve,
      reject,
    });
    void drainQueue();
  });
}

/**
 * Queue browser TTS and wait until it finishes or fails.
 * Resolves false when API missing, empty text, or utterance error.
 */
export function speakWithBrowserTtsAsync(
  text: string,
  lang: 'zh' | 'en' = 'zh',
): Promise<boolean> {
  const trimmed = text.trim();
  if (!trimmed || !('speechSynthesis' in window)) return Promise.resolve(false);
  try {
    window.speechSynthesis.resume();
  } catch {
    /* ignore */
  }
  return new Promise((resolve) => {
    const generation = playbackGeneration;
    queue.push({
      kind: 'browser',
      text: trimmed,
      lang,
      generation,
      resolve: () => resolve(generation === playbackGeneration),
      reject: (e) => {
        diagError('playback', '浏览器朗读失败', e);
        resolve(false);
      },
    });
    void drainQueue();
  });
}

/**
 * Queue browser TTS (sequential). Does not cancel the previous utterance.
 * Returns false only when Speech Synthesis API is unavailable / empty text.
 * Fire-and-forget — use speakWithBrowserTtsAsync when fallback chains need success.
 */
export function speakWithBrowserTts(
  text: string,
  lang: 'zh' | 'en' = 'zh',
): boolean {
  const trimmed = text.trim();
  if (!trimmed || !('speechSynthesis' in window)) return false;
  void speakWithBrowserTtsAsync(trimmed, lang);
  return true;
}

/**
 * Speak translation in voice SI mode.
 * Prefer SI-embedded audio (zh/en); then browser TTS; then provider TTS.
 * Never treat browser TTS as success before it actually finishes.
 * `shouldContinue` + stopVoicePlayback generation abort mid-await (e.g. 静默字幕).
 */
export async function speakTranslationVoice(opts: {
  text: string;
  lang: 'zh' | 'en';
  audioBase64?: string;
  mimeType?: string;
  requestProviderSpeak?: () => Promise<{
    audioBase64: string;
    mimeType: string;
  }>;
  /** Return false when voice SI was turned off / style switched to caption. */
  shouldContinue?: () => boolean;
}): Promise<'audio' | 'browser' | 'none'> {
  const text = opts.text.trim();
  if (!text && !opts.audioBase64) return 'none';

  const gen = playbackGeneration;
  const active = () =>
    gen === playbackGeneration && (opts.shouldContinue?.() ?? true);

  // 1) Play audio returned with this SI chunk (raw PCM→WAV / mp3).
  if (opts.audioBase64) {
    if (!active()) return 'none';
    try {
      await playTranslatedSpeech(
        opts.audioBase64,
        opts.mimeType || 'audio/mpeg',
      );
      return active() ? 'audio' : 'none';
    } catch (e) {
      diagWarn(
        'playback',
        e instanceof Error ? e.message : '合成音频播放失败',
      );
    }
  }

  if (!active()) return 'none';

  // 2) Browser TTS (await) — good for EN when OS has a voice.
  if (text && (await speakWithBrowserTtsAsync(text, opts.lang))) {
    return active() ? 'browser' : 'none';
  }

  if (!active()) return 'none';

  // 3) Separate provider TTS round-trip when SI audio missing/unplayable.
  if (opts.requestProviderSpeak && text) {
    try {
      const audio = await opts.requestProviderSpeak();
      if (!active()) return 'none';
      if (audio.audioBase64) {
        await playTranslatedSpeech(
          audio.audioBase64,
          audio.mimeType || 'audio/mpeg',
        );
        return active() ? 'audio' : 'none';
      }
    } catch (e) {
      if (!active()) return 'none';
      diagWarn(
        'playback',
        e instanceof Error ? e.message : '二次合成失败',
      );
    }
  }

  return 'none';
}

/** Pending items waiting to play (excludes the one currently playing). */
export function voicePlaybackQueueLength(): number {
  return queue.length;
}
