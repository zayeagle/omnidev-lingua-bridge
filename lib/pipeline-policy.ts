import type { ResolveAiFailureReason } from './settings-store';

/** When AI resolve fails, only missing_key may degrade to Libre/free text. */
export function allowFreeTextFallback(
  reason: ResolveAiFailureReason,
): boolean {
  return reason === 'missing_key';
}
