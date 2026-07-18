import { applyDomI18n, t } from '../../lib/i18n';
import {
  clearEncryptedVault,
  getSettings,
  saveAiConfig,
} from '../../lib/settings-store';
import {
  fetchSecurityStatus,
  lockSessionRemote,
  unlockSession,
} from '../../lib/security-client';

applyDomI18n();
document.title = t('optionsTitle');
import {
  hasEncryptedKey,
  hasStoredCredential,
  hasValidApiKey,
  normalizeIflytekPipeline,
  requiresBaseUrlTrustAck,
  type IflytekPipeline,
} from '../../lib/storage';
import {
  DEFAULT_IFLYTEK_MT,
  DEFAULT_IFLYTEK_STT,
  DEFAULT_IFLYTEK_TTS,
  IFLYTEK_MT_PRODUCTS,
  IFLYTEK_STT_PRODUCTS,
  IFLYTEK_TTS_PRODUCTS,
  normalizeIflytekMtProduct,
  normalizeIflytekSttProduct,
  normalizeIflytekTtsProduct,
} from '../../lib/iflytek/products';
import { maskApiKey } from '../../lib/secrets';
import { generatePassphrase } from '../../lib/crypto-key';
import {
  MODEL_FIELD_HELP,
  PROVIDERS,
  getProvider,
  inferProviderId,
  supportsStt,
  supportsTts,
  type ProviderId,
} from '../../lib/providers';

const form = document.getElementById('form') as HTMLFormElement;
const providerGrid = document.getElementById('providerGrid') as HTMLDivElement;
const providerNote = document.getElementById('providerNote') as HTMLParagraphElement;
const openaiCreds = document.getElementById('openaiCreds') as HTMLDivElement;
const iflytekCreds = document.getElementById('iflytekCreds') as HTMLDivElement;
const modelsSection = document.getElementById('modelsSection') as HTMLElement;
const apiKeyEl = document.getElementById('apiKey') as HTMLInputElement;
const baseUrlEl = document.getElementById('baseUrl') as HTMLInputElement;
const iflytekAppIdEl = document.getElementById('iflytekAppId') as HTMLInputElement;
const iflytekApiKeyEl = document.getElementById('iflytekApiKey') as HTMLInputElement;
const iflytekApiSecretEl = document.getElementById('iflytekApiSecret') as HTMLInputElement;
const iflytekKeyHintEl = document.getElementById('iflytekKeyHint') as HTMLParagraphElement;
const iflytekComposedProductsEl = document.getElementById(
  'iflytekComposedProducts',
) as HTMLFieldSetElement;
const iflytekMtBlockEl = document.getElementById('iflytekMtBlock') as HTMLDivElement;
const iflytekSttProductEl = document.getElementById(
  'iflytekSttProduct',
) as HTMLSelectElement;
const iflytekMtProductEl = document.getElementById(
  'iflytekMtProduct',
) as HTMLSelectElement;
const iflytekTtsProductEl = document.getElementById(
  'iflytekTtsProduct',
) as HTMLSelectElement;
const iflytekSttHintEl = document.getElementById('iflytekSttHint') as HTMLParagraphElement;
const iflytekMtHintEl = document.getElementById('iflytekMtHint') as HTMLParagraphElement;
const iflytekTtsHintEl = document.getElementById('iflytekTtsHint') as HTMLParagraphElement;
const chatModelEl = document.getElementById('chatModel') as HTMLInputElement;
const sttModelEl = document.getElementById('sttModel') as HTMLInputElement;
const ttsModelEl = document.getElementById('ttsModel') as HTMLInputElement;
const chatList = document.getElementById('chatModelList') as HTMLDataListElement;
const sttList = document.getElementById('sttModelList') as HTMLDataListElement;
const ttsList = document.getElementById('ttsModelList') as HTMLDataListElement;
const sttField = document.getElementById('sttField') as HTMLDivElement;
const ttsField = document.getElementById('ttsField') as HTMLDivElement;
const trustWrap = document.getElementById('trustWrap') as HTMLDivElement;
const trustAckEl = document.getElementById('trustAck') as HTMLInputElement;
const keyHintEl = document.getElementById('keyHint') as HTMLParagraphElement;
const msgEl = document.getElementById('msg') as HTMLParagraphElement;
const chatHelp = document.getElementById('chatHelp') as HTMLParagraphElement;
const sttHelp = document.getElementById('sttHelp') as HTMLParagraphElement;
const ttsHelp = document.getElementById('ttsHelp') as HTMLParagraphElement;
const hardeningEl = document.getElementById('hardening') as HTMLInputElement;
const hardeningFields = document.getElementById('hardeningFields') as HTMLDivElement;
const passphraseEl = document.getElementById('passphrase') as HTMLInputElement;
const genPassBtn = document.getElementById('genPassphrase') as HTMLButtonElement;
const copyPassBtn = document.getElementById('copyPassphrase') as HTMLButtonElement;
const passGenHint = document.getElementById('passGenHint') as HTMLParagraphElement;
const unlockRow = document.getElementById('unlockRow') as HTMLDivElement;
const unlockPassEl = document.getElementById('unlockPass') as HTMLInputElement;
const unlockBtn = document.getElementById('unlockBtn') as HTMLButtonElement;
const clearVaultBtn = document.getElementById('clearVault') as HTMLButtonElement;

