import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchSecurityStatus,
  lockSessionRemote,
  unlockSession,
} from './security-client';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('security-client (F33 UNIT)', () => {
  it('unlockSession sends security.unlock to background', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('browser', { runtime: { sendMessage: send } });
    await unlockSession('pass-phrase');
    expect(send).toHaveBeenCalledWith({
      type: 'security.unlock',
      passphrase: 'pass-phrase',
    });
  });

  it('fetchSecurityStatus reads SW unlocked flag', async () => {
    vi.stubGlobal('browser', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          ok: true,
          hardeningEnabled: true,
          hasCredential: true,
          unlocked: true,
          autoUnlock: false,
        }),
      },
    });
    const status = await fetchSecurityStatus();
    expect(status.unlocked).toBe(true);
    expect(status.autoUnlock).toBe(false);
  });

  it('lockSessionRemote sends security.lock', async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('browser', { runtime: { sendMessage: send } });
    await lockSessionRemote();
    expect(send).toHaveBeenCalledWith({ type: 'security.lock' });
  });
});
