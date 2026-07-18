/** OpenAI-compatible provider presets for the options UI. */

export type ProviderId =
  | 'openai'
  | 'deepseek'
  | 'anthropic'
  | 'openrouter'
  | 'iflytek'
  | 'custom';

export type ProviderPreset = {
  id: ProviderId;
  label: string;
  /** Short blurb under the provider name */
  blurb: string;
  baseUrl: string;
  chatModels: string[];
  sttModels: string[];
  ttsModels: string[];
  /** Extra caution for STT/TTS / protocol */
  capabilityNote: string;
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    blurb: '官方 Chat / Whisper / TTS 一体，页面翻译 + 语音均可。',
    baseUrl: 'https://api.openai.com/v1',
    chatModels: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'o4-mini'],
    sttModels: ['whisper-1', 'gpt-4o-mini-transcribe'],
    ttsModels: ['tts-1', 'tts-1-hd', 'gpt-4o-mini-tts'],
    capabilityNote: '完整支持文本翻译、语音识别（STT）与语音合成（TTS）。',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    blurb: '高性价比中英文本；官方无 Whisper/TTS。',
    baseUrl: 'https://api.deepseek.com/v1',
    chatModels: ['deepseek-chat', 'deepseek-reasoner'],
    sttModels: [],
    ttsModels: [],
    capabilityNote:
      '适合页面文本翻译。视频「静默字幕 / 语音传译」需另配支持音频的端点（如 OpenAI），或关闭语音功能。',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    blurb: 'Claude 系列；官方 API 非 OpenAI 协议，默认经 OpenRouter。',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModels: [
      'anthropic/claude-sonnet-4',
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-haiku',
    ],
    sttModels: ['openai/whisper-1'],
    ttsModels: ['openai/tts-1'],
    capabilityNote:
      '请使用 OpenRouter Key（或改 Base URL 为自建 OpenAI 兼容网关）。STT/TTS 依赖网关是否转发音频接口。',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    blurb: '一站式聚合多厂商模型（含 Claude / GPT 等）。',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModels: [
      'openai/gpt-4o-mini',
      'anthropic/claude-3.5-sonnet',
      'deepseek/deepseek-chat',
      'google/gemini-2.0-flash-001',
    ],
    sttModels: ['openai/whisper-1'],
    ttsModels: ['openai/tts-1'],
    capabilityNote: '使用 OpenRouter API Key。音频能力取决于所选路由是否支持。',
  },
  {
    id: 'iflytek',
    label: '讯飞',
    blurb: '组合线可自选识别/翻译/合成产品；默认多语种+翻译新+超拟人。',
    baseUrl: 'https://itrans.xf-yun.com',
    chatModels: ['its', 'niutrans', 'its_v2'],
    sttModels: [
      'mul_cn',
      'zh_cn',
      'dialect',
      'iat',
      'iat_en',
      'iat_cantonese',
      'iat_niche',
    ],
    ttsModels: [
      'oral',
      'online',
      'online_aisjiuxu',
      'online_x2_xiaoguo',
      'online_x2_john',
    ],
    capabilityNote:
      '使用讯飞原生协议。选「组合线」后可分别选择识别/翻译/合成产品；「同声传译」一体线时组合产品不可选。需填写 APPID、APIKey、APISecret。划词精讲仍走免费路径。',
  },
  {
    id: 'custom',
    label: '自定义',
    blurb: '任意 OpenAI-compatible 网关（须 https）。',
    baseUrl: '',
    chatModels: [],
    sttModels: ['whisper-1'],
    ttsModels: ['tts-1'],
    capabilityNote: '自行填写 Base URL 与模型名；保存前需确认端点可信。',
  },
];

export const MODEL_FIELD_HELP = {
  chat: '用于网页文字的中英互译（Chat Completions）。可从建议列表选择，也可直接填写。',
  stt: '用于视频/音频转文字（Speech-to-Text）。',
  tts: '用于「语音传译」模式朗读译文（Text-to-Speech）。',
} as const;

export function getProvider(id: string | undefined): ProviderPreset {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[PROVIDERS.length - 1]!;
}

export function supportsStt(p: ProviderPreset): boolean {
  return p.sttModels.length > 0;
}

export function supportsTts(p: ProviderPreset): boolean {
  return p.ttsModels.length > 0;
}

/** Infer provider from stored base URL when providerId missing. */
export function inferProviderId(baseUrl: string): ProviderId {
  try {
    const host = new URL(baseUrl.trim()).hostname;
    if (host === 'api.openai.com') return 'openai';
    if (host === 'api.deepseek.com') return 'deepseek';
    if (host === 'openrouter.ai') return 'openrouter';
  } catch {
    /* ignore */
  }
  return 'custom';
}
