/** iFlytek HMAC-SHA256 auth helpers (Web Crypto). */

export type IflytekCreds = {
  appId: string;
  apiKey: string;
  apiSecret: string;
};

/** Strip spaces / zero-width chars from console paste. */
export function sanitizeIflytekToken(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export function rfc1123Date(d = new Date()): string {
  // Match email.utils.format_date_time / RFC1123 GMT (browser toUTCString).
  return d.toUTCString();
}

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]!);
  return btoa(bin);
}

export async function hmacSha256Base64(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return bytesToBase64(sig);
}

export async function sha256Base64(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return bytesToBase64(digest);
}

/** Python urllib.urlencode / quote_plus style (spaces as +). */
export function encodeQueryPlus(params: Record<string, string>): string {
  return Object.entries(params)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%20/g, '+')}`,
    )
    .join('&');
}

/**
 * Build URL with authorization / date / host query params (WS or HTTPS).
 * authorization_origin matches official Python demo (spaces after commas).
 */
export async function buildQueryAuthUrl(opts: {
  scheme: 'wss' | 'https';
  host: string;
  path: string;
  apiKey: string;
  apiSecret: string;
  method?: 'GET' | 'POST';
  /** Extra query fields (e.g. serviceId for 同声传译) */
  extraQuery?: Record<string, string>;
}): Promise<string> {
  const date = rfc1123Date();
  const method = opts.method ?? (opts.scheme === 'https' ? 'POST' : 'GET');
  const requestLine = `${method} ${opts.path} HTTP/1.1`;
  const signatureOrigin = `host: ${opts.host}\ndate: ${date}\n${requestLine}`;
  const apiKey = sanitizeIflytekToken(opts.apiKey);
  const apiSecret = sanitizeIflytekToken(opts.apiSecret);
  const signature = await hmacSha256Base64(apiSecret, signatureOrigin);
  // Official demo: api_key="%s", algorithm="%s", headers="%s", signature="%s"
  const authorizationOrigin = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = btoa(authorizationOrigin);
  const q = encodeQueryPlus({
    authorization,
    date,
    host: opts.host,
    ...opts.extraQuery,
  });
  return `${opts.scheme}://${opts.host}${opts.path}?${q}`;
}

/** WebSocket auth URL (GET + wss). */
export async function buildWsAuthUrl(opts: {
  host: string;
  path: string;
  apiKey: string;
  apiSecret: string;
  extraQuery?: Record<string, string>;
}): Promise<string> {
  return buildQueryAuthUrl({ ...opts, scheme: 'wss', method: 'GET' });
}

/** HTTP Authorization header (no base64 wrap) + Digest for ITS-style APIs. */
export async function buildHttpAuthHeaders(opts: {
  host: string;
  requestLine: string;
  apiKey: string;
  apiSecret: string;
  body: string;
}): Promise<Record<string, string>> {
  const date = rfc1123Date();
  const digest = `SHA-256=${await sha256Base64(opts.body)}`;
  const signatureOrigin = `host: ${opts.host}\ndate: ${date}\n${opts.requestLine}\ndigest: ${digest}`;
  const apiKey = sanitizeIflytekToken(opts.apiKey);
  const apiSecret = sanitizeIflytekToken(opts.apiSecret);
  const signature = await hmacSha256Base64(apiSecret, signatureOrigin);
  const authorization = `api_key="${apiKey}", algorithm="hmac-sha256", headers="host date request-line digest", signature="${signature}"`;
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json,version=1.0',
    Host: opts.host,
    Date: date,
    Digest: digest,
    Authorization: authorization,
  };
}

/** Exported for UNIT: assemble WS signature origin string. */
export function wsSignatureOrigin(host: string, date: string, path: string): string {
  return `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
}

export type IflytekAuthProduct = 'simult' | 'stt' | 'tts' | 'mt';

function authProductHint(product?: IflytekAuthProduct): string {
  switch (product) {
    case 'simult':
      return '「同声传译」';
    case 'stt':
      return '「多语种识别 / 听写」';
    case 'tts':
      return '「超拟人合成」';
    case 'mt':
      return '「机器翻译」';
    default:
      return '当前线路对应产品（组合线：听写/翻译/合成；一体线：同声传译）';
  }
}

export function mapIflytekAuthError(
  message: string,
  product?: IflytekAuthProduct,
): string {
  const page = authProductHint(product);
  if (/HMAC signature does not match/i.test(message)) {
    return `讯飞鉴权失败：请打开控制台${page}页重新「复制」APIKey 与 APISecret（勿对调、勿混用 APIPassword），保存后重载扩展并刷新网页`;
  }
  if (/HMAC signature cannot be verified/i.test(message)) {
    return `讯飞鉴权参数有误：请检查系统时间，并确认 APIKey 来自控制台${page}页且完整`;
  }
  return message;
}
