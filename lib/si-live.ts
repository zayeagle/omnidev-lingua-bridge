/** Live per-tab SI flag — content → SW → popup (caption × sync). */

import { storage } from 'wxt/storage';
import type { SpeechMode } from './storage';

export type SiLiveState = {
  tabId: number | null;
  speechOnThisPage: boolean;
  speechMode: SpeechMode;
  /** Monotonic-ish stamp so identical payloads still notify watchers. */
  rev: number;
};

export const siLiveItem = storage.defineItem<SiLiveState>('session:siLive', {
  fallback: {
    tabId: null,
    speechOnThisPage: false,
    speechMode: 'caption',
    rev: 0,
  },
});
