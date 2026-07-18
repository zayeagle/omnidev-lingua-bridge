/** Options/popup → background security.* helpers (SW key-session SSOT). */

import type { SecurityRequest } from './messages';

type SecurityStatusOk = {
  ok: true;
  hardeningEnabled: boolean;
  hasCredential: boolean;
  unlocked: boolean;
  autoUnlock: boolean;
};

type SecurityResult = SecurityStatusOk | { ok: true } | { ok: false; error?: string };

async function sendSecurity(msg: SecurityRequest): Promise<SecurityResult> {
  const res = (await browser.runtime.sendMessage(msg)) as SecurityResult;
  if (!res || typeof res !== 'object') {
    throw new Error('安全服务无响应');
  }
  if (!res.ok) {
    throw new Error(('error' in res && res.error) || '安全操作失败');
  }
  return res;
}

export async function unlockSession(passphrase: string): Promise<void> {
  await sendSecurity({ type: 'security.unlock', passphrase });
}

export async function lockSessionRemote(): Promise<void> {
  await sendSecurity({ type: 'security.lock' });
}

export async function fetchSecurityStatus(): Promise<{
  hardeningEnabled: boolean;
  hasCredential: boolean;
  unlocked: boolean;
  autoUnlock: boolean;
}> {
  const res = await sendSecurity({ type: 'security.status' });
  if (!res.ok || !('unlocked' in res)) {
    throw new Error('无法读取安全状态');
  }
  return {
    hardeningEnabled: !!res.hardeningEnabled,
    hasCredential: !!res.hasCredential,
    unlocked: !!res.unlocked,
    autoUnlock: !!res.autoUnlock,
  };
}
