import type { CuePayload } from './caption-ui';
import { diagError, diagInfo, diagWarn, StageError } from './diag';
import type { SpeechMode } from './storage';

export type TranscribeResult = {
  text: string;
  translation?: string;
  audioBase64?: string;
  mimeType?: string;
};

export type TranscribeFn = (
  audioBase64: string,
  mimeType: string,
) => Promise<TranscribeResult>;

export type SpeechOutputFn = (
  cue: CuePayload & { translation: string },
  mode: SpeechMode,
  meta?: Pick<TranscribeResult, 'audioBase64' | 'mimeType'>,
) => Promise<void> | void;

export type SpeechPipelineOptions = {
  mode: SpeechMode;
  transcribe: TranscribeFn;
  output: SpeechOutputFn;
  onError?: (message: string) => void;
  /** Shorter chunks ≈ better SI latency foundation */
  chunkMs?: number;
  /** iFlytek needs PCM16LE @ 16k; default webm for OpenAI Whisper */
  captureFormat?: 'webm' | 'pcm16';
};

function floatTo16BitPcm(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]!));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function downsampleTo16k(input: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return input;
  const ratio = sampleRate / 16000;
  const newLen = Math.floor(input.length / ratio);
  const out = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) {
    out[i] = input[Math.floor(i * ratio)] ?? 0;
  }
  return out;
}

