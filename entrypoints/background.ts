import { handleAiRequest } from '../lib/ai-handler';
import { sanitizeErrorMessage } from '../lib/ai-client';
import { diagError, diagInfo, diagWarn } from '../lib/diag';
import { translateWithLibreTranslate } from '../lib/free-translate';
import {
  isExtensionPageSender,
  isExtensionRequest,
  isPageSpeechStateEvent,
  isSecurityRequest,
  validateExtensionRequest,
  validateSecurityRequest,
  type ExtensionRequest,
  type ExtensionResponse,
} from '../lib/messages';
import { siLiveItem } from '../lib/si-live';
import { normalizeSpeechMode } from '../lib/storage';
import { buildFreeExplain } from '../lib/vocab-explain';
import { createAiRateLimiter, SlidingWindowLimiter } from '../lib/rate-limit';
import { allowFreeTextFallback } from '../lib/pipeline-policy';
import {
  ensureAutoUnlocked,
  ensurePublicPrefsSynced,
  getSecurityStatus,
  lockSession,
  resolveAiConfigForRequest,
  unlockWithPassphrase,
} from '../lib/settings-store';

async function freeTranslate(
  texts: string[],
  targetLang: 'zh' | 'en',
): Promise<string[]> {
  return translateWithLibreTranslate(texts, targetLang);
}

/** Libre / free explain — used when no Key, or when AI Chat/translate fails. */
async function freeTextResponse(
  message: ExtensionRequest,
): Promise<ExtensionResponse | null> {
  if (message.type === 'ai.translate') {
    if (!message.texts?.length) {
      return { ok: true, translations: [] };
    }
    const target = message.targetLang === 'en' ? 'en' : 'zh';
    const translations = await freeTranslate(message.texts, target);
    return { ok: true, translations };
  }

  if (message.type === 'ai.explain') {
    const target = message.targetLang === 'en' ? 'en' : 'zh';
    const [translation] = await freeTranslate([message.text], target);
    const explained = await buildFreeExplain(message.text, translation ?? '', {
      targetLang: target,
      translateText: async (text) => {
        const [w] = await freeTranslate([text], target);
        return w ?? '';
      },
    });
    return { ok: true, ...explained };
  }

  // STT / TTS: no free fallback
  return null;
}

export default defineBackground(() => {
  const limiter = createAiRateLimiter();
  const securityLimiter = new SlidingWindowLimiter(12, 60_000);
  void ensurePublicPrefsSynced().then(() => ensureAutoUnlocked());

  browser.runtime.onInstalled.addListener(() => {
    void ensurePublicPrefsSynced().then(() => ensureAutoUnlocked());
  });

  browser.runtime.onStartup.addListener(() => {
    void ensureAutoUnlocked();
  });

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Caption × / page SI changes — persist so open popup can sync button + 实时状态.
    if (isPageSpeechStateEvent(message)) {
      void siLiveItem
        .setValue({
          tabId: sender.tab?.id ?? null,
          speechOnThisPage: message.speechOnThisPage,
          speechMode: normalizeSpeechMode(message.speechMode),
          rev: Date.now(),
        })
        .then(() => sendResponse({ ok: true }))
        .catch(() => sendResponse({ ok: false }));
      return true;
    }

    if (isSecurityRequest(message)) {
      void (async () => {
        try {
          if (!isExtensionPageSender(sender, browser.runtime.id)) {
            sendResponse({ ok: false, error: '安全操作仅允许在扩展设置/弹窗中进行' });
            return;
          }
          const secGate = securityLimiter.tryConsume('security');
          if (!secGate.ok) {
            sendResponse({ ok: false, error: secGate.error });
            return;
          }
          const shapeErr = validateSecurityRequest(message);
          if (shapeErr) {
            sendResponse({ ok: false, error: shapeErr });
            return;
          }
          if (message.type === 'security.unlock') {
            await unlockWithPassphrase(message.passphrase);
            sendResponse({ ok: true });
            return;
          }
          if (message.type === 'security.lock') {
            await lockSession();
            sendResponse({ ok: true });
            return;
          }
          const status = await getSecurityStatus();
          sendResponse({ ok: true, ...status });
        } catch (e) {
          sendResponse({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })();
      return true;
    }

    if (!isExtensionRequest(message)) {
      return false;
    }

    void (async () => {
      try {
        const shapeErr = validateExtensionRequest(message);
        if (shapeErr) {
          sendResponse({ ok: false, error: shapeErr });
          return;
        }
        const bucket = sender.tab?.id != null ? `tab:${sender.tab.id}` : 'global';
        const gate = limiter.tryConsume(bucket);
        if (!gate.ok) {
          sendResponse({ ok: false, error: gate.error });
          return;
        }

        const resolved = await resolveAiConfigForRequest();
        if (resolved.ok) {
          diagInfo('pipeline', `收到 ${message.type}`, {
            provider: resolved.settings.aiConfig.providerId,
            pipeline: resolved.settings.aiConfig.iflytekPipeline,
          });
          const result = await handleAiRequest(resolved.settings, message);
          if (result.ok) {
            sendResponse(result);
            return;
          }

          diagWarn('pipeline', `${message.type} 失败`, {
            error: 'error' in result ? result.error : 'unknown',
          });
          // Provider configured but failed → degrade text paths only (not STT/TTS).
          const fallback = await freeTextResponse(message).catch(() => null);
          if (fallback?.ok) {
            diagInfo(
              'pipeline',
              `${message.type} 供应商不可用，已降级到免费引擎`,
            );
            sendResponse(fallback);
            return;
          }
          sendResponse(result);
          return;
        }

        // Vault locked / incomplete iflytek: fail closed (no Libre exfil).
        if (!allowFreeTextFallback(resolved.reason)) {
          sendResponse({ ok: false, error: resolved.error });
          return;
        }

        // No API Key: free text translate / explain; speech stays in content.
        const free = await freeTextResponse(message);
        if (free) {
          sendResponse(free);
          return;
        }

        sendResponse({
          ok: false,
          error:
            '未配置 API Key：页面翻译可用免费引擎；视频同传需配置 Key，或使用麦克风免费语音模式',
        });
      } catch (e) {
        const resolved = await resolveAiConfigForRequest().catch(() => null);
        if (
          resolved &&
          !resolved.ok &&
          !allowFreeTextFallback(resolved.reason)
        ) {
          sendResponse({ ok: false, error: resolved.error });
          return;
        }
        // Unexpected throw with Key: still try free text fallback.
        const fallback = await freeTextResponse(message).catch(() => null);
        if (fallback?.ok) {
          sendResponse(fallback);
          return;
        }
        const raw = e instanceof Error ? e.message : String(e);
        const key =
          resolved && resolved.ok ? resolved.settings.aiConfig.apiKey : '';
        const secret =
          resolved && resolved.ok
            ? resolved.settings.aiConfig.iflytekApiSecret
            : '';
        const error = sanitizeErrorMessage(raw, key, secret) || '请求失败';
        diagError('pipeline', `未捕获异常：${error}`);
        sendResponse({ ok: false, error });
      }
    })();

    return true;
  });
});
