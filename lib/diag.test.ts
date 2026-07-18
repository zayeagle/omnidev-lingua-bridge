import { describe, expect, it } from 'vitest';
import { StageError, formatDiagError, wrapStageError } from './diag';

describe('diag stage errors', () => {
  it('prefixes stage label for toasts', () => {
    const err = new StageError('mt', 'HMAC signature does not match');
    expect(err.message).toBe('[翻译] HMAC signature does not match');
    expect(formatDiagError(err)).toContain('[翻译]');
  });

  it('wrapStageError keeps existing StageError', () => {
    const inner = new StageError('stt', '超时');
    expect(wrapStageError('mt', inner)).toBe(inner);
  });
});