function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const base64 = result.includes(',') ? result.split(',')[1]! : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Prefer captureStream — avoids YouTube CORS break on createMediaElementSource. */
function captureVideoAudioStream(video: HTMLMediaElement): MediaStream | null {
  try {
    const v = video as HTMLMediaElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    const stream = v.captureStream?.() ?? v.mozCaptureStream?.();
    if (stream && stream.getAudioTracks().length > 0) return stream;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Simultaneous-interpretation foundation: chunked capture → STT/translate → mode output.
 */
export function startSpeechPipeline(
  video: HTMLMediaElement,
  opts: SpeechPipelineOptions,
): { stop: () => void } {
  const chunkMs = opts.chunkMs ?? 3200;
  const captureFormat = opts.captureFormat ?? 'webm';
  let stopped = false;
  let timer: number | undefined;
  let recorder: MediaRecorder | undefined;
  let ctx: AudioContext | undefined;
  let elementSource: MediaElementAudioSourceNode | undefined;
  let streamSource: MediaStreamAudioSourceNode | undefined;
  let processor: ScriptProcessorNode | undefined;
  let pcmChunks: Float32Array[] = [];

  const fail = (msg: string, stage: 'capture' | 'pipeline' = 'pipeline') => {
    diagError(stage, msg);
    opts.onError?.(msg.startsWith('[') ? msg : `[${stage === 'capture' ? '采音' : '同传管线'}] ${msg}`);
  };

  const emitPcmChunk = () => {
    if (stopped || !pcmChunks.length) return;
    const total = pcmChunks.reduce((n, c) => n + c.length, 0);
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of pcmChunks) {
      merged.set(c, off);
      off += c.length;
    }
    pcmChunks = [];
    if (!merged.length) return;
    const pcm = floatTo16BitPcm(merged);
    const audioBase64 = pcm16ToBase64(pcm);
    void (async () => {
      try {
        diagInfo('pipeline', '分片送识别/翻译', {
          pcmB64Len: audioBase64.length,
          format: 'pcm16',
        });
        const result = await opts.transcribe(audioBase64, 'audio/pcm;rate=16000');
        // Drop late results after stop / mode switch — otherwise voice keeps speaking.
        if (stopped) return;
        const text = (result.text ?? '').trim();
        const translation =
          (result.translation ?? '').trim() || text;
        if (text && !result.translation?.trim()) {
          diagWarn('pipeline', '有识别文本但无译文，字幕将显示原文', {
            textPreview: text.slice(0, 80),
          });
        }
        if (!text && !translation && !result.audioBase64) {
          diagInfo('pipeline', '本分片无可用字幕（空识别）');
          return;
        }
        await opts.output(
          { text, translation },
          opts.mode,
          {
            audioBase64: result.audioBase64,
            mimeType: result.mimeType,
          },
        );
      } catch (e) {
        if (stopped) return;
        const msg =
          e instanceof StageError
            ? e.message
            : e instanceof Error
              ? e.message
              : String(e);
        fail(msg);
      }
    })();
  };

  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx();

    const captured = captureVideoAudioStream(video);
    let tap: AudioNode;
    if (captured) {
      streamSource = ctx.createMediaStreamSource(captured);
      tap = streamSource;
    } else {
      elementSource = ctx.createMediaElementSource(video);
      elementSource.connect(ctx.destination);
      tap = elementSource;
    }

    if (captureFormat === 'pcm16') {
      processor = ctx.createScriptProcessor(4096, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      tap.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);
      processor.onaudioprocess = (ev) => {
        if (stopped) return;
        const input = ev.inputBuffer.getChannelData(0);
        const down = downsampleTo16k(input, ctx!.sampleRate);
        pcmChunks.push(new Float32Array(down));
      };
      void ctx.resume();
      const tick = () => {
        if (stopped) return;
        if (!video.paused && !video.ended) emitPcmChunk();
        timer = window.setTimeout(tick, chunkMs);
      };
      timer = window.setTimeout(tick, chunkMs);
    } else {
      const dest = ctx.createMediaStreamDestination();
      tap.connect(dest);
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const pump = () => {
        if (stopped || video.paused || video.ended) {
          timer = window.setTimeout(pump, 800);
          return;
        }

        const chunks: BlobPart[] = [];
        try {
          recorder = new MediaRecorder(dest.stream, { mimeType });
        } catch {
          fail('无法采集视频音频（可能受 DRM/跨域限制）', 'capture');
          return;
        }

        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = () => {
          void (async () => {
            if (stopped || !chunks.length) return;
            try {
              const blob = new Blob(chunks, { type: mimeType });
              const audioBase64 = await blobToBase64(blob);
              if (stopped) return;
              diagInfo('pipeline', '分片送识别/翻译', {
                mimeType,
                b64Len: audioBase64.length,
              });
              const result = await opts.transcribe(audioBase64, mimeType);
              if (stopped) return;
              const text = (result.text ?? '').trim();
              const translation =
                (result.translation ?? '').trim() || text;
              if (text && !result.translation?.trim()) {
                diagWarn('pipeline', '有识别文本但无译文，字幕将显示原文', {
                  textPreview: text.slice(0, 80),
                });
              }
              if (!text && !translation && !result.audioBase64) {
                diagInfo('pipeline', '本分片无可用字幕（空识别）');
                return;
              }
              await opts.output(
                { text, translation },
                opts.mode,
                {
                  audioBase64: result.audioBase64,
                  mimeType: result.mimeType,
                },
              );
            } catch (e) {
              if (stopped) return;
              const msg =
                e instanceof StageError
                  ? e.message
                  : e instanceof Error
                    ? e.message
                    : String(e);
              fail(msg);
            }
          })();
        };

        try {
          recorder.start();
          window.setTimeout(() => {
            if (recorder && recorder.state === 'recording') recorder.stop();
            if (!stopped) timer = window.setTimeout(pump, 160);
          }, chunkMs);
        } catch {
          fail('录音启动失败', 'capture');
        }
      };

      void ctx.resume();
      pump();
    }
  } catch {
    fail(
      '无法采集视频音频（可能受 DRM/跨域限制）。请播放视频后重试，或换非嵌入页',
      'capture',
    );
  }

  return {
    stop() {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      try {
        if (recorder && recorder.state === 'recording') recorder.stop();
      } catch {
        /* ignore */
      }
      try {
        processor?.disconnect();
        streamSource?.disconnect();
        elementSource?.disconnect();
        void ctx?.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Skip tiny trackers / ads; keep real players (YouTube, Bilibili, Vimeo, etc.). */
export function isWatchableVideo(v: HTMLVideoElement): boolean {
  if (!v || v.tagName !== 'VIDEO') return false;
  const rect = v.getBoundingClientRect();
  const w = Math.max(rect.width, v.clientWidth || 0, v.videoWidth || 0);
  const h = Math.max(rect.height, v.clientHeight || 0, v.videoHeight || 0);
  // Allow not-yet-laid-out players if they declare size / already have media.
  const declaredW = Number(v.getAttribute('width')) || 0;
  const declaredH = Number(v.getAttribute('height')) || 0;
  const effW = Math.max(w, declaredW);
  const effH = Math.max(h, declaredH);
  if (effW > 0 && effH > 0 && (effW < 160 || effH < 90)) return false;
  const style = window.getComputedStyle(v);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return true;
}

export function listWatchableVideos(
  doc: Document = document,
): HTMLVideoElement[] {
  return Array.from(doc.querySelectorAll('video')).filter(isWatchableVideo);
}

export function pageHasWatchableVideo(doc: Document = document): boolean {
  return listWatchableVideos(doc).length > 0;
}

export function findPrimaryVideo(doc: Document = document): HTMLVideoElement | null {
  const videos = listWatchableVideos(doc);
  if (!videos.length) return null;
  const playing = videos.find((v) => !v.paused && !v.ended && v.readyState >= 2);
  if (playing) return playing;
  // Prefer the largest visible player.
  return videos
    .slice()
    .sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return br.width * br.height - ar.width * ar.height;
    })[0] ?? null;
}
