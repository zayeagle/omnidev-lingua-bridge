import { storage } from 'wxt/storage';
import { decryptSecret, encryptSecret } from './crypto-key';
import { resolveApiKeyInput } from './secrets';
import { publicPrefsItem, type PublicPrefs } from './public-prefs';
import {
  DEFAULT_SECURITY,
  DEFAULT_SETTINGS,
  type AiConfig,
  type ExtensionSettings,
  type SecurityState,
  type SpeechMode,
  type PageMode,
  resolveEnabledAfterSave,
  validateAiConfig,
  applyToggle,
  applySpeechMode,
  applyPageMode,
  normalizeSpeechMode,
  normalizePageMode,
  normalizeIflytekPipeline,
  hasStoredCredential,
  hasEncryptedKey,
  hasValidApiKey,
  isIflytekProvider,
  hasIflytekCredentials,
} from './storage';
import {
  clearUnlockedApiKey,
  getUnlockedApiKey,
  getUnlockedIflytekApiSecret,
  setUnlockedVault,
} from './key-session';
import { parseVaultPayload, serializeVaultPayload } from './vault-payload';

export type { PublicPrefs };
export { publicPrefsItem } from './public-prefs';

/** Full settings including API key — background / options only (not content). */
export const settingsItem = storage.defineItem<ExtensionSettings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

function withoutRememberedPassphrase(security: SecurityState): SecurityState {
  return {
    hardeningEnabled: security.hardeningEnabled,
    saltB64: security.saltB64,
    ivB64: security.ivB64,
    cipherB64: security.cipherB64,
    rememberedPassphrase: '',
  };
}

async function syncPublicPrefs(settings: ExtensionSettings): Promise<void> {
  await publicPrefsItem.setValue({
    enabled: settings.enabled,
    speechMode: normalizeSpeechMode(settings.speechMode),
    pageMode: normalizePageMode(settings.pageMode),
    hasApiKey: hasStoredCredential(settings),
    providerId: (settings.aiConfig.providerId ?? 'openai').trim() || 'openai',
    iflytekPipeline: normalizeIflytekPipeline(settings.aiConfig.iflytekPipeline),
  });
}

async function persist(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const next: ExtensionSettings = {
    ...settings,
    security: withoutRememberedPassphrase(settings.security),
  };
  await settingsItem.setValue(next);
  await syncPublicPrefs(next);
  return next;
}

export async function getSettings(): Promise<ExtensionSettings> {
  const value = await settingsItem.getValue();
  return {
    enabled: value.enabled,
    speechMode: normalizeSpeechMode(value.speechMode),
    pageMode: normalizePageMode(value.pageMode),
    aiConfig: { ...DEFAULT_SETTINGS.aiConfig, ...value.aiConfig },
    security: withoutRememberedPassphrase({
      ...DEFAULT_SECURITY,
      ...value.security,
    }),
  };
}

/** Ensure content-facing prefs exist after upgrades. */
export async function ensurePublicPrefsSynced(): Promise<PublicPrefs> {
  const settings = await getSettings();
  // Migrate: wipe any legacy persisted passphrase (never auto-unlock from disk).
  if ((valueRemembered(await settingsItem.getValue()) ?? '').trim()) {
    await persist(settings);
  } else {
    await syncPublicPrefs(settings);
  }
  return {
    enabled: settings.enabled,
    speechMode: settings.speechMode,
    pageMode: settings.pageMode,
    hasApiKey: hasStoredCredential(settings),
    providerId: (settings.aiConfig.providerId ?? 'openai').trim() || 'openai',
    iflytekPipeline: normalizeIflytekPipeline(settings.aiConfig.iflytekPipeline),
  };
}

function valueRemembered(value: ExtensionSettings): string | undefined {
  return value.security?.rememberedPassphrase;
}

export type SaveAiOptions = {
  /** Enable encrypt-at-rest for the API key */
  hardening?: boolean;
  /** Passphrase when enabling / updating encrypted vault */
  passphrase?: string;
};

