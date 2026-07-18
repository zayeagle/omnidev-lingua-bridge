import { diagError, diagInfo, StageError } from '../diag';
import {
  buildHttpAuthHeaders,
  buildQueryAuthUrl,
  mapIflytekAuthError,
  type IflytekCreds,
} from './auth';
import {
  DEFAULT_IFLYTEK_MT,
  getIflytekMtProduct,
  type IflytekMtProduct,
} from './products';

function toItsLang(
  lang: 'zh' | 'en' | 'auto' | string | undefined,
  fallback: 'cn' | 'en',
): string {
  if (lang === 'zh' || lang === 'cn') return 'cn';
  if (lang === 'en') return 'en';
  return fallback;
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function decodeItsNewResult(textB64: string | undefined): string {
  if (!textB64) return '';
  try {
    const raw = atob(textB64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      trans_result?: { dst?: string };
    };
    return (parsed.trans_result?.dst ?? '').trim();
  } catch {
    return '';
  }
}

async function translateItsNew(
  creds: IflytekCreds,
  product: IflytekMtProduct,
  text: string,
  source: string,
  target: string,
): Promise<string> {
  const url = await buildQueryAuthUrl({
    scheme: 'https',
    host: product.host,
    path: product.path,
    method: 'POST',
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
  });

  const body = JSON.stringify({
    header: {
      app_id: creds.appId,
      status: 3,
    },
    parameter: {
      its: {
        from: source,
        to: target,
        result: {},
      },
    },
    payload: {
      input_data: {
        encoding: 'utf8',
        status: 3,
        text: utf8ToBase64(text),
      },
    },
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    diagError('mt', `网络失败：${reason}`, { host: product.host });
    throw new StageError('mt', `网络失败：${reason}`, e);
  }

  const json = (await res.json()) as {
    header?: { code?: number; message?: string };
    payload?: { result?: { text?: string } };
    code?: number;
    message?: string;
  };

  const code = json.header?.code ?? json.code ?? (res.ok ? 0 : res.status);
  const message = json.header?.message || json.message || `翻译失败 (${code})`;
  if (!res.ok || code !== 0) {
    const reason = mapIflytekAuthError(message, 'mt');
    diagError('mt', reason, { httpStatus: res.status, code, product: product.id });
    throw new StageError('mt', reason);
  }
  return decodeItsNewResult(json.payload?.result?.text);
}

async function translateItsV2(
  creds: IflytekCreds,
  product: IflytekMtProduct,
  text: string,
  source: string,
  target: string,
): Promise<string> {
  const body = JSON.stringify({
    common: { app_id: creds.appId },
    business: { from: source, to: target },
    data: { text: utf8ToBase64(text) },
  });

  const headers = await buildHttpAuthHeaders({
    host: product.host,
    requestLine: `POST ${product.path} HTTP/1.1`,
    apiKey: creds.apiKey,
    apiSecret: creds.apiSecret,
    body,
  });

  let res: Response;
  try {
    res = await fetch(`https://${product.host}${product.path}`, {
      method: 'POST',
      headers,
      body,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    diagError('mt', `网络失败：${reason}`, { host: product.host });
    throw new StageError('mt', `网络失败：${reason}`, e);
  }

  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: { result?: { trans_result?: { dst?: string } } };
  };

  const code = json.code ?? (res.ok ? 0 : res.status);
  if (!res.ok || code !== 0) {
    const reason = mapIflytekAuthError(
      json.message || `翻译失败 (${code})`,
      'mt',
    );
    diagError('mt', reason, { httpStatus: res.status, code, product: product.id });
    throw new StageError('mt', reason);
  }
  return (json.data?.result?.trans_result?.dst ?? '').trim();
}

/**
 * Translate texts via selected 机器翻译 product.
 */
export async function iflytekTranslate(
  creds: IflytekCreds,
  texts: string[],
  opts: { sourceLang?: string; targetLang?: string; productId?: string },
): Promise<string[]> {
  const product = getIflytekMtProduct(opts.productId ?? DEFAULT_IFLYTEK_MT);
  const target = toItsLang(opts.targetLang, 'cn');
  // niutrans / its_v2 accept from=auto; 机器翻译（新）更稳妥用显式语种。
  const source =
    opts.sourceLang && opts.sourceLang !== 'auto'
      ? toItsLang(opts.sourceLang, target === 'cn' ? 'en' : 'cn')
      : product.protocol === 'its_v2'
        ? 'auto'
        : target === 'cn'
          ? 'en'
          : 'cn';

  const out: string[] = [];
  for (const text of texts) {
    const trimmed = text.trim();
    if (!trimmed) {
      out.push('');
      continue;
    }

    diagInfo('mt', `请求 ${product.host}${product.path}`, {
      product: product.id,
      protocol: product.protocol,
      from: source,
      to: target,
      chars: trimmed.length,
      appId: creds.appId,
    });

    const dst =
      product.protocol === 'its_v2'
        ? await translateItsV2(creds, product, trimmed, source, target)
        : await translateItsNew(creds, product, trimmed, source, target);

    diagInfo('mt', dst ? `成功 · chars=${dst.length}` : '成功但译文为空', {
      from: source,
      to: target,
    });
    out.push(dst);
  }
  return out;
}