let hasStoredKey = false;
let encryptedMode = false;
let providerId: ProviderId = 'openai';

chatHelp.textContent = MODEL_FIELD_HELP.chat;
sttHelp.textContent = MODEL_FIELD_HELP.stt;
ttsHelp.textContent = MODEL_FIELD_HELP.tts;

function setMsg(text: string, kind: '' | 'ok' | 'err' = '') {
  msgEl.textContent = text;
  msgEl.className = `msg${kind ? ` ${kind}` : ''}`;
}

function refreshTrustUi() {
  const need = requiresBaseUrlTrustAck(baseUrlEl.value || '');
  trustWrap.hidden = !need;
  if (!need) trustAckEl.checked = false;
}

function fillDatalist(list: HTMLDataListElement, models: string[]) {
  list.replaceChildren();
  for (const m of models) {
    const opt = document.createElement('option');
    opt.value = m;
    list.appendChild(opt);
  }
}

function renderProviderGrid() {
  providerGrid.replaceChildren();
  for (const p of PROVIDERS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'provider-btn';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-checked', p.id === providerId ? 'true' : 'false');
    btn.dataset.id = p.id;
    const strong = document.createElement('strong');
    strong.textContent = p.label;
    const span = document.createElement('span');
    span.textContent = p.blurb;
    btn.append(strong, span);
    btn.addEventListener('click', () => applyProvider(p.id, true));
    providerGrid.appendChild(btn);
  }
}

function highlightProvider() {
  for (const el of providerGrid.querySelectorAll<HTMLButtonElement>('.provider-btn')) {
    el.setAttribute('aria-checked', el.dataset.id === providerId ? 'true' : 'false');
  }
}

function getIflytekPipeline(): IflytekPipeline {
  const checked = document.querySelector<HTMLInputElement>(
    'input[name="iflytekPipeline"]:checked',
  );
  return normalizeIflytekPipeline(checked?.value);
}

function setIflytekPipeline(mode: IflytekPipeline) {
  for (const el of document.querySelectorAll<HTMLInputElement>(
    'input[name="iflytekPipeline"]',
  )) {
    el.checked = el.value === mode;
  }
  syncIflytekProductUi();
}

function fillProductSelect(
  select: HTMLSelectElement,
  items: Array<{ id: string; label: string }>,
  selected: string,
): void {
  select.replaceChildren();
  for (const item of items) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = item.label;
    select.appendChild(opt);
  }
  select.value = selected;
}

function syncProductHints(): void {
  const stt = IFLYTEK_STT_PRODUCTS.find((p) => p.id === iflytekSttProductEl.value);
  const mt = IFLYTEK_MT_PRODUCTS.find((p) => p.id === iflytekMtProductEl.value);
  const tts = IFLYTEK_TTS_PRODUCTS.find((p) => p.id === iflytekTtsProductEl.value);
  iflytekSttHintEl.textContent = stt?.hint ?? '';
  iflytekMtHintEl.textContent = mt?.hint ?? '';
  iflytekTtsHintEl.textContent = tts?.hint ?? '';
}

function syncIflytekProductUi(): void {
  const isIflytek = providerId === 'iflytek';
  const composed = isIflytek && getIflytekPipeline() === 'composed';
  // STT/TTS only for 组合线; MT always selectable for text (bubble/page).
  // Prefer both hidden attr + class — .field { display:grid } can override [hidden].
  iflytekComposedProductsEl.hidden = !composed;
  iflytekComposedProductsEl.classList.toggle('is-hidden', !composed);
  iflytekComposedProductsEl.disabled = !composed;
  iflytekSttProductEl.disabled = !composed;
  iflytekTtsProductEl.disabled = !composed;
  iflytekMtBlockEl.hidden = !isIflytek;
  iflytekMtBlockEl.classList.toggle('is-hidden', !isIflytek);
  iflytekMtProductEl.disabled = !isIflytek;
}

