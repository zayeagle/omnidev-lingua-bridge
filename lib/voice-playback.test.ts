/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  playTranslatedSpeech,
  speakTranslationVoice,
  speakWithBrowserTts,
  stopVoicePlayback,
  voicePlaybackQueueLength,
} from './voice-playback';

describe('voice-playback queue', () => {
  afterEach(() => {
    stopVoicePlayback();
    vi.restoreAllMocks();
  });

  it('queues browser TTS without cancelling prior utterances', async () => {
    const spoken: string[] = [];
    const cancel = vi.fn();
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel,
      resume: vi.fn(),
      getVoices: () => [],
      speak(u: FakeUtterance) {
        spoken.push(u.text);
        queueMicrotask(() => u.onend?.());
      },
    });

    expect(speakWithBrowserTts('第一句', 'zh')).toBe(true);
    expect(speakWithBrowserTts('第二句', 'zh')).toBe(true);
    expect(cancel).not.toHaveBeenCalled();

    await vi.waitFor(() => {
      expect(spoken).toEqual(['第一句', '第二句']);
    });
    expect(voicePlaybackQueueLength()).toBe(0);
  });

  it('playTranslatedSpeech waits for prior browser item', async () => {
    const order: string[] = [];
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [],
      speak(u: FakeUtterance) {
        order.push(`browser:${u.text}`);
        queueMicrotask(() => u.onend?.());
      },
    });

    const playSpy = vi
      .spyOn(HTMLAudioElement.prototype, 'play')
      .mockImplementation(function (this: HTMLAudioElement) {
        order.push('audio');
        queueMicrotask(() => {
          this.onended?.(new Event('ended'));
        });
        return Promise.resolve();
      });

    // Payload must be ≥64 bytes (short blobs are rejected as inaudible).
    const b64 = btoa('x'.repeat(80));
    speakWithBrowserTts('先读', 'zh');
    await playTranslatedSpeech(b64, 'audio/mpeg');
    expect(order[0]).toBe('browser:先读');
    expect(order).toContain('audio');
    playSpy.mockRestore();
  });

  it('speakTranslationVoice aborts provider TTS after stop / shouldContinue false', async () => {
    let providerCalls = 0;
    let continueSpeak = true;
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    // Fail browser TTS so the chain reaches provider speak.
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [],
      speak(u: FakeUtterance) {
        queueMicrotask(() => u.onerror?.());
      },
    });
    const playSpy = vi
      .spyOn(HTMLAudioElement.prototype, 'play')
      .mockImplementation(function (this: HTMLAudioElement) {
        queueMicrotask(() => {
          this.onended?.(new Event('ended'));
        });
        return Promise.resolve();
      });

    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const speakPromise = speakTranslationVoice({
      text: 'Hello world',
      lang: 'en',
      requestProviderSpeak: async () => {
        providerCalls += 1;
        await gate;
        return {
          audioBase64: btoa('x'.repeat(80)),
          mimeType: 'audio/mpeg',
        };
      },
      shouldContinue: () => continueSpeak,
    });

    await vi.waitFor(() => {
      expect(providerCalls).toBe(1);
    });
    continueSpeak = false;
    stopVoicePlayback();
    release();
    const how = await speakPromise;
    expect(how).toBe('none');
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });

  it('speakTranslationVoice prefers SI audio over optimistic browser TTS', async () => {
    const order: string[] = [];
    class FakeUtterance {
      text: string;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('speechSynthesis', {
      cancel: vi.fn(),
      resume: vi.fn(),
      getVoices: () => [],
      speak(u: FakeUtterance) {
        order.push(`browser:${u.text}`);
        queueMicrotask(() => u.onend?.());
      },
    });
    const playSpy = vi
      .spyOn(HTMLAudioElement.prototype, 'play')
      .mockImplementation(function (this: HTMLAudioElement) {
        order.push('audio');
        queueMicrotask(() => {
          this.onended?.(new Event('ended'));
        });
        return Promise.resolve();
      });

    const how = await speakTranslationVoice({
      text: 'Hello world',
      lang: 'en',
      audioBase64: btoa('x'.repeat(80)),
      mimeType: 'audio/wav',
    });
    expect(how).toBe('audio');
    expect(order[0]).toBe('audio');
    expect(order).not.toContain('browser:Hello world');
    playSpy.mockRestore();
  });
});