export async function saveAiConfig(
  partial: Partial<AiConfig>,
  opts: SaveAiOptions = {},
): Promise<ExtensionSettings> {
  const current = await getSettings();
  const wantHardening = opts.hardening ?? current.security.hardeningEnabled;
  const inputKey = resolveApiKeyInput(partial.apiKey, '');
  const inputSecret = (partial.iflytekApiSecret ?? '').trim();

  if (wantHardening) {
    const passphrase = (opts.passphrase ?? '').trim();
    let vault = {
      apiKey: '',
      iflytekApiSecret: '',
    };

    if (hasEncryptedKey(current.security)) {
      if (!passphrase) {
        // Keep existing cipher; update non-secret fields only — never persist secrets.
        const aiConfig = validateAiConfig(
          {
            ...current.aiConfig,
            ...partial,
            apiKey: 'placeholder',
            iflytekApiSecret: '',
          },
          { allowEmptyKey: false },
        );
        aiConfig.apiKey = '';
        aiConfig.iflytekApiSecret = '';
        const next: ExtensionSettings = {
          enabled: false,
          speechMode: current.speechMode,
          pageMode: current.pageMode,
          aiConfig,
          security: withoutRememberedPassphrase(current.security),
        };
        next.enabled = resolveEnabledAfterSave(current, next);
        return persist(next);
      }
      vault = parseVaultPayload(
        await decryptSecret(
          {
            saltB64: current.security.saltB64,
            ivB64: current.security.ivB64,
            cipherB64: current.security.cipherB64,
          },
          passphrase,
        ),
      );
    } else {
      vault = {
        apiKey: current.aiConfig.apiKey || '',
        iflytekApiSecret: current.aiConfig.iflytekApiSecret || '',
      };
    }

    if (inputKey) vault.apiKey = inputKey;
    if (inputSecret) vault.iflytekApiSecret = inputSecret;

    if (!vault.apiKey.trim()) {
      throw new Error('API Key 不能为空');
    }
    if (!passphrase) {
      throw new Error('开启安全加固时请设置加密口令');
    }

    const blob = await encryptSecret(serializeVaultPayload(vault), passphrase);
    const security: SecurityState = withoutRememberedPassphrase({
      hardeningEnabled: true,
      saltB64: blob.saltB64,
      ivB64: blob.ivB64,
      cipherB64: blob.cipherB64,
    });

    const aiConfig = validateAiConfig(
      {
        ...current.aiConfig,
        ...partial,
        apiKey: 'x',
        iflytekApiSecret: '',
      },
      { allowEmptyKey: true },
    );
    aiConfig.apiKey = '';
    aiConfig.iflytekApiSecret = '';

    setUnlockedVault(vault);

    const next: ExtensionSettings = {
      enabled: false,
      speechMode: current.speechMode,
      pageMode: current.pageMode,
      aiConfig,
      security,
    };
    next.enabled = resolveEnabledAfterSave(current, next);
    return persist(next);
  }

  // Disable hardening → store plaintext (need passphrase if vault exists).
  let secret = inputKey;
  let iflytekSecret = inputSecret;
  if (hasEncryptedKey(current.security)) {
    const passphrase = (opts.passphrase ?? '').trim();
    if (!passphrase) throw new Error('关闭安全加固需输入口令以解密现有 Key');
    const vault = parseVaultPayload(
      await decryptSecret(
        {
          saltB64: current.security.saltB64,
          ivB64: current.security.ivB64,
          cipherB64: current.security.cipherB64,
        },
        passphrase,
      ),
    );
    if (!secret) secret = vault.apiKey;
    if (!iflytekSecret) iflytekSecret = vault.iflytekApiSecret;
  } else {
    if (!secret && hasValidApiKey(current.aiConfig)) {
      secret = current.aiConfig.apiKey;
    }
    if (!iflytekSecret) {
      iflytekSecret = current.aiConfig.iflytekApiSecret || '';
    }
  }

  const aiConfig = validateAiConfig(
    {
      ...current.aiConfig,
      ...partial,
      apiKey: secret || partial.apiKey || '',
      iflytekApiSecret: iflytekSecret,
    },
    { allowEmptyKey: true },
  );
  clearUnlockedApiKey();
  const next: ExtensionSettings = {
    enabled: false,
    speechMode: current.speechMode,
    pageMode: current.pageMode,
    aiConfig,
    security: { ...DEFAULT_SECURITY },
  };
  next.enabled = resolveEnabledAfterSave(current, next);
  return persist(next);
}