function applyProvider(id: ProviderId, fillDefaults: boolean) {
  providerId = id;
  const p = getProvider(id);
  highlightProvider();
  providerNote.hidden = !p.capabilityNote;
  providerNote.textContent = p.capabilityNote;

  const isIflytek = id === 'iflytek';
  openaiCreds.hidden = isIflytek;
  iflytekCreds.hidden = !isIflytek;
  modelsSection.hidden = isIflytek;

  if (fillDefaults) {
    if (p.baseUrl) baseUrlEl.value = p.baseUrl;
    if (p.chatModels[0]) chatModelEl.value = p.chatModels[0];
    sttModelEl.value = p.sttModels[0] ?? '';
    ttsModelEl.value = p.ttsModels[0] ?? '';
    if (isIflytek) {
      fillProductSelect(iflytekSttProductEl, IFLYTEK_STT_PRODUCTS, DEFAULT_IFLYTEK_STT);
      fillProductSelect(iflytekMtProductEl, IFLYTEK_MT_PRODUCTS, DEFAULT_IFLYTEK_MT);
      fillProductSelect(iflytekTtsProductEl, IFLYTEK_TTS_PRODUCTS, DEFAULT_IFLYTEK_TTS);
      syncProductHints();
    }
  }

  fillDatalist(chatList, p.chatModels);
  fillDatalist(sttList, p.sttModels);
  fillDatalist(ttsList, p.ttsModels);

  // Unsupported model types: hide inputs; limitations stay in providerNote
  sttField.hidden = !supportsStt(p);
  ttsField.hidden = !supportsTts(p);
  syncIflytekProductUi();
  refreshTrustUi();
}

let needsManualUnlock = false;

function syncHardeningUi() {
  const on = hardeningEl.checked;
  // Collapse passphrase / unlock / clear until hardening is checked.
  hardeningFields.hidden = !on;
  // Show unlock when vault exists and SW session is locked.
  unlockRow.hidden = !on || !encryptedMode || !needsManualUnlock;
  clearVaultBtn.hidden = !on || !encryptedMode;
}

genPassBtn.addEventListener('click', () => {
  const pass = generatePassphrase();
  passphraseEl.type = 'text';
  passphraseEl.value = pass;
  copyPassBtn.hidden = false;
  passGenHint.hidden = false;
  passGenHint.textContent =
    '已生成随机口令。不会写入存储；请复制备份（换设备/清数据时需要）。';
  setMsg('已自动生成加密口令，可复制备份后点「保存并启用」', 'ok');
});

copyPassBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(passphraseEl.value);
    setMsg('口令已复制到剪贴板', 'ok');
  } catch {
    passphraseEl.select();
    setMsg('请手动复制口令框中的内容', 'err');
  }
});

hardeningEl.addEventListener('change', () => {
  syncHardeningUi();
});

unlockBtn.addEventListener('click', async () => {
  try {
    await unlockSession(unlockPassEl.value);
    unlockPassEl.value = '';
    needsManualUnlock = false;
    syncHardeningUi();
    setMsg('已解锁本会话；浏览器重启后需再次解锁', 'ok');
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err');
  }
});

clearVaultBtn.addEventListener('click', async () => {
  if (!confirm('将清除加密后的 API Key 并关闭安全加固。确定？')) return;
  try {
    await clearEncryptedVault();
    await lockSessionRemote().catch(() => undefined);
    encryptedMode = false;
    hasStoredKey = false;
    hardeningEl.checked = false;
    passphraseEl.value = '';
    syncHardeningUi();
    keyHintEl.textContent = '已清除。请重新填写 API Key。';
    setMsg('已清除加密密钥', 'ok');
  } catch (e) {
    setMsg(e instanceof Error ? e.message : String(e), 'err');
  }
});

