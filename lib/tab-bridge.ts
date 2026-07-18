/** Popup ↔ active tab content-script bridge. */

import type { PageStatusResponse } from './messages';
import type { SpeechMode } from './storage';

const CONTENT_SCRIPT_FILE = 'content-scripts/content.js';

export type ActiveTabOk = { id: number; url?: string };
export type ActiveTabBlocked = {
  id: number;
  url?: string;
  /** Why SI cannot start on this tab (show only when user clicks 开启同传). */
  blocked: string;
};
export type ActiveTab =
  | ActiveTabOk
  | ActiveTabBlocked
  | { error: string };

export function isRestrictedUrl(url: string | undefined): string | null {
  if (!url) return '当前标签页地址不可用';
  if (
    /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url) ||
    /^https?:\/\/chrome\.google\.com\/webstore/i.test(url)
  ) {
    return '系统页/扩展商店无法开同传，请切到普通网页（如视频页）';
  }
  return null;
}

export function isTabBlocked(tab: ActiveTab): tab is ActiveTabBlocked {
  return 'blocked' in tab && typeof tab.blocked === 'string';
}

export async function getActiveTab(): Promise<ActiveTab> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) return { error: '没有活动标签页' };
  const blocked = isRestrictedUrl(tab.url);
  if (blocked) {
    return { id: tab.id, url: tab.url, blocked };
  }
  return { id: tab.id, url: tab.url };
}

/** Ping content script; if missing, inject once then retry. */
export async function ensureTabContent(tabId: number): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, { type: 'page.status' });
    return true;
  } catch {
    /* try inject */
  }
  try {
    await browser.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });
  } catch {
    return false;
  }
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 60));
    try {
      await browser.tabs.sendMessage(tabId, { type: 'page.status' });
      return true;
    } catch {
      /* retry */
    }
  }
  return false;
}

export async function queryTabStatus(
  tabId: number,
): Promise<PageStatusResponse | null> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, {
      type: 'page.status',
    })) as PageStatusResponse;
    return res ?? null;
  } catch {
    return null;
  }
}

export type PageSpeechResult = {
  ok: boolean;
  speechOnThisPage: boolean;
  error?: string;
};

export async function toggleTabSpeech(
  tabId: number,
  on: boolean,
): Promise<PageSpeechResult> {
  try {
    const res = (await browser.tabs.sendMessage(tabId, {
      type: 'page.speech',
      on,
    })) as PageSpeechResult;
    return {
      ok: !!res?.ok,
      speechOnThisPage: !!res?.speechOnThisPage,
      error: res?.error,
    };
  } catch (e) {
    return {
      ok: false,
      speechOnThisPage: false,
      error: e instanceof Error ? e.message : '无法连接本页内容脚本',
    };
  }
}

/** Push speech style to the tab immediately (storage watch is backup). */
export async function setTabSpeechMode(
  tabId: number,
  mode: SpeechMode,
): Promise<boolean> {
  try {
    await browser.tabs.sendMessage(tabId, {
      type: 'page.setSpeechMode',
      mode,
    });
    return true;
  } catch {
    return false;
  }
}
