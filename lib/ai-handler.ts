import {
  translateTexts,
  explainSelection,
  transcribeAudio,
  synthesizeSpeech,
  sanitizeErrorMessage,
} from './ai-client';
import {
  diagError,
  diagInfo,
  diagWarn,
  StageError,
  stageLabel,
  wrapStageError,
  type DiagStage,
} from './diag';
import {
  iflytekSimultTranscribe,
  iflytekSpeak,
  iflytekTranscribeAudio,
  iflytekTranslateTexts,
  isIflytekSimultPipeline,
  shouldUseIflytek,
} from './iflytek';
import { mapIflytekAuthError } from './iflytek/auth';
import { detectLang } from './lang-detect';
import type { ExtensionRequest, ExtensionResponse } from './messages';
import type { ExtensionSettings } from './storage';
import { hasValidApiKey, isIflytekProvider } from './storage';

function resolveSpeechTargetLang(
  text: string,
  requested?: 'zh' | 'en',
): 'zh' | 'en' {
  if (requested === 'zh' || requested === 'en') return requested;
  return detectLang(text) === 'zh' ? 'en' : 'zh';
}

function fail(
  stage: DiagStage,
  reason: string,
  apiKey: string,
): ExtensionResponse {
  const staged = new StageError(stage, reason);
  const error = sanitizeErrorMessage(staged.message, apiKey);
  return { ok: false, error };
}

