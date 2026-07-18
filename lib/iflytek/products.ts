/**
 * Selectable iFlytek console products for the composed (short-chunk) pipeline.
 * Defaults = 多语种识别 + 机器翻译（新）+ 超拟人合成.
 *
 * Excluded (protocol mismatch with current chunked SI):
 * 实时语音转写 / 录音文件转写 / 极速转写 / 语音分析 等长流或文件类产品。
 */

export type IflytekSttProductId =
  | 'mul_cn'
  | 'zh_cn'
  | 'dialect'
  | 'iat'
  | 'iat_en'
  | 'iat_cantonese'
  | 'iat_niche';

export type IflytekMtProductId = 'its' | 'its_v2' | 'niutrans';

export type IflytekTtsProductId =
  | 'oral'
  | 'online'
  | 'online_aisjiuxu'
  | 'online_x2_xiaoguo'
  | 'online_x2_john';

export type IflytekSttProtocol = 'iat_slm' | 'iat_v2';
export type IflytekMtProtocol = 'its_new' | 'its_v2';
export type IflytekTtsProtocol = 'oral' | 'online_v2';

export type IflytekSttProduct = {
  id: IflytekSttProductId;
  label: string;
  hint: string;
  protocol: IflytekSttProtocol;
  host: string;
  path: string;
  domain: string;
  language: string;
  accent: string;
};

export type IflytekMtProduct = {
  id: IflytekMtProductId;
  label: string;
  hint: string;
  protocol: IflytekMtProtocol;
  host: string;
  path: string;
};

export type IflytekTtsProduct = {
  id: IflytekTtsProductId;
  label: string;
  hint: string;
  protocol: IflytekTtsProtocol;
  host: string;
  path: string;
  /** Default speaker; must be enabled in the console product page. */
  defaultVcn: string;
};

export const DEFAULT_IFLYTEK_STT: IflytekSttProductId = 'mul_cn';
export const DEFAULT_IFLYTEK_MT: IflytekMtProductId = 'its';
export const DEFAULT_IFLYTEK_TTS: IflytekTtsProductId = 'oral';

export const IFLYTEK_STT_PRODUCTS: IflytekSttProduct[] = [
  {
    id: 'mul_cn',
    label: '多语种识别大模型（默认）',
    hint: '控制台「多语种识别大模型」· iat.cn-huabei-1 · language=mul_cn',
    protocol: 'iat_slm',
    host: 'iat.cn-huabei-1.xf-yun.com',
    path: '/v1',
    domain: 'slm',
    language: 'mul_cn',
    accent: 'mandarin',
  },
  {
    id: 'zh_cn',
    label: '中文识别大模型（中英）',
    hint: '控制台「中文识别大模型 / 中英识别大模型」· language=zh_cn',
    protocol: 'iat_slm',
    host: 'iat.xf-yun.com',
    path: '/v1',
    domain: 'slm',
    language: 'zh_cn',
    accent: 'mandarin',
  },
  {
    id: 'dialect',
    label: '方言识别大模型',
    hint: '控制台「方言识别大模型」· accent=mulacc（多方言免切换）',
    protocol: 'iat_slm',
    host: 'iat.cn-huabei-1.xf-yun.com',
    path: '/v1',
    domain: 'slm',
    language: 'zh_cn',
    accent: 'mulacc',
  },
  {
    id: 'iat',
    label: '语音听写 · 中文普通话',
    hint: '控制台「语音听写」· iat-api.xfyun.cn/v2/iat · zh_cn/mandarin',
    protocol: 'iat_v2',
    host: 'iat-api.xfyun.cn',
    path: '/v2/iat',
    domain: 'iat',
    language: 'zh_cn',
    accent: 'mandarin',
  },
  {
    id: 'iat_en',
    label: '语音听写 · 英文',
    hint: '控制台「语音听写」· language=en_us（需开通英文）',
    protocol: 'iat_v2',
    host: 'iat-api.xfyun.cn',
    path: '/v2/iat',
    domain: 'iat',
    language: 'en_us',
    accent: 'mandarin',
  },
  {
    id: 'iat_cantonese',
    label: '语音听写 · 粤语',
    hint: '控制台「语音听写」· accent=cantonese（需开通粤语）',
    protocol: 'iat_v2',
    host: 'iat-api.xfyun.cn',
    path: '/v2/iat',
    domain: 'iat',
    language: 'zh_cn',
    accent: 'cantonese',
  },
  {
    id: 'iat_niche',
    label: '语音听写 · 小语种端点',
    hint: '控制台「语音听写」小语种 · iat-niche-api.xfyun.cn（语种需在控制台开通）',
    protocol: 'iat_v2',
    host: 'iat-niche-api.xfyun.cn',
    path: '/v2/iat',
    domain: 'iat',
    language: 'zh_cn',
    accent: 'mandarin',
  },
];