async function load() {
  const settings = await getSettings();
  const status = await fetchSecurityStatus();
  encryptedMode = hasEncryptedKey(settings.security);
  hasStoredKey = hasStoredCredential(settings);
  hardeningEl.checked = settings.security.hardeningEnabled;
  needsManualUnlock = encryptedMode && !status.unlocked;
  syncHardeningUi();

  apiKeyEl.value = '';
  iflytekApiKeyEl.value = '';
  apiKeyEl.placeholder = hasStoredKey
    ? encryptedMode
      ? '已加密保存，留空则保持；填写则用新 Key 重新加密'
      : '已保存，留空则保持不变'
    : 'sk-… 或供应商 Key';
  iflytekApiKeyEl.placeholder = apiKeyEl.placeholder;
  keyHintEl.textContent = encryptedMode
    ? status.unlocked
      ? '凭证已加密；本次会话已解锁。浏览器重启后需在设置页重新解锁。'
      : '凭证已加密。请在下方输入口令解锁后再使用同传/翻译。'
    : hasValidApiKey(settings.aiConfig)
      ? `当前 Key：${maskApiKey(settings.aiConfig.apiKey)}（输入新值可替换）`
      : 'Key 仅保存在本机浏览器。';
  iflytekKeyHintEl.textContent = keyHintEl.textContent;

  if (needsManualUnlock) {
    setMsg('安全加固已开启：请输入口令解锁本会话', '');
  }

  baseUrlEl.value = settings.aiConfig.baseUrl;
  chatModelEl.value = settings.aiConfig.chatModel;
  sttModelEl.value = settings.aiConfig.sttModel;
  ttsModelEl.value = settings.aiConfig.ttsModel;
  iflytekAppIdEl.value = settings.aiConfig.iflytekAppId ?? '';
  // Never hydrate APISecret from storage when hardened (secret is in the vault).
  iflytekApiSecretEl.value = encryptedMode
    ? ''
    : (settings.aiConfig.iflytekApiSecret ?? '');
  iflytekApiSecretEl.placeholder = encryptedMode
    ? '已加密保存，留空则保持；填写则随口令重新加密'
    : 'APISecret';
  fillProductSelect(
    iflytekSttProductEl,
    IFLYTEK_STT_PRODUCTS,
    normalizeIflytekSttProduct(
      settings.aiConfig.iflytekSttProduct ?? settings.aiConfig.sttModel,
    ),
  );
  fillProductSelect(
    iflytekMtProductEl,
    IFLYTEK_MT_PRODUCTS,
    normalizeIflytekMtProduct(
      settings.aiConfig.iflytekMtProduct ?? settings.aiConfig.chatModel,
    ),
  );
  fillProductSelect(
    iflytekTtsProductEl,
    IFLYTEK_TTS_PRODUCTS,
    normalizeIflytekTtsProduct(
      settings.aiConfig.iflytekTtsProduct ?? settings.aiConfig.ttsModel,
    ),
  );
  syncProductHints();
  setIflytekPipeline(normalizeIflytekPipeline(settings.aiConfig.iflytekPipeline));

  providerId =
    (settings.aiConfig.providerId as ProviderId) || inferProviderId(settings.aiConfig.baseUrl);
  renderProviderGrid();
  applyProvider(providerId, false);
}

baseUrlEl.addEventListener('input', () => {
  refreshTrustUi();
  const inferred = inferProviderId(baseUrlEl.value);
  if (inferred !== 'custom' && inferred !== providerId) {
    providerId = inferred;
    applyProvider(providerId, false);
  }
});

for (const el of document.querySelectorAll<HTMLInputElement>(
  'input[name="iflytekPipeline"]',
)) {
  el.addEventListener('change', () => syncIflytekProductUi());
}
iflytekSttProductEl.addEventListener('change', () => syncProductHints());
iflytekMtProductEl.addEventListener('change', () => syncProductHints());
iflytekTtsProductEl.addEventListener('change', () => syncProductHints());