export async function handleAiRequest(
  settings: ExtensionSettings,
  message: ExtensionRequest,
): Promise<ExtensionResponse> {
  if (!hasValidApiKey(settings.aiConfig)) {
    return fail(
      'config',
      isIflytekProvider(settings.aiConfig)
        ? '请先在设置页完整填写讯飞 APPID / APIKey / APISecret'
        : '请先在设置页配置有效的 API Key',
      settings.aiConfig.apiKey,
    );
  }

  const { aiConfig } = settings;
  const iflytek = shouldUseIflytek(aiConfig);
  const simult = isIflytekSimultPipeline(aiConfig);
  let stage: DiagStage = 'pipeline';

  try {
    if (message.type === 'ai.translate') {
      stage = 'translate';
      if (!message.texts?.length) {
        return { ok: true, translations: [] };
      }
      if (message.texts.every((t) => !t.trim())) {
        return { ok: true, translations: message.texts.map(() => '') };
      }
      // Text MT always uses provider (default 机器翻译), including when SI is 同声传译.
      diagInfo(stage, `开始 · provider=${iflytek ? 'iflytek' : 'openai'} · n=${message.texts.length}`);
      const translations = iflytek
        ? await iflytekTranslateTexts(aiConfig, message.texts, {
            sourceLang: message.sourceLang,
            targetLang: message.targetLang,
          })
        : await translateTexts(aiConfig, message.texts, {
            sourceLang: message.sourceLang,
            targetLang: message.targetLang,
          });
      diagInfo(stage, `成功 · 返回 ${translations.length} 条`);
      return { ok: true, translations };
    }

    if (message.type === 'ai.explain') {
      stage = 'explain';
      if (iflytek) {
        return fail(
          'explain',
          '讯飞预设暂不支持 AI 精讲，请改用免费路径或其它供应商',
          aiConfig.apiKey,
        );
      }
      diagInfo(stage, '开始');
      const result = await explainSelection(aiConfig, message.text, {
        targetLang: message.targetLang === 'en' ? 'en' : 'zh',
      });
      diagInfo(stage, '成功');
      return { ok: true, ...result };
    }

    if (message.type === 'ai.speak') {
      stage = 'tts';
      // Allowed for all pipelines: voice SI must be able to speak either
      // direction when embedded simult TTS is missing.
      diagInfo(stage, `开始 · chars=${message.text.trim().length}`);
      const audio = iflytek
        ? await iflytekSpeak(aiConfig, message.text)
        : await synthesizeSpeech(aiConfig, message.text, {
            voice: message.voice,
          });
      diagInfo(stage, `成功 · audioBytes≈${Math.round((audio.audioBase64.length * 3) / 4)}`);
      return { ok: true, ...audio };
    }

    // ai.transcribe
    if (simult) {
      stage = 'simult';
      const wantAudio =
        message.wantAudio === true ||
        (message.wantAudio !== false && settings.speechMode === 'voice');
      diagInfo(stage, `开始 · wantAudio=${wantAudio} · mime=${message.mimeType}`);
      const result = await iflytekSimultTranscribe(
        aiConfig,
        message.audioBase64,
        message.mimeType,
        {
          targetLang: message.targetLang === 'en' ? 'en' : 'zh',
          wantAudio,
        },
      );
      diagInfo(stage, '成功', {
        textLen: result.text.length,
        translationLen: result.translation.length,
        hasAudio: !!result.audioBase64,
      });
      return {
        ok: true,
        text: result.text,
        translation: result.translation,
        audioBase64: result.audioBase64,
        mimeType: result.mimeType,
      };
    }

    stage = 'stt';
    diagInfo(stage, `开始 · provider=${iflytek ? 'iflytek' : 'openai'} · mime=${message.mimeType}`);
    let text: string;
    try {
      text = (
        iflytek
          ? await iflytekTranscribeAudio(
              aiConfig,
              message.audioBase64,
              message.mimeType,
            )
          : await transcribeAudio(aiConfig, message.audioBase64, message.mimeType)
      ).trim();
    } catch (e) {
      throw wrapStageError('stt', e, '识别失败');
    }
    diagInfo(stage, text ? `成功 · chars=${text.length}` : '成功但无识别文本（跳过翻译）', {
      preview: text.slice(0, 80),
    });

    let translation: string | undefined;
    if (text) {
      stage = 'mt';
      const targetLang = resolveSpeechTargetLang(text, message.targetLang);
      diagInfo(stage, `开始 · target=${targetLang} · sourceChars=${text.length}`);
      try {
        const [t] = iflytek
          ? await iflytekTranslateTexts(aiConfig, [text], {
              sourceLang: 'auto',
              targetLang,
            })
          : await translateTexts(aiConfig, [text], {
              sourceLang: 'auto',
              targetLang,
            });
        translation = (t ?? '').trim() || undefined;
        if (!translation) {
          diagWarn(stage, '接口返回空译文', { sourcePreview: text.slice(0, 80) });
        } else {
          diagInfo(stage, `成功 · chars=${translation.length}`, {
            preview: translation.slice(0, 80),
          });
        }
      } catch (e) {
        throw wrapStageError('mt', e, '翻译失败');
      }
    } else {
      diagWarn('mt', '跳过：识别结果为空，未调用机器翻译');
    }

    // Voice mode: always try to synthesize the translation (zh↔en).
    let audioBase64: string | undefined;
    let mimeType: string | undefined;
    const speakText = (translation || text || '').trim();
    const wantTts =
      message.wantAudio === true ||
      (message.wantAudio !== false && settings.speechMode === 'voice');
    if (wantTts && speakText) {
      stage = 'tts';
      diagInfo(stage, `开始 · chars=${speakText.length} · lang=${detectLang(speakText)}`);
      try {
        const audio = iflytek
          ? await iflytekSpeak(aiConfig, speakText)
          : await synthesizeSpeech(aiConfig, speakText, {});
        audioBase64 = audio.audioBase64;
        mimeType = audio.mimeType;
        diagInfo(stage, `成功 · hasAudio=${!!audioBase64}`);
      } catch (e) {
        diagWarn(
          stage,
          e instanceof Error ? e.message : '合成失败（页面将回退朗读）',
        );
      }
    }

    return { ok: true, text, translation, audioBase64, mimeType };
  } catch (e) {
    const staged = wrapStageError(stage, e, '请求失败');
    const authProduct =
      staged.stage === 'stt'
        ? 'stt'
        : staged.stage === 'mt' || staged.stage === 'translate'
          ? 'mt'
          : staged.stage === 'tts'
            ? 'tts'
            : staged.stage === 'simult'
              ? 'simult'
              : undefined;
    const mapped = iflytek
      ? mapIflytekAuthError(staged.reason, authProduct)
      : staged.reason;
    const finalMsg = mapped.startsWith('[')
      ? mapped
      : `[${stageLabel(staged.stage)}] ${mapped}`;
    const error = sanitizeErrorMessage(
      finalMsg,
      aiConfig.apiKey,
      aiConfig.iflytekApiSecret,
    );
    diagError(staged.stage, `对外错误：${error}`, {
      reason: sanitizeErrorMessage(
        staged.reason,
        aiConfig.apiKey,
        aiConfig.iflytekApiSecret,
      ),
    });
    return { ok: false, error };
  }
}
