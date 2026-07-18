import { diagError, diagInfo, StageError } from '../diag';
import { buildWsAuthUrl, mapIflytekAuthError, type IflytekCreds } from './auth';
import {
  DEFAULT_IFLYTEK_STT,
  getIflytekSttProduct,
  type IflytekSttProduct,
} from './products';

/** Max audio per WS session (iFlytek limit). */
export const IFLYTEK_STT_MAX_MS = 60_000;
const FRAME_BYTES = 1280; // ~40ms @ 16k 16bit mono

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeSlmResultPayload(textB64: string | undefined): string {
  if (!textB64) return '';
  try {
    const raw = atob(textB64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const jsonText = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(jsonText) as {
      ws?: Array<{ cw?: Array<{ w?: string }> }>;
    };
    if (!parsed.ws) return jsonText;
    return parsed.ws
      .map((w) => (w.cw ?? []).map((c) => c.w ?? '').join(''))
      .join('');
  } catch {
    return '';
  }
}

function decodeIatV2Result(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const r = result as { ws?: Array<{ cw?: Array<{ w?: string }> }> };
  if (!r.ws) return '';
  return r.ws
    .map((w) => (w.cw ?? []).map((c) => c.w ?? '').join(''))
    .join('');
}

function pcmSliceToB64(slice: Uint8Array): string {
  if (!slice.length) return '';
  let bin = '';
  for (let i = 0; i < slice.length; i++) bin += String.fromCharCode(slice[i]!);
  return btoa(bin);
}

async function transcribeSlm(
  creds: IflytekCreds,
  product: IflytekSttProduct,
  pcm: Uint8Array,
): Promise<string> {
  diagInfo('stt', `连接 ${product.host}${product.path}`, {
    product: product.id,
    pcmBytes: pcm.length,
    appId: creds.appId,
  });
  const url = await buildWsAuthUrl({
    host: product.host,
    path: product.path,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let text = '';
    let seq = 0;
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(text.trim());
    };

    const sendFrame = (slice: Uint8Array, status: 0 | 1 | 2) => {
      const frame = {
        header: {
          app_id: creds.appId,
          status,
        },
        parameter: {
          iat: {
            domain: product.domain,
            language: product.language,
            accent: product.accent,
            eos: 600,
            vinfo: 0,
            result: {
              encoding: 'utf8',
              compress: 'raw',
              format: 'json',
            },
          },
        },
        payload: {
          audio: {
            encoding: 'raw',
            sample_rate: 16000,
            channels: 1,
            bit_depth: 16,
            status,
            seq: seq++,
            audio: pcmSliceToB64(slice),
            frame_size: 0,
          },
        },
      };
      ws.send(JSON.stringify(frame));
    };

    ws.onopen = () => {
      try {
        if (!pcm.length) {
          sendFrame(new Uint8Array(0), 2);
          return;
        }
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
          payload?: { result?: { text?: string } };
        };
        const code = msg.header?.code ?? 0;
        if (code !== 0) {
          const reason = mapIflytekAuthError(
            msg.header?.message || `识别错误码 ${code}`,
            'stt',
          );
          diagError('stt', reason, { code, product: product.id });
          finish(new StageError('stt', reason));
          return;
        }
        text += decodeSlmResultPayload(msg.payload?.result?.text);
        if (msg.header?.status === 2) finish();
      } catch (e) {
        finish(
          e instanceof StageError
            ? e
            : new StageError('stt', e instanceof Error ? e.message : String(e)),
        );
      }
    };

    ws.onerror = () => {
      diagError('stt', 'WebSocket 连接失败', { host: product.host });
      finish(new StageError('stt', `WebSocket 连接失败（${product.host}）`));
    };
    ws.onclose = () => {
      if (!settled) finish();
    };

    setTimeout(() => {
      diagError('stt', '超时（45s）');
      finish(new StageError('stt', '识别超时（45s）'));
    }, 45_000);
  });
}

async function transcribeIatV2(
  creds: IflytekCreds,
  product: IflytekSttProduct,
  pcm: Uint8Array,
): Promise<string> {
  diagInfo('stt', `连接 ${product.host}${product.path}`, {
    product: product.id,
    pcmBytes: pcm.length,
    appId: creds.appId,
  });
  const url = await buildWsAuthUrl({
    host: product.host,
    path: product.path,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
  });

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let text = '';
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(text.trim());
    };

    const sendFrame = (slice: Uint8Array, status: 0 | 1 | 2) => {
      const frame =
        status === 0
          ? {
              common: { app_id: creds.appId },
              business: {
                language: product.language,
                domain: product.domain,
                accent: product.accent,
                vad_eos: 2000,
                dwa: 'wpgs',
              },
              data: {
                status,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: pcmSliceToB64(slice),
              },
            }
          : {
              data: {
                status,
                format: 'audio/L16;rate=16000',
                encoding: 'raw',
                audio: pcmSliceToB64(slice),
              },
            };
      ws.send(JSON.stringify(frame));
    };

    ws.onopen = () => {
      try {
        if (!pcm.length) {
          sendFrame(new Uint8Array(0), 2);
          return;
        }
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
          code?: number;
          message?: string;
          data?: { status?: number; result?: unknown };
        };
        const code = msg.code ?? 0;
        if (code !== 0) {
          const reason = mapIflytekAuthError(
            msg.message || `识别错误码 ${code}`,
            'stt',
          );
          diagError('stt', reason, { code, product: product.id });
          finish(new StageError('stt', reason));
          return;
        }
        text += decodeIatV2Result(msg.data?.result);
        if (msg.data?.status === 2) finish();
      } catch (e) {
        finish(
          e instanceof StageError
            ? e
            : new StageError('stt', e instanceof Error ? e.message : String(e)),
        );
      }
    };

    ws.onerror = () => {
      diagError('stt', 'WebSocket 连接失败', { host: product.host });
      finish(new StageError('stt', `WebSocket 连接失败（${product.host}）`));
    };
    ws.onclose = () => {
      if (!settled) finish();
    };

    setTimeout(() => {
      diagError('stt', '超时（45s）');
      finish(new StageError('stt', '识别超时（45s）'));
    }, 45_000);
  });
}

/**
 * Recognize one PCM16LE 16k mono chunk (base64). webm is rejected — use content PCM path.
 */
export async function iflytekTranscribe(
  creds: IflytekCreds,
  audioBase64: string,
  mimeType: string,
  productId: string = DEFAULT_IFLYTEK_STT,
): Promise<string> {
  const mime = mimeType.toLowerCase();
  if (!mime.includes('pcm') && !mime.includes('wav') && !mime.includes('raw')) {
    throw new StageError(
      'stt',
      '需要 PCM 音频；请重新开启同传（已自动改用 PCM 采集）',
    );
  }
  const pcm = b64ToBytes(audioBase64);
  if (!pcm.length) {
    diagInfo('stt', '空音频，跳过识别');
    return '';
  }

  const product = getIflytekSttProduct(productId);
  if (product.protocol === 'iat_v2') {
    return transcribeIatV2(creds, product, pcm);
  }
  return transcribeSlm(creds, product, pcm);
}
