import { base64ToBytes, bytesToBase64, joinBase64Chunks } from '../base64';
import { diagError, diagInfo, diagWarn, StageError } from '../diag';
import { pcm16MonoToWav } from '../pcm-wav';
import { buildWsAuthUrl, mapIflytekAuthError, type IflytekCreds } from './auth';

/** Official path from 同声传译 API docs. */
const HOST = 'ws-api.xf-yun.com';
const PATH = '/v1/private/simult_interpretation';

const FRAME_BYTES = 1280;

export type SimultResult = {
  text: string;
  translation: string;
  audioBase64?: string;
  mimeType?: string;
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function decodeB64Json<T>(textB64: string | undefined): T | null {
  if (!textB64) return null;
  try {
    const raw = atob(textB64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

function recognitionWords(payload: {
  ws?: Array<{ cw?: Array<{ w?: string }> }>;
}): string {
  if (!payload.ws) return '';
  return payload.ws
    .map((w) => (w.cw ?? []).map((c) => c.w ?? '').join(''))
    .join('');
}

/** Apply IST pgs apd/rpl so partial results do not scramble the source line. */
function mergeRecognition(
  prev: string,
  payload: {
    ws?: Array<{ cw?: Array<{ w?: string }> }>;
    pgs?: string;
    rg?: number[];
  },
): string {
  const piece = recognitionWords(payload);
  if (!piece) return prev;
  const pgs = (payload.pgs ?? '').toLowerCase();
  if (pgs === 'apd') return `${prev}${piece}`;
  if (pgs === 'rpl' && Array.isArray(payload.rg) && payload.rg.length >= 2) {
    // rg is sentence index range in IST; for chunked SI we treat rpl as replace-all.
    return piece;
  }
  // Default / missing pgs: latest snapshot replaces (common for short chunks).
  return piece;
}

/**
 * One PCM16LE@16k chunk → recognition + translation (+ optional TTS audio).
 * Uses control-console「同声传译」quota.
 */
export async function iflytekSimultChunk(
  creds: IflytekCreds,
  audioBase64: string,
  mimeType: string,
  opts: { targetLang?: 'zh' | 'en'; wantAudio?: boolean },
): Promise<SimultResult> {
  const mime = mimeType.toLowerCase();
  if (!mime.includes('pcm') && !mime.includes('wav') && !mime.includes('raw')) {
    throw new StageError('simult', '需要 PCM 音频；请重新开启同传');
  }
  const pcm = b64ToBytes(audioBase64);
  if (!pcm.length) {
    return { text: '', translation: '' };
  }

  // targetLang = translation target. Chinese video → target en → from=cn.
  const toZh = (opts.targetLang ?? 'en') !== 'en';
  const from = toZh ? 'en' : 'cn';
  const to = toZh ? 'cn' : 'en';
  // Official SI voices: Chinese x2_xiaoguo · English x2_john (see 同声传译 API).
  const vcn = toZh ? 'x2_xiaoguo' : 'x2_john';
  // Always bilingual ASR (1). language_type=3 (EN-only) mishears Chinese as
  // Latin garbage and breaks dynamic zh↔en switching.
  const languageType = 1;
  const wantAudio = !!opts.wantAudio;
  // Docs demo uses raw PCM for TTS (cn→en). lame works for some zh voices but
  // English playback was missing when we forced lame + audio/mpeg.
  const ttsEncodingReq = 'raw' as const;

  diagInfo('simult', `连接 ${HOST}${PATH}`, {
    from,
    to,
    languageType,
    vcn,
    wantAudio,
    ttsEncoding: ttsEncodingReq,
    pcmBytes: pcm.length,
    appId: creds.appId,
  });
  // Official Python demo includes serviceId in the query string.
  const url = await buildWsAuthUrl({
    host: HOST,
    path: PATH,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    extraQuery: { serviceId: 'simult_interpretation' },
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let srcText = '';
    let translation = '';
    const audioParts: string[] = [];
    let ttsEncoding = ttsEncodingReq;
    let settled = false;
    let seq = 0;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else {
        const text = srcText.trim();
        const translationOut = translation.trim() || text;
        if (!audioParts.length) {
          if (wantAudio && (text || translationOut)) {
            diagWarn('simult', '译文有文本但无合成音频', { from, to, vcn });
          }
          resolve({ text, translation: translationOut });
          return;
        }
        const joined = joinBase64Chunks(audioParts);
        const enc = (ttsEncoding || ttsEncodingReq).toLowerCase();
        if (enc === 'lame' || enc === 'mp3') {
          resolve({
            text,
            translation: translationOut,
            audioBase64: joined,
            mimeType: 'audio/mpeg',
          });
          return;
        }
        // raw PCM16LE @ 16k → WAV so <audio> can play (esp. cn→en / x2_john).
        const wav = pcm16MonoToWav(base64ToBytes(joined), 16000);
        resolve({
          text,
          translation: translationOut,
          audioBase64: bytesToBase64(wav),
          mimeType: 'audio/wav',
        });
      }
    };

    const sendFrame = (slice: Uint8Array, status: 0 | 1 | 2) => {
      const frame = {
        header: {
          app_id: creds.appId,
          status,
        },
        parameter: {
          ist: {
            accent: 'mandarin',
            domain: 'ist_ed_open',
            language: 'zh_cn',
            language_type: languageType,
            vto: 15000,
            eos: 150000,
          },
          streamtrans: { from, to },
          tts: {
            vcn,
            tts_results: {
              encoding: ttsEncodingReq,
              sample_rate: 16000,
              channels: 1,
              bit_depth: 16,
              frame_size: 0,
            },
          },
        },
        payload: {
          data: {
            audio: slice.length ? bytesToB64(slice) : '',
            encoding: 'raw',
            sample_rate: 16000,
            seq: seq++,
            status,
          },
        },
      };
      ws.send(JSON.stringify(frame));
    };

    ws.onopen = () => {
      try {
        let offset = 0;
        let first = true;
        while (offset < pcm.length) {
          const end = Math.min(offset + FRAME_BYTES, pcm.length);
          const slice = pcm.subarray(offset, end);
          offset = end;
          const last = offset >= pcm.length;
          const status: 0 | 1 | 2 = first ? (last ? 2 : 0) : last ? 2 : 1;
          first = false;
          sendFrame(slice, status);
        }
      } catch (e) {
        finish(e instanceof Error ? e : new Error(String(e)));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          header?: { code?: number; message?: string; status?: number };
          payload?: {
            recognition_results?: { text?: string };
            streamtrans_results?: { text?: string };
            tts_results?: { audio?: string; encoding?: string };
          };
        };
        const code = msg.header?.code ?? 0;
        if (code !== 0) {
          const reason = mapIflytekAuthError(
            msg.header?.message || `同声传译错误码 ${code}`,
            'simult',
          );
          diagError('simult', reason, { code });
          finish(new StageError('simult', reason));
          return;
        }

        const rec = decodeB64Json<{
          ws?: Array<{ cw?: Array<{ w?: string }> }>;
          src?: string;
          pgs?: string;
          rg?: number[];
        }>(msg.payload?.recognition_results?.text);
        if (rec) {
          srcText = mergeRecognition(srcText, rec);
        }

        const tr = decodeB64Json<{ src?: string; dst?: string; is_final?: number }>(
          msg.payload?.streamtrans_results?.text,
        );
        if (tr?.dst) {
          translation = tr.dst;
          if (tr.src) srcText = tr.src;
        }

        const tts = msg.payload?.tts_results;
        if (tts?.encoding) ttsEncoding = tts.encoding;
        if (wantAudio && tts?.audio) audioParts.push(tts.audio);

        if (msg.header?.status === 2) finish();
      } catch (e) {
        finish(
          e instanceof StageError
            ? e
            : new StageError('simult', e instanceof Error ? e.message : String(e)),
        );
      }
    };

    ws.onerror = () => {
      diagError('simult', 'WebSocket 连接失败', { host: HOST });
      finish(new StageError('simult', `WebSocket 连接失败（${HOST}）`));
    };
    ws.onclose = () => {
      if (!settled) finish();
    };
    setTimeout(() => {
      diagError('simult', '超时（60s）');
      finish(new StageError('simult', '同声传译超时（60s）'));
    }, 60_000);
  });
}
