import { storage } from 'wxt/storage';
import {
  DEFAULT_SETTINGS,
  type IflytekPipeline,
  type PageMode,
  type SpeechMode,
} from './storage';

/** Public prefs only — safe for content / popup (no API key fields). */
export type PublicPrefs = {
  enabled: boolean;
  speechMode: SpeechMode;
  pageMode: PageMode;
  /** Whether a key is configured — never the key itself. */
  hasApiKey: boolean;
  /** Safe provider id for content routing (e.g. pcm capture for iflytek). */
  providerId: string;
  /** iFlytek composed | simult — only meaningful when providerId=iflytek */
  iflytekPipeline: IflytekPipeline;
};

export const publicPrefsItem = storage.defineItem<PublicPrefs>('local:publicPrefs', {
  fallback: {
    enabled: DEFAULT_SETTINGS.enabled,
    speechMode: DEFAULT_SETTINGS.speechMode,
    pageMode: DEFAULT_SETTINGS.pageMode,
    hasApiKey: false,
    providerId: 'openai',
    iflytekPipeline: 'composed',
  },
});
