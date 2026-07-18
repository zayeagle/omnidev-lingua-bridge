import type { AiConfig } from './storage';
import {
  EXPLAIN_SYSTEM_PROMPT,
  parseExplainPayload,
  type ExplainResult,
} from './vocab-explain';

const TIMEOUT_MS = 45_000;

export class AiClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiClientError';
  }
}

/** Never include secrets in thrown/returned messages. */
export function sanitizeErrorMessage(
  raw: string,
  ...secrets: Array<string | undefined | null>
): string {
  let msg = raw;
  for (const secret of secrets) {
    const token = (secret ?? '').trim();
    if (token && msg.includes(token)) {
      msg = msg.split(token).join('[REDACTED]');
    }
  }
  return msg;
}

export function mapHttpError(status: number, bodyText: string): AiClientError {
  if (status === 401 || status === 403) {
    return new AiClientError('检查 API Key 是否有效', status);
  }
  if (status === 429) {
    return new AiClientError('请求过于频繁，请稍后重试', status);
  }
  if (status >= 500) {
    return new AiClientError('AI 服务暂时不可用', status);
  }
  const snippet = bodyText.slice(0, 120).replace(/\s+/g, ' ');
  return new AiClientError(snippet || `请求失败 (${status})`, status);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1): Promise<T> {
  let last: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable =
        e instanceof AiClientError
          ? (e.status !== undefined && e.status >= 500) || e.status === undefined
          : true;
      if (i === retries || !retryable) throw e;
    }
  }
  throw last;
}

function authHeaders(config: AiConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function translateTexts(
  config: AiConfig,
  texts: string[],
  opts: { sourceLang?: string; targetLang?: string } = {},
): Promise<string[]> {
  const cleaned = texts.map((t) => t.trim());
  if (cleaned.every((t) => !t)) {
    return texts.map(() => '');
  }

  const source = opts.sourceLang ?? 'auto';
  const target = opts.targetLang ?? 'zh';
  const nonEmpty = cleaned
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.length > 0);

  const payload = {
    model: config.chatModel,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content:
          'You are a translation engine. Translate each line. Detect Chinese/English automatically when source is auto. Return ONLY a JSON array of strings, same length/order as input. No markdown.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          source,
          target,
          lines: nonEmpty.map((x) => x.t),
        }),
      },
    ],
  };

  const run = async () => {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AiClientError(
        sanitizeErrorMessage(msg.includes('abort') ? '网络超时' : `网络错误: ${msg}`, config.apiKey),
      );
    }

    const bodyText = await res.text();
    if (!res.ok) {
      throw mapHttpError(res.status, sanitizeErrorMessage(bodyText, config.apiKey));
    }

    let parsed: { choices?: Array<{ message?: { content?: string } }> };
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      throw new AiClientError('AI 返回无法解析');
    }

    const content = parsed.choices?.[0]?.message?.content?.trim() ?? '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new AiClientError('AI 未返回译文数组');
    }

    let lines: unknown;
    try {
      lines = JSON.parse(jsonMatch[0]);
    } catch {
      throw new AiClientError('译文 JSON 无效');
    }
    if (!Array.isArray(lines) || lines.length !== nonEmpty.length) {
      throw new AiClientError('译文条数不匹配');
    }

    const out = texts.map(() => '');
    nonEmpty.forEach((item, idx) => {
      out[item.i] = String(lines[idx] ?? '');
    });
    return out;
  };

  return withRetry(run, 1);
}

/** Translate selection + keyword glosses (JSON). */
export async function explainSelection(
  config: AiConfig,
  text: string,
  opts: { targetLang?: 'zh' | 'en' } = {},
): Promise<ExplainResult> {
  const source = text.trim();
  if (!source) {
    return { translation: '', terms: [] };
  }
  const target = opts.targetLang ?? 'zh';
  const payload = {
    model: config.chatModel,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: EXPLAIN_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: JSON.stringify({
          targetLang: target,
          instruction:
            target === 'zh'
              ? '英译中：全文译成中文。每个关键词的 meaning 必须是中文释义（可含词性如「形容词。」），禁止用英文写释义。phonetic 用 IPA；example 可用英文原句并附中文括号。'
              : '中译英：全文译成英文。每个关键词的 meaning 必须是英文释义，禁止用中文写释义。汉语词给 pinyin；example 可用中文原句并附英文括号。',
          text: source,
        }),
      },
    ],
  };

  const run = async () => {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AiClientError(
        sanitizeErrorMessage(msg.includes('abort') ? '网络超时' : `网络错误: ${msg}`, config.apiKey),
      );
    }
    const bodyText = await res.text();
    if (!res.ok) {
      throw mapHttpError(res.status, sanitizeErrorMessage(bodyText, config.apiKey));
    }
    let parsed: { choices?: Array<{ message?: { content?: string } }> };
    try {
      parsed = JSON.parse(bodyText) as typeof parsed;
    } catch {
      throw new AiClientError('AI 返回无法解析');
    }
    const content = parsed.choices?.[0]?.message?.content?.trim() ?? '';
    const result = parseExplainPayload(content);
    if (!result) throw new AiClientError('AI 未返回讲解 JSON');
    return result;
  };

  return withRetry(run, 1);
}

export async function transcribeAudio(
  config: AiConfig,
  audioBase64: string,
  mimeType: string,
): Promise<string> {
  if (!audioBase64.trim()) {
    return '';
  }

  const run = async () => {
    const binary = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([binary], { type: mimeType || 'audio/webm' });
    const form = new FormData();
    form.append('file', blob, 'chunk.webm');
    form.append('model', config.sttModel);

    let res: Response;
    try {
      res = await fetchWithTimeout(`${config.baseUrl}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}` },
        body: form,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AiClientError(
        sanitizeErrorMessage(msg.includes('abort') ? '网络超时' : `网络错误: ${msg}`, config.apiKey),
      );
    }

    const bodyText = await res.text();
    if (!res.ok) {
      throw mapHttpError(res.status, sanitizeErrorMessage(bodyText, config.apiKey));
    }

    try {
      const parsed = JSON.parse(bodyText) as { text?: string };
      return (parsed.text ?? '').trim();
    } catch {
      throw new AiClientError('STT 返回无法解析');
    }
  };

  return withRetry(run, 1);
}

/** OpenAI-compatible TTS → base64 audio (mp3). */
export async function synthesizeSpeech(
  config: AiConfig,
  text: string,
  opts: { voice?: string } = {},
): Promise<{ audioBase64: string; mimeType: string }> {
  const input = text.trim();
  if (!input) {
    return { audioBase64: '', mimeType: 'audio/mpeg' };
  }

  const run = async () => {
    let res: Response;
    try {
      res = await fetchWithTimeout(`${config.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: authHeaders(config),
        body: JSON.stringify({
          model: config.ttsModel,
          input,
          voice: opts.voice ?? 'alloy',
          response_format: 'mp3',
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new AiClientError(
        sanitizeErrorMessage(msg.includes('abort') ? '网络超时' : `网络错误: ${msg}`, config.apiKey),
      );
    }

    if (!res.ok) {
      const bodyText = await res.text();
      throw mapHttpError(res.status, sanitizeErrorMessage(bodyText, config.apiKey));
    }

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]!);
    }
    return { audioBase64: btoa(binary), mimeType: 'audio/mpeg' };
  };

  return withRetry(run, 1);
}