export async function unlockWithPassphrase(passphrase: string): Promise<void> {
  const settings = await getSettings();
  if (!hasEncryptedKey(settings.security)) {
    throw new Error('未启用安全加固或尚无加密密钥');
  }
  const vault = parseVaultPayload(
    await decryptSecret(
      {
        saltB64: settings.security.saltB64,
        ivB64: settings.security.ivB64,
        cipherB64: settings.security.cipherB64,
      },
      passphrase,
    ),
  );
  setUnlockedVault(vault);
  // Never persist passphrase — strip legacy field if present.
  if ((settings.security.rememberedPassphrase ?? '').trim()) {
    await persist({
      ...settings,
      security: withoutRememberedPassphrase(settings.security),
    });
  }
}

/**
 * Session unlock only. Does not read passphrase from disk (auto-unlock removed).
 * Migrates away any legacy rememberedPassphrase.
 */
export async function ensureAutoUnlocked(): Promise<boolean> {
  if (getUnlockedApiKey()) return true;
  const raw = await settingsItem.getValue();
  const settings = await getSettings();
  if (!hasEncryptedKey(settings.security)) return true;
  if ((raw.security?.rememberedPassphrase ?? '').trim()) {
    await persist(settings);
  }
  return false;
}

export async function lockSession(): Promise<void> {
  clearUnlockedApiKey();
}

export async function getSecurityStatus(): Promise<{
  hardeningEnabled: boolean;
  hasCredential: boolean;
  unlocked: boolean;
  autoUnlock: boolean;
}> {
  await ensureAutoUnlocked();
  const settings = await getSettings();
  return {
    hardeningEnabled: settings.security.hardeningEnabled,
    hasCredential: hasStoredCredential(settings),
    unlocked: !settings.security.hardeningEnabled || !!getUnlockedApiKey(),
    /** Always false — passphrase is never persisted for auto-unlock. */
    autoUnlock: false,
  };
}

export type ResolveAiFailureReason = 'locked' | 'missing_key' | 'incomplete_iflytek';

/** Resolve AiConfig with plaintext secrets for AI calls (background only). */
export async function resolveAiConfigForRequest(): Promise<
  | { ok: true; settings: ExtensionSettings }
  | { ok: false; error: string; reason: ResolveAiFailureReason }
> {
  await ensureAutoUnlocked();
  const settings = await getSettings();
  if (hasEncryptedKey(settings.security)) {
    const key = getUnlockedApiKey();
    if (!key) {
      return {
        ok: false,
        reason: 'locked',
        error: '安全加固已开启，请先在设置页输入口令解锁',
      };
    }
    const unlocked: ExtensionSettings = {
      ...settings,
      aiConfig: {
        ...settings.aiConfig,
        apiKey: key,
        iflytekApiSecret: getUnlockedIflytekApiSecret() ?? '',
      },
    };
    if (isIflytekProvider(unlocked.aiConfig) && !hasIflytekCredentials(unlocked.aiConfig)) {
      return {
        ok: false,
        reason: 'incomplete_iflytek',
        error: '请先在设置页完整填写讯飞 APPID / APIKey / APISecret',
      };
    }
    return { ok: true, settings: unlocked };
  }
  if (!hasValidApiKey(settings.aiConfig)) {
    return {
      ok: false,
      reason: 'missing_key',
      error: isIflytekProvider(settings.aiConfig)
        ? '请先在设置页完整填写讯飞 APPID / APIKey / APISecret'
        : '请先在设置页配置有效的 API Key',
    };
  }
  return { ok: true, settings };
}

export async function clearEncryptedVault(): Promise<ExtensionSettings> {
  clearUnlockedApiKey();
  const current = await getSettings();
  return persist({
    ...current,
    enabled: false,
    aiConfig: {
      ...current.aiConfig,
      apiKey: '',
      iflytekAppId: '',
      iflytekApiSecret: '',
    },
    security: { ...DEFAULT_SECURITY },
  });
}

export async function setEnabled(wantEnabled: boolean): Promise<ExtensionSettings> {
  const current = await getSettings();
  const { settings, error } = applyToggle(current, wantEnabled);
  if (error) {
    throw new Error(error);
  }
  return persist(settings);
}

export async function setSpeechMode(mode: SpeechMode): Promise<ExtensionSettings> {
  const current = await getSettings();
  return persist(applySpeechMode(current, mode));
}

export async function setPageMode(mode: PageMode): Promise<ExtensionSettings> {
  const current = await getSettings();
  return persist(applyPageMode(current, mode));
}