// Populate selects before first paint so load() can set values.
fillProductSelect(iflytekSttProductEl, IFLYTEK_STT_PRODUCTS, DEFAULT_IFLYTEK_STT);
fillProductSelect(iflytekMtProductEl, IFLYTEK_MT_PRODUCTS, DEFAULT_IFLYTEK_MT);
fillProductSelect(iflytekTtsProductEl, IFLYTEK_TTS_PRODUCTS, DEFAULT_IFLYTEK_TTS);
syncProductHints();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const hardening = hardeningEl.checked;
    const isIflytek = providerId === 'iflytek';
    const keyInput = isIflytek ? iflytekApiKeyEl.value : apiKeyEl.value;
    const enteringKey = !!keyInput.trim() || hasStoredKey;
    if (hardening && !enteringKey) {
      setMsg('安全加固需要先填写或已保存 API Key', 'err');
      return;
    }
    if (
      !isIflytek &&
      enteringKey &&
      requiresBaseUrlTrustAck(baseUrlEl.value) &&
      !trustAckEl.checked
    ) {
      setMsg('自定义 Base URL 会收到你的 API Key，请勾选确认该端点可信', 'err');
      return;
    }
    if (!isIflytek && enteringKey && !chatModelEl.value.trim()) {
      setMsg('使用 AI 时请选择或填写 Chat 模型', 'err');
      return;
    }
    if (isIflytek && enteringKey) {
      const appId = iflytekAppIdEl.value.trim();
      const secret = iflytekApiSecretEl.value.trim();
      if (!appId) {
        setMsg('请填写讯飞 APPID', 'err');
        return;
      }
      // Hardened vault may already hold APISecret — allow empty input when stored.
      if (!secret && !hasStoredKey) {
        setMsg('请填写讯飞 APISecret', 'err');
        return;
      }
    }
    // New harden requires passphrase; existing vault may keep cipher without re-entry.
    if (hardening && !passphraseEl.value.trim() && !encryptedMode) {
      setMsg('开启安全加固请设置口令，或点击「自动生成」', 'err');
      return;
    }

    const p = getProvider(providerId);
    const current = await getSettings();
    const sttProduct = normalizeIflytekSttProduct(iflytekSttProductEl.value);
    const mtProduct = normalizeIflytekMtProduct(iflytekMtProductEl.value);
    const ttsProduct = normalizeIflytekTtsProduct(iflytekTtsProductEl.value);
    const passphrase = passphraseEl.value;
    const next = await saveAiConfig(
      {
        apiKey: keyInput,
        baseUrl: isIflytek ? 'https://itrans.xf-yun.com' : baseUrlEl.value,
        chatModel: isIflytek ? mtProduct : chatModelEl.value,
        sttModel: isIflytek
          ? sttProduct
          : supportsStt(p)
            ? sttModelEl.value || 'whisper-1'
            : 'whisper-1',
        ttsModel: isIflytek
          ? ttsProduct
          : supportsTts(p)
            ? ttsModelEl.value || 'tts-1'
            : 'tts-1',
        providerId,
        iflytekAppId: isIflytek
          ? iflytekAppIdEl.value.trim()
          : (current.aiConfig.iflytekAppId ?? ''),
        iflytekApiSecret: isIflytek
          ? iflytekApiSecretEl.value.trim()
          : (current.aiConfig.iflytekApiSecret ?? ''),
        iflytekPipeline: isIflytek
          ? getIflytekPipeline()
          : normalizeIflytekPipeline(current.aiConfig.iflytekPipeline),
        iflytekSttProduct: isIflytek
          ? sttProduct
          : normalizeIflytekSttProduct(current.aiConfig.iflytekSttProduct),
        iflytekMtProduct: isIflytek
          ? mtProduct
          : normalizeIflytekMtProduct(current.aiConfig.iflytekMtProduct),
        iflytekTtsProduct: isIflytek
          ? ttsProduct
          : normalizeIflytekTtsProduct(current.aiConfig.iflytekTtsProduct),
      },
      {
        hardening,
        passphrase,
      },
    );

    // Fill SW key-session (options-world setUnlockedVault is not visible to background).
    if (hardening && passphrase.trim()) {
      await unlockSession(passphrase);
    } else if (!hardening) {
      await lockSessionRemote().catch(() => undefined);
    }

    apiKeyEl.value = '';
    iflytekApiKeyEl.value = '';
    encryptedMode = hasEncryptedKey(next.security);
    hasStoredKey = hasStoredCredential(next);
    hardeningEl.checked = next.security.hardeningEnabled;
    syncHardeningUi();
    apiKeyEl.placeholder = encryptedMode
      ? '已加密保存，留空则保持'
      : '已保存，留空则保持不变';
    iflytekApiKeyEl.placeholder = apiKeyEl.placeholder;
    keyHintEl.textContent = encryptedMode
      ? '凭证已加密存储。请保管好口令；浏览器重启后需在本页解锁。'
      : next.aiConfig.apiKey
        ? `当前 Key：${maskApiKey(next.aiConfig.apiKey)}（输入新值可替换）`
        : '凭证已保存';
    iflytekKeyHintEl.textContent = keyHintEl.textContent;
    const status = await fetchSecurityStatus();
    needsManualUnlock = encryptedMode && !status.unlocked;
    passGenHint.hidden = true;
    refreshTrustUi();
    syncHardeningUi();
    setMsg(next.enabled ? '已保存，主开关已自动开启' : '已保存', 'ok');
  } catch (err) {
    setMsg(err instanceof Error ? err.message : String(err), 'err');
  }
});

void load();
