/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  ensureCaptionRoot,
  hideCue,
  showCue,
  removeCaptionRoot,
  getCaptionHistoryForTest,
  setCaptionCloseHandler,
} from './caption-ui';

describe('caption-ui (F4 UNIT)', () => {
  beforeEach(() => {
    removeCaptionRoot(document);
    setCaptionCloseHandler(null);
  });

  it('TC-F4-U01 Happy: showCue renders source above translation', () => {
    showCue({ text: 'Hello', translation: '你好' }, document);
    const root = ensureCaptionRoot(document);
    expect(root.textContent).not.toContain('原文');
    expect(root.textContent).not.toContain('译文');
    expect(root.textContent).toContain('Hello');
    expect(root.textContent).toContain('你好');
    expect(root.style.opacity).toBe('1');
    expect(getCaptionHistoryForTest().length).toBe(1);
    hideCue(document);
    expect(root.style.opacity).toBe('0');
  });

  it('history can be closed back to current cue', () => {
    showCue({ text: 'A', translation: '甲' }, document);
    const root = ensureCaptionRoot(document);
    const histBtn = root.querySelector('[data-lb-hist-btn]') as HTMLButtonElement;
    histBtn.click();
    expect(root.textContent).toContain('历史');
    expect(root.textContent).toContain('收起');
    histBtn.click();
    expect(root.textContent).not.toContain('收起');
    expect(root.textContent).toContain('甲');
  });

  it('legacy string showCue still works', () => {
    showCue('仅译文', document);
    const root = ensureCaptionRoot(document);
    expect(root.textContent).toContain('仅译文');
  });

  it('close button invokes close handler (stop SI)', () => {
    const onClose = vi.fn();
    setCaptionCloseHandler(onClose);
    showCue({ text: 'Hi', translation: '你好' }, document);
    const root = ensureCaptionRoot(document);
    const closeBtn = root.querySelector(
      'button[aria-label="关闭同传"]',
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps caption panel inside the viewport after tall content', () => {
    Object.defineProperty(window, 'innerHeight', { value: 400, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    showCue({ text: 'short', translation: '短' }, document);
    const root = ensureCaptionRoot(document);
    root.style.left = '20px';
    root.style.top = '8px';
    root.style.bottom = 'auto';
    root.style.transform = 'none';
    // Tall cue near the top must not push header above y=0.
    showCue(
      {
        text: 'A\n'.repeat(40),
        translation: '甲\n'.repeat(40),
      },
      document,
    );
    const rect = root.getBoundingClientRect();
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });
});
