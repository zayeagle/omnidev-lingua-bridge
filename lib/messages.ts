/** Typed runtime messages between content/popup and background. */

export type TranslateRequest = {
  type: 'ai.translate';
  texts: string[];
  sourceLang?: 'auto' | 'zh' | 'en';
  targetLang?: 'zh' | 'en';
};

export type ExplainRequest = {
  type: 'ai.explain';
  text: string;
  targetLang?: 'zh' | 'en';
};

export type TranscribeRequest = {
  type: 'ai.transcribe';
  audioBase64: string;
  mimeType: string;
  targetLang?: 'zh' | 'en';
  /** Content-driven: request SI/TTS audio when voice mode is on. */
  wantAudio?: boolean;
};

export type SpeakRequest = {
  type: 'ai.speak';
  text: string;
  voice?: string;
};

export type ExtensionRequest =
  | TranslateRequest
  | ExplainRequest
  | TranscribeRequest
  | SpeakRequest;

export type SecurityUnlockRequest = {
  type: 'security.unlock';
  passphrase: string;
};

export type SecurityLockRequest = {
  type: 'security.lock';
};

export type SecurityStatusRequest = {
  type: 'security.status';
};

export type SecurityRequest =
  | SecurityUnlockRequest
  | SecurityLockRequest
  | SecurityStatusRequest;

/** Popup → content: start/stop video SI on this tab. */
export type PageSpeechRequest = {
  type: 'page.speech';
  on: boolean;
};

/** Popup → content: apply 同传样式 immediately (do not wait for storage watch). */
export type PageSpeechModeRequest = {
  type: 'page.setSpeechMode';
  mode: 'caption' | 'voice';
};

export type PageSpeechResponse =
  | { ok: true; speechOnThisPage: boolean }
  | { ok: false; speechOnThisPage: boolean; error: string };

/** Content → popup: SI on/off changed on the page (e.g. caption ×). */
export type PageSpeechStateEvent = {
  type: 'page.speechState';
  speechOnThisPage: boolean;
  speechMode: 'caption' | 'voice';
};

/** Popup → content: query live SI / page status. */
export type PageStatusRequest = {
  type: 'page.status';
};

export type PageStatusResponse =
  | {
      ok: true;
      enabled: boolean;
      speechOnThisPage: boolean;
      speechMode: 'caption' | 'voice';
      hasApiKey: boolean;
      hasVideo: boolean;
      providerId: string;
      iflytekPipeline: 'composed' | 'simult';
    }
  | { ok: false; error: string };

export function isPageSpeechRequest(msg: unknown): msg is PageSpeechRequest {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { type?: unknown }).type === 'page.speech' &&
    typeof (msg as { on?: unknown }).on === 'boolean'
  );
}

export function isPageSpeechModeRequest(msg: unknown): msg is PageSpeechModeRequest {
  const mode = (msg as { mode?: unknown })?.mode;
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { type?: unknown }).type === 'page.setSpeechMode' &&
    (mode === 'caption' || mode === 'voice')
  );
}

export function isPageStatusRequest(msg: unknown): msg is PageStatusRequest {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { type?: unknown }).type === 'page.status'
  );
}

export function isPageSpeechStateEvent(msg: unknown): msg is PageSpeechStateEvent {
  return (
    !!msg &&
    typeof msg === 'object' &&
    (msg as { type?: unknown }).type === 'page.speechState' &&
    typeof (msg as { speechOnThisPage?: unknown }).speechOnThisPage === 'boolean'
  );
}

export type TranslateResponse =
  | { ok: true; translations: string[] }
  | { ok: false; error: string };

export type ExplainResponse =
  | {
      ok: true;
      translation: string;
      terms: Array<{
        term: string;
        phonetic?: string;
        meaning: string;
        example?: string;
        /** @deprecated legacy field */
        gloss?: string;
      }>;
    }
  | { ok: false; error: string };

export type TranscribeResponse =
  | {
      ok: true;
      text: string;
      translation?: string;
      /** When provider returns speech in the same call (e.g. iFlytek 同声传译) */
      audioBase64?: string;
      mimeType?: string;
    }
  | { ok: false; error: string };

export type SpeakResponse =
  | { ok: true; audioBase64: string; mimeType: string }
  | { ok: false; error: string };

export type ExtensionResponse =
  | TranslateResponse
  | ExplainResponse
  | TranscribeResponse
  | SpeakResponse;

export function isExtensionRequest(msg: unknown): msg is ExtensionRequest {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  return (
    type === 'ai.translate' ||
    type === 'ai.explain' ||
    type === 'ai.transcribe' ||
    type === 'ai.speak'
  );
}

export function isSecurityRequest(msg: unknown): msg is SecurityRequest {
  if (!msg || typeof msg !== 'object') return false;
  const type = (msg as { type?: unknown }).type;
  return type === 'security.unlock' || type === 'security.lock' || type === 'security.status';
}

/** Caps to limit SW memory / provider cost abuse from content. */
export const MAX_TRANSLATE_BATCH = 40;
export const MAX_TEXT_CHARS = 8_000;
export const MAX_AUDIO_B64_CHARS = 2_000_000;
export const MAX_PASSPHRASE_CHARS = 256;

/** Returns error message or null if OK. */
export function validateExtensionRequest(msg: ExtensionRequest): string | null {
  if (msg.type === 'ai.translate') {
    if (!Array.isArray(msg.texts)) return 'texts 无效';
    if (msg.texts.length > MAX_TRANSLATE_BATCH) {
      return `单次翻译最多 ${MAX_TRANSLATE_BATCH} 条`;
    }
    for (const t of msg.texts) {
      if (typeof t !== 'string') return 'texts 无效';
      if (t.length > MAX_TEXT_CHARS) {
        return `单条文本过长（>${MAX_TEXT_CHARS}）`;
      }
    }
    return null;
  }
  if (msg.type === 'ai.explain' || msg.type === 'ai.speak') {
    if (typeof msg.text !== 'string') return 'text 无效';
    if (msg.text.length > MAX_TEXT_CHARS) {
      return `文本过长（>${MAX_TEXT_CHARS}）`;
    }
    return null;
  }
  if (msg.type === 'ai.transcribe') {
    if (typeof msg.audioBase64 !== 'string') return 'audio 无效';
    if (msg.audioBase64.length > MAX_AUDIO_B64_CHARS) {
      return '音频分片过大，请重试同传';
    }
    if (typeof msg.mimeType !== 'string' || !msg.mimeType.trim()) {
      return 'mimeType 无效';
    }
    return null;
  }
  return null;
}

export function validateSecurityRequest(msg: SecurityRequest): string | null {
  if (msg.type === 'security.unlock') {
    if (typeof msg.passphrase !== 'string') return '口令无效';
    if (!msg.passphrase.trim()) return '请输入口令';
    if (msg.passphrase.length > MAX_PASSPHRASE_CHARS) return '口令过长';
  }
  return null;
}

/**
 * security.* must come from this extension's pages (options/popup),
 * not from a content-script tab or another extension.
 */
export function isExtensionPageSender(
  sender: {
    id?: string;
    tab?: { id?: number };
    url?: string;
  },
  extensionId: string,
): boolean {
  if (!extensionId || sender.tab != null) return false;
  return sender.id === extensionId;
}
