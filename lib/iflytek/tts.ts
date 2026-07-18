import { joinBase64Chunks } from '../base64';
import { diagError, diagInfo, StageError } from '../diag';
import { buildWsAuthUrl, mapIflytekAuthError, type IflytekCreds } from './auth';
import {
  DEFAULT_IFLYTEK_TTS,
  getIflytekTtsProduct,
  type IflytekTtsProduct,
} from './products';

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

async function synthesizeOral(
  creds: IflytekCreds,
  product: IflytekTtsProduct,
  text: string,
  vcn: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  diagInfo('tts', `连接 ${product.host}${product.path}`, {
    product: product.id,
    chars: text.length,
    vcn,
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
    const parts: string[] = [];
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
      else {
        let audioBase64 = '';
        try {
          audioBase64 = joinBase64Chunks(parts);
        } catch (e) {
          reject(
            new StageError(
              'tts',
              e instanceof Error ? e.message : '合成音频 base64 无效',
              e,
            ),
          );
          return;
        }
        if (!audioBase64) {
          reject(
            new StageError(
              'tts',
              '合成返回空音频：请确认控制台已开通「超拟人合成」及发音人权限',
            ),
          );
          return;
        }
        diagInfo('tts', `成功 · chunks=${parts.length}`, {
          b64Len: audioBase64.length,
        });
        resolve({ audioBase64, mimeType: 'audio/mpeg' });
      }
    };

    ws.onopen = () => {
      const frame = {
        header: {
          app_id: creds.appId,
          status: 2,
        },
        parameter: {
          oral: { oral_level: 'mid' },
          tts: {
            vcn,
            speed: 50,
            volume: 50,
            pitch: 50,
            bgs: 0,
            audio: {
              encoding: 'lame',
              sample_rate: 24000,
              channels: 1,
              bit_depth: 16,
              frame_size: 0,
            },
          },
        },
        payload: {
          text: {
            encoding: 'utf8',
            compress: 'raw',
            format: 'plain',
            status: 2,
            seq: 0,
            text: utf8ToBase64(text),
          },
        },
      };
      ws.send(JSON.stringify(frame));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          header?: { code?: number; message?: string; status?: number };
          payload?: { audio?: { audio?: string } };
        };
        const code = msg.header?.code ?? 0;
        if (code !== 0) {
          const reason = mapIflytekAuthError(
            msg.header?.message || `合成错误码 ${code}`,
            'tts',
          );
          diagError('tts', reason, { code, product: product.id });
          finish(new StageError('tts', reason));
          return;
        }
        const chunk = msg.payload?.audio?.audio;
        if (chunk) parts.push(chunk);
        if (msg.header?.status === 2) finish();
      } catch (e) {
        finish(
          e instanceof StageError
            ? e
            : new StageError('tts', e instanceof Error ? e.message : String(e)),
        );
      }
    };

    ws.onerror = () => {
      diagError('tts', 'WebSocket 连接失败', { host: product.host });
      finish(new StageError('tts', `WebSocket 连接失败（${product.host}）`));
    };
    ws.onclose = () => {
      if (!settled) finish();
    };
    setTimeout(() => {
      diagError('tts', '超时（45s）');
      finish(new StageError('tts', '合成超时（45s）'));
    }, 45_000);
  });
}

async function synthesizeOnlineV2(
  creds: IflytekCreds,
  product: IflytekTtsProduct,
  text: string,
  vcn: string,
): Promise<{ audioBase64: string; mimeType: string }> {
  diagInfo('tts', `连接 ${product.host}${product.path}`, {
    product: product.id,
    chars: text.length,
    vcn,
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
    const parts: string[] = [];
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
      else {
        let audioBase64 = '';
        try {
          audioBase64 = joinBase64Chunks(parts);
        } catch (e) {
          reject(
            new StageError(
              'tts',
              e instanceof Error ? e.message : '合成音频 base64 无效',
              e,
            ),
          );
          return;
        }
        if (!audioBase64) {
          reject(
            new StageError(
              'tts',
              '合成返回空音频：请确认控制台已开通「在线语音合成」及发音人权限',
            ),
          );
          return;
        }
        diagInfo('tts', `成功 · chunks=${parts.length}`, {
          b64Len: audioBase64.length,
        });
        resolve({ audioBase64, mimeType: 'audio/mpeg' });
      }
    };

    ws.onopen = () => {
      const frame = {
        common: { app_id: creds.appId },
        business: {
          aue: 'lame',
          sfl: 1,
          vcn,
          speed: 50,
          volume: 50,
          pitch: 50,
          tte: 'UTF8',
        },
        data: {
          status: 2,
          text: utf8ToBase64(text),
        },
      };
      ws.send(JSON.stringify(frame));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as {
          code?: number;
          message?: string;
          data?: { audio?: string; status?: number };
        };
        const code = msg.code ?? 0;
        if (code !== 0) {
          const reason = mapIflytekAuthError(
            msg.message || `合成错误码 ${code}`,
            'tts',
          );
          diagError('tts', reason, { code, product: product.id });
          finish(new StageError('tts', reason));
          return;
        }
        if (msg.data?.audio) parts.push(msg.data.audio);
        if (msg.data?.status === 2) finish();
      } catch (e) {
        finish(
          e instanceof StageError
            ? e
            : new StageError('tts', e instanceof Error ? e.message : String(e)),
        );
      }
    };

    ws.onerror = () => {
      diagError('tts', 'WebSocket 连接失败', { host: product.host });
      finish(new StageError('tts', `WebSocket 连接失败（${product.host}）`));
    };
    ws.onclose = () => {
      if (!settled) finish();
    };
    setTimeout(() => {
      diagError('tts', '超时（45s）');
      finish(new StageError('tts', '合成超时（45s）'));
    }, 45_000);
  });
}

export async function iflytekSynthesize(
  creds: IflytekCreds,
  text: string,
  opts?: { vcn?: string; productId?: string },
): Promise<{ audioBase64: string; mimeType: string }> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { audioBase64: '', mimeType: 'audio/mpeg' };
  }

  const product = getIflytekTtsProduct(opts?.productId ?? DEFAULT_IFLYTEK_TTS);
  const vcn = opts?.vcn || product.defaultVcn;
  if (product.protocol === 'online_v2') {
    return synthesizeOnlineV2(creds, product, trimmed, vcn);
  }
  return synthesizeOral(creds, product, trimmed, vcn);
}