export const IFLYTEK_MT_PRODUCTS: IflytekMtProduct[] = [
  {
    id: 'its',
    label: '机器翻译（新）（默认）',
    hint: '控制台「机器翻译（新）」· itrans.xf-yun.com/v1/its',
    protocol: 'its_new',
    host: 'itrans.xf-yun.com',
    path: '/v1/its',
  },
  {
    id: 'niutrans',
    label: '机器翻译（niutrans / 小牛）',
    hint: '控制台「机器翻译(niutrans)」· ntrans.xfyun.cn/v2/ots · 请用该产品页密钥',
    protocol: 'its_v2',
    host: 'ntrans.xfyun.cn',
    path: '/v2/ots',
  },
  {
    id: 'its_v2',
    label: '机器翻译（旧版 v2）',
    hint: '控制台「机器翻译」· itrans.xfyun.cn/v2/its（Digest 鉴权）',
    protocol: 'its_v2',
    host: 'itrans.xfyun.cn',
    path: '/v2/its',
  },
];

export const IFLYTEK_TTS_PRODUCTS: IflytekTtsProduct[] = [
  {
    id: 'oral',
    label: '超拟人合成（默认）',
    hint: '控制台「超拟人合成」· vcn=x5_lingxiaoxuan_flow',
    protocol: 'oral',
    host: 'cbm01.cn-huabei-1.xf-yun.com',
    path: '/v1/private/mcd9m97e6',
    defaultVcn: 'x5_lingxiaoxuan_flow',
  },
  {
    id: 'online',
    label: '在线语音合成 · 小燕',
    hint: '控制台「在线语音合成」· tts-api · vcn=xiaoyan',
    protocol: 'online_v2',
    host: 'tts-api.xfyun.cn',
    path: '/v2/tts',
    defaultVcn: 'xiaoyan',
  },
  {
    id: 'online_aisjiuxu',
    label: '在线合成 · 许久（男声）',
    hint: '在线语音合成 · vcn=aisjiuxu（需控制台开通）',
    protocol: 'online_v2',
    host: 'tts-api.xfyun.cn',
    path: '/v2/tts',
    defaultVcn: 'aisjiuxu',
  },
  {
    id: 'online_x2_xiaoguo',
    label: '在线合成 · 小果（中文）',
    hint: '在线语音合成 · vcn=x2_xiaoguo',
    protocol: 'online_v2',
    host: 'tts-api.xfyun.cn',
    path: '/v2/tts',
    defaultVcn: 'x2_xiaoguo',
  },
  {
    id: 'online_x2_john',
    label: '在线合成 · John（英文）',
    hint: '在线语音合成 · vcn=x2_john',
    protocol: 'online_v2',
    host: 'tts-api.xfyun.cn',
    path: '/v2/tts',
    defaultVcn: 'x2_john',
  },
];

export function normalizeIflytekSttProduct(id: unknown): IflytekSttProductId {
  const s = String(id ?? '').trim();
  if (IFLYTEK_STT_PRODUCTS.some((p) => p.id === s)) return s as IflytekSttProductId;
  if (s === 'simult') return DEFAULT_IFLYTEK_STT;
  return DEFAULT_IFLYTEK_STT;
}

export function normalizeIflytekMtProduct(id: unknown): IflytekMtProductId {
  const s = String(id ?? '').trim();
  if (IFLYTEK_MT_PRODUCTS.some((p) => p.id === s)) return s as IflytekMtProductId;
  if (s === 'iflytek-mt') return DEFAULT_IFLYTEK_MT;
  return DEFAULT_IFLYTEK_MT;
}

export function normalizeIflytekTtsProduct(id: unknown): IflytekTtsProductId {
  const s = String(id ?? '').trim();
  if (IFLYTEK_TTS_PRODUCTS.some((p) => p.id === s)) return s as IflytekTtsProductId;
  if (s === 'simult-tts') return DEFAULT_IFLYTEK_TTS;
  return DEFAULT_IFLYTEK_TTS;
}

export function getIflytekSttProduct(id: unknown): IflytekSttProduct {
  const normalized = normalizeIflytekSttProduct(id);
  return IFLYTEK_STT_PRODUCTS.find((p) => p.id === normalized)!;
}

export function getIflytekMtProduct(id: unknown): IflytekMtProduct {
  const normalized = normalizeIflytekMtProduct(id);
  return IFLYTEK_MT_PRODUCTS.find((p) => p.id === normalized)!;
}

export function getIflytekTtsProduct(id: unknown): IflytekTtsProduct {
  const normalized = normalizeIflytekTtsProduct(id);
  return IFLYTEK_TTS_PRODUCTS.find((p) => p.id === normalized)!;
}
