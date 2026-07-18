import type { ExplainResult } from './vocab-explain';
import { t } from './i18n';

const ROOT_ID = 'lingua-bridge-bubble';

/** Bubble chrome follows browser/OS UI language. */
function bubbleUi() {
  return {
    translate: t('bubbleTranslate'),
    resultTitle: t('bubbleResultTitle'),
    source: t('bubbleOriginal'),
    translation: t('bubbleTranslated'),
    keywords: t('bubbleKeywords'),
    fold: t('bubbleFold'),
    expand: t('bubbleExpand'),
    closeResult: t('bubbleCloseResult'),
    examplePrefix: t('bubbleExamplePrefix'),
    fail: t('bubbleFail'),
    pageTranslate: t('bubblePageTranslate'),
    pageTranslateHint: t('bubblePageTranslateHint'),
    more: t('bubbleMore'),
    close: t('bubbleClose'),
    siToggle: t('bubbleSiToggle'),
    siHint: t('bubbleSiHint'),
  };
}

export type BubbleActions = {
  /** Translate selection and show keyword glosses in one step. */
  onTranslateSelection: (text: string) => Promise<void>;
  onTranslatePage: () => Promise<void>;
  /** Mic / SI for this page only — default off; not persisted across navigations. */
  speechOnThisPage: boolean;
  /** When true, SI uses video track; otherwise mic (free path). */
  hasApiKey?: boolean;
  /** Return ok:false to revert the switch when start fails. */
  onToggleSpeechThisPage: (on: boolean) => boolean | { ok: boolean; error?: string };
};

/** Brand tokens — sky → teal, high contrast on page chrome. */
const C = {
  sky: '#0284c7',
  skyBright: '#0ea5e9',
  teal: '#0d9488',
  tealBright: '#14b8a6',
  ink: '#0f172a',
  slate: '#475569',
  mute: '#94a3b8',
  line: 'rgba(14, 165, 233, 0.22)',
  white: '#ffffff',
  danger: '#e11d48',
};

const FONT =
  '650 13px/1 "Segoe UI Variable Text Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

const ICONS = {
  translate:
    'M5 8h6M5 12h4m7-7l3.5 12m-3.5-12L12 17M10 20h8M13.5 8c2.2 0 4 2.2 4 5s-1.8 5-4 5',
  page: 'M7 5h10a1 1 0 011 1v12a1 1 0 01-1 1H7a1 1 0 01-1-1V6a1 1 0 011-1zm2 4h6M9 13h6M9 17h4',
  close: 'M7 7l10 10M17 7L7 17',
  mic: 'M12 3a3 3 0 013 3v6a3 3 0 11-6 0V6a3 3 0 013-3zm0 14v3m-4 0h8M8 11a4 4 0 008 0',
  more: 'M12 6h.01M12 12h.01M12 18h.01',
  chevron: 'M6 9l6 6 6-6',
};

function makeIcon(doc: Document, d: string, size = 15): SVGSVGElement {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2.25');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path);
  return svg;
}

type SelBox = { left: number; top: number; right: number; bottom: number };

let selectionAnchor: SelBox | null = null;

function clampPos(
  left: number,
  top: number,
  width: number,
  height: number,
): { left: number; top: number } {
  return {
    left: Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8)),
    top: Math.min(Math.max(8, top), Math.max(8, window.innerHeight - height - 8)),
  };
}

function applyRootPos(
  root: HTMLElement,
  left: number,
  top: number,
  animate: boolean,
): void {
  root.style.transition = animate
    ? 'left 220ms ease, top 220ms ease, width 220ms ease'
    : 'none';
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
}

/** After translate / with result panel: dock to right edge, upper-middle. */
function positionDockRightCenter(root: HTMLElement, animate = false): void {
  const width = Math.min(
    root.querySelector('[data-lb-bubble-panel]') ? 360 : 220,
    window.innerWidth - 24,
  );
  root.style.width = `${width}px`;
  const place = () => {
    const h = Math.max(root.offsetHeight || 48, 48);
    // ~22% from top ≈ mid-upper; keep panel fully in viewport.
    const preferTop = window.innerHeight * 0.22;
    const pos = clampPos(window.innerWidth - width - 16, preferTop, width, h);
    applyRootPos(root, pos.left, pos.top, animate);
  };
  if (animate) requestAnimationFrame(place);
  else place();
}

/** Idle toolbar: beside the selection (prefer above / below the range). */
function positionNearSelection(
  root: HTMLElement,
  box: SelBox,
  animate = false,
): void {
  const width = Math.min(220, window.innerWidth - 16);
  root.style.width = `${width}px`;
  const left = Math.min(
    Math.max(8, (box.left + box.right) / 2 - width / 2),
    window.innerWidth - width - 8,
  );
  const preferAbove = box.top > 72;
  const top = preferAbove
    ? Math.max(8, box.top - 56)
    : Math.min(box.bottom + 12, window.innerHeight - 72);
  const pos = clampPos(left, top, width, 48);
  applyRootPos(root, pos.left, pos.top, animate);
}

function rememberSelectionRect(rect: DOMRect): void {
  selectionAnchor = {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

/** Slide to right-center when translation result is shown. */
function repositionBubbleForResult(doc: Document = document): void {
  const root = doc.getElementById(ROOT_ID);
  if (!root || root.dataset.lbPinned === '1') return;
  positionDockRightCenter(root, true);
}

export function hideSelectionBubble(doc: Document = document): void {
  doc.getElementById(ROOT_ID)?.remove();
  selectionAnchor = null;
}

/** Hide bubble and clear selection so mouseup does not reopen it. */
export function dismissSelectionBubble(doc: Document = document): void {
  hideSelectionBubble(doc);
  const sel = doc.getSelection?.() ?? window.getSelection();
  sel?.removeAllRanges();
  doc.dispatchEvent(new CustomEvent('lb-bubble-dismiss'));
}

export function isEventInsideBubble(
  target: EventTarget | null,
  doc: Document = document,
): boolean {
  const root = doc.getElementById(ROOT_ID);
  return !!(root && target instanceof Node && root.contains(target));
}

/**
 * @deprecated Scroll no longer closes the bubble; kept for tests/compat.
 */
export function shouldKeepBubbleOnPageScroll(
  _scrollTarget: EventTarget | null = null,
  _doc: Document = document,
): boolean {
  return true;
}

/** Wheel over result panel: scroll panel only; never auto-close bubble. */
function bindScrollContainment(root: HTMLElement): void {
  root.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      const panel = root.querySelector(
        '[data-lb-bubble-panel]',
      ) as HTMLElement | null;
      const scrollable =
        panel &&
        panel.style.display !== 'none' &&
        panel.scrollHeight > panel.clientHeight + 1
          ? panel
          : null;
      if (!scrollable) return;
      e.stopPropagation();
    },
    { passive: true },
  );
}

function setBusy(btn: HTMLButtonElement, busy: boolean, label: string): void {
  btn.disabled = busy;
  btn.style.opacity = busy ? '0.75' : '1';
  btn.style.transform = busy ? 'scale(0.98)' : 'scale(1)';
  const span = btn.querySelector('span');
  if (span) span.textContent = busy ? '…' : label;
}

function glassShell(): Record<string, string> {
  return {
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(240,249,255,0.96) 100%)',
    border: `1px solid ${C.line}`,
    boxShadow:
      '0 0 0 1px rgba(255,255,255,0.8) inset, 0 8px 28px rgba(2, 132, 199, 0.18), 0 2px 8px rgba(15, 23, 42, 0.08)',
    backdropFilter: 'blur(14px)',
    WebkitBackdropFilter: 'blur(14px)',
  };
}

function makeTranslateBtn(
  doc: Document,
  label: string,
  fn: () => Promise<void>,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.title = label;
  const span = doc.createElement('span');
  span.textContent = label;
  b.appendChild(makeIcon(doc, ICONS.translate, 15));
  b.appendChild(span);
  Object.assign(b.style, {
    flex: '1 1 auto',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    minWidth: '0',
    height: '36px',
    margin: '0',
    padding: '0 16px',
    border: '0',
    borderRadius: '999px',
    background: `linear-gradient(135deg, ${C.skyBright} 0%, ${C.tealBright} 100%)`,
    color: C.white,
    font: FONT,
    letterSpacing: '0.02em',
    cursor: 'pointer',
    boxShadow:
      '0 4px 14px rgba(14, 165, 233, 0.38), inset 0 1px 0 rgba(255,255,255,0.28)',
    transition:
      'background 140ms ease, transform 120ms ease, box-shadow 140ms ease, opacity 120ms ease',
  } as CSSStyleDeclaration);

  b.addEventListener('mouseenter', () => {
    if (b.disabled) return;
    b.style.boxShadow =
      '0 6px 18px rgba(14, 165, 233, 0.48), inset 0 1px 0 rgba(255,255,255,0.35)';
    b.style.transform = 'translateY(-1px)';
  });
  b.addEventListener('mouseleave', () => {
    b.style.boxShadow =
      '0 4px 14px rgba(14, 165, 233, 0.38), inset 0 1px 0 rgba(255,255,255,0.28)';
    b.style.transform = 'scale(1)';
  });

  const run = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (b.disabled) return;
    setBusy(b, true, label);
    try {
      await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setBubbleError(msg, doc);
      throw err;
    } finally {
      setBusy(b, false, label);
    }
  };
  b.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    void run(e).catch(() => undefined);
  });
  return b;
}

function makeIconBtn(
  doc: Document,
  title: string,
  iconPath: string,
  onClick: (e: Event) => void,
  opts?: { accent?: boolean; active?: boolean },
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.appendChild(makeIcon(doc, iconPath, 15));
  Object.assign(b.style, {
    flex: '0 0 34px',
    width: '34px',
    height: '34px',
    margin: '0',
    padding: '0',
    border: '0',
    borderRadius: '999px',
    background: opts?.active
      ? 'rgba(14, 165, 233, 0.18)'
      : 'rgba(148, 163, 184, 0.14)',
    color: opts?.active ? C.sky : C.mute,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    transition: 'background 120ms ease, color 120ms ease',
  } as CSSStyleDeclaration);
  b.addEventListener('mouseenter', () => {
    if (opts?.accent) {
      b.style.background = 'rgba(225, 29, 72, 0.12)';
      b.style.color = C.danger;
    } else {
      b.style.background = 'rgba(14, 165, 233, 0.16)';
      b.style.color = C.sky;
    }
  });
  b.addEventListener('mouseleave', () => {
    b.style.background = opts?.active
      ? 'rgba(14, 165, 233, 0.18)'
      : 'rgba(148, 163, 184, 0.14)';
    b.style.color = opts?.active ? C.sky : C.mute;
  });
  b.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
  return b;
}

function enableDrag(root: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;
  let activeId: number | null = null;

  const onMove = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== activeId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    root.style.transition = 'none';
    const w = root.offsetWidth || 220;
    const h = root.offsetHeight || 48;
    const left = Math.min(Math.max(8, origLeft + dx), window.innerWidth - w - 8);
    const top = Math.min(Math.max(8, origTop + dy), window.innerHeight - h - 8);
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  };

  const onEnd = (e: PointerEvent) => {
    if (!dragging || e.pointerId !== activeId) return;
    dragging = false;
    activeId = null;
    handle.style.cursor = 'grab';
    if (moved) root.dataset.lbPinned = '1';
    root.dataset.lbDragging = moved ? '1' : '0';
    window.setTimeout(() => {
      delete root.dataset.lbDragging;
    }, 80);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    // Allow drag from brand / bar chrome; not from action buttons or menu rows.
    if (t?.closest('button, [role="switch"], a, input')) return;
    dragging = true;
    moved = false;
    activeId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    origLeft = parseFloat(root.style.left || '0');
    origTop = parseFloat(root.style.top || '0');
    handle.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onEnd, true);
    window.addEventListener('pointercancel', onEnd, true);
    e.preventDefault();
    e.stopPropagation();
  });
}

function makeMenuItem(
  doc: Document,
  label: string,
  hint: string,
  iconPath: string,
  onActivate: () => void | Promise<void>,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  Object.assign(b.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    margin: '0',
    padding: '10px 10px',
    border: '0',
    borderRadius: '12px',
    background: 'transparent',
    color: C.ink,
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 120ms ease',
  } as CSSStyleDeclaration);

  const iconWrap = doc.createElement('div');
  Object.assign(iconWrap.style, {
    flex: '0 0 32px',
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: 'rgba(14, 165, 233, 0.12)',
    color: C.sky,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSStyleDeclaration);
  iconWrap.appendChild(makeIcon(doc, iconPath, 15));

  const labels = doc.createElement('div');
  Object.assign(labels.style, { flex: '1', minWidth: '0' } as CSSStyleDeclaration);
  const title = doc.createElement('div');
  title.textContent = label;
  Object.assign(title.style, {
    font: '650 13px/1.25 "Segoe UI", "PingFang SC", sans-serif',
    color: C.ink,
  } as CSSStyleDeclaration);
  const sub = doc.createElement('div');
  sub.textContent = hint;
  Object.assign(sub.style, {
    marginTop: '2px',
    font: '400 11px/1.3 "Segoe UI", "PingFang SC", sans-serif',
    color: C.mute,
  } as CSSStyleDeclaration);
  labels.appendChild(title);
  labels.appendChild(sub);

  b.appendChild(iconWrap);
  b.appendChild(labels);

  b.addEventListener('mouseenter', () => {
    b.style.background = 'rgba(14, 165, 233, 0.08)';
  });
  b.addEventListener('mouseleave', () => {
    b.style.background = 'transparent';
  });
  b.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    void Promise.resolve(onActivate()).catch(() => undefined);
  });
  return b;
}

/** Collapsed mic/video SI row inside the more menu. */
function makeSpeechMenuRow(
  doc: Document,
  on: boolean,
  onToggle: (next: boolean) => boolean | { ok: boolean; error?: string },
  hasApiKey: boolean,
): HTMLElement {
  const row = doc.createElement('div');
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    borderRadius: '12px',
    background: on ? 'rgba(14, 165, 233, 0.08)' : 'transparent',
    userSelect: 'none',
  } as CSSStyleDeclaration);

  const iconWrap = doc.createElement('div');
  Object.assign(iconWrap.style, {
    flex: '0 0 32px',
    width: '32px',
    height: '32px',
    borderRadius: '10px',
    background: on
      ? `linear-gradient(135deg, ${C.skyBright}, ${C.tealBright})`
      : 'rgba(148, 163, 184, 0.16)',
    color: on ? C.white : C.slate,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  } as CSSStyleDeclaration);
  iconWrap.appendChild(makeIcon(doc, ICONS.mic, 15));

  const labels = doc.createElement('div');
  Object.assign(labels.style, { flex: '1', minWidth: '0' } as CSSStyleDeclaration);
  const title = doc.createElement('div');
  title.textContent = hasApiKey
    ? t('bubbleSiVideoTitle')
    : t('bubbleSiMicTitle');
  Object.assign(title.style, {
    font: '650 13px/1.25 "Segoe UI", "PingFang SC", sans-serif',
    color: C.ink,
  } as CSSStyleDeclaration);
  const sub = doc.createElement('div');
  sub.textContent = hasApiKey
    ? t('bubbleSiVideoHint')
    : t('bubbleSiMicHint');
  Object.assign(sub.style, {
    marginTop: '2px',
    font: '400 11px/1.3 "Segoe UI", "PingFang SC", sans-serif',
    color: C.mute,
  } as CSSStyleDeclaration);
  labels.appendChild(title);
  labels.appendChild(sub);

  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-checked', on ? 'true' : 'false');
  toggle.title = on ? t('bubbleSiTurnOff') : t('bubbleSiTurnOn');
  Object.assign(toggle.style, {
    flex: '0 0 42px',
    width: '42px',
    height: '24px',
    margin: '0',
    padding: '0',
    border: '0',
    borderRadius: '999px',
    background: on
      ? `linear-gradient(135deg, ${C.skyBright}, ${C.tealBright})`
      : 'rgba(148, 163, 184, 0.35)',
    cursor: 'pointer',
    position: 'relative',
    transition: 'background 140ms ease',
  } as CSSStyleDeclaration);

  const knob = doc.createElement('span');
  Object.assign(knob.style, {
    position: 'absolute',
    top: '2px',
    left: on ? '20px' : '2px',
    width: '20px',
    height: '20px',
    borderRadius: '999px',
    background: C.white,
    boxShadow: '0 1px 4px rgba(15, 23, 42, 0.22)',
    transition: 'left 140ms ease',
  } as CSSStyleDeclaration);
  toggle.appendChild(knob);

  const applyVisual = (next: boolean) => {
    toggle.setAttribute('aria-checked', next ? 'true' : 'false');
    toggle.style.background = next
      ? `linear-gradient(135deg, ${C.skyBright}, ${C.tealBright})`
      : 'rgba(148, 163, 184, 0.35)';
    knob.style.left = next ? '20px' : '2px';
    iconWrap.style.background = next
      ? `linear-gradient(135deg, ${C.skyBright}, ${C.tealBright})`
      : 'rgba(148, 163, 184, 0.16)';
    iconWrap.style.color = next ? C.white : C.slate;
    row.style.background = next ? 'rgba(14, 165, 233, 0.08)' : 'transparent';
    toggle.title = next ? '关闭本页同传' : '打开本页同传';
  };

  toggle.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const next = toggle.getAttribute('aria-checked') !== 'true';
    const result = onToggle(next);
    const ok = typeof result === 'boolean' ? result : result.ok;
    applyVisual(ok ? next : !next);
  });

  row.appendChild(iconWrap);
  row.appendChild(labels);
  row.appendChild(toggle);
  return row;
}

/** Compact bar: 翻译 + ⋯ more (整页 / 同传) + close. */
export function showSelectionBubble(
  rect: DOMRect,
  selectedText: string,
  actions: BubbleActions,
  doc: Document = document,
): void {
  hideSelectionBubble(doc);
  const text = selectedText.trim();
  if (!text) return;

  const root = doc.createElement('div');
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '2147483646',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    font: FONT,
    pointerEvents: 'auto',
    animation: 'lb-bubble-in 160ms ease-out',
  } as CSSStyleDeclaration);
  rememberSelectionRect(rect);
  positionNearSelection(root, selectionAnchor!, false);

  if (!doc.getElementById('lb-bubble-keyframes')) {
    const style = doc.createElement('style');
    style.id = 'lb-bubble-keyframes';
    style.textContent = `
@keyframes lb-bubble-in {
  from { opacity: 0; transform: translateY(6px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes lb-more-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}`;
    doc.documentElement.appendChild(style);
  }

  const bar = doc.createElement('div');
  Object.assign(bar.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '5px 5px 5px 6px',
    borderRadius: '999px',
    cursor: 'grab',
    userSelect: 'none',
    ...glassShell(),
  } as CSSStyleDeclaration);

  const brand = doc.createElement('div');
  brand.title = 'Lingua Bridge · 拖动';
  Object.assign(brand.style, {
    flex: '0 0 28px',
    width: '28px',
    height: '28px',
    borderRadius: '999px',
    background: `linear-gradient(145deg, ${C.skyBright}, ${C.tealBright})`,
    color: C.white,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    font: '800 11px/1 "Segoe UI", "PingFang SC", sans-serif',
    letterSpacing: '-0.04em',
    boxShadow: '0 2px 8px rgba(14, 165, 233, 0.45)',
    cursor: 'grab',
  } as CSSStyleDeclaration);
  brand.textContent = '文';

  const ui = bubbleUi();
  const translateBtn = makeTranslateBtn(doc, ui.translate, async () => {
    // Slide to right-center as soon as translate is clicked.
    if (root.dataset.lbPinned !== '1') {
      positionDockRightCenter(root, true);
    }
    await actions.onTranslateSelection(text);
  });

  const moreMenu = doc.createElement('div');
  moreMenu.setAttribute('data-lb-more-menu', '1');
  Object.assign(moreMenu.style, {
    display: 'none',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px',
    borderRadius: '16px',
    animation: 'lb-more-in 140ms ease-out',
    ...glassShell(),
  } as CSSStyleDeclaration);

  moreMenu.appendChild(
    makeMenuItem(
      doc,
      ui.pageTranslate,
      ui.pageTranslateHint,
      ICONS.page,
      async () => {
        try {
          hideSelectionBubble(doc);
          await actions.onTranslatePage();
        } catch (err) {
          void err;
        }
      },
    ),
  );
  moreMenu.appendChild(
    makeSpeechMenuRow(
      doc,
      !!actions.speechOnThisPage,
      (next) => actions.onToggleSpeechThisPage(next),
      !!actions.hasApiKey,
    ),
  );

  let moreOpen = false;
  const paintMoreBtn = () => {
    const lit = moreOpen || !!actions.speechOnThisPage;
    moreBtn.style.background = lit
      ? 'rgba(14, 165, 233, 0.18)'
      : 'rgba(148, 163, 184, 0.14)';
    moreBtn.style.color = lit ? C.sky : C.mute;
    moreBtn.setAttribute('aria-expanded', moreOpen ? 'true' : 'false');
  };
  const moreBtn = makeIconBtn(doc, ui.more, ICONS.more, () => {
    moreOpen = !moreOpen;
    moreMenu.style.display = moreOpen ? 'flex' : 'none';
    paintMoreBtn();
  });
  moreBtn.setAttribute('aria-expanded', 'false');
  moreBtn.setAttribute('aria-haspopup', 'true');
  moreBtn.addEventListener('mouseleave', () => paintMoreBtn());
  paintMoreBtn();

  // Dot when SI already on this page
  if (actions.speechOnThisPage) {
    const dot = doc.createElement('span');
    Object.assign(dot.style, {
      position: 'absolute',
      top: '6px',
      right: '6px',
      width: '7px',
      height: '7px',
      borderRadius: '999px',
      background: C.tealBright,
      boxShadow: '0 0 0 2px #fff',
    } as CSSStyleDeclaration);
    moreBtn.appendChild(dot);
  }

  const close = makeIconBtn(
    doc,
    ui.close,
    ICONS.close,
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismissSelectionBubble(doc);
    },
    { accent: true },
  );
  close.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismissSelectionBubble(doc);
  });

  bar.appendChild(brand);
  bar.appendChild(translateBtn);
  bar.appendChild(moreBtn);
  bar.appendChild(close);

  const panel = doc.createElement('div');
  panel.setAttribute('data-lb-bubble-panel', '1');
  Object.assign(panel.style, {
    display: 'none',
    padding: '14px 16px',
    borderRadius: '16px',
    background: 'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
    border: `1px solid ${C.line}`,
    borderLeft: `3px solid ${C.skyBright}`,
    boxShadow:
      '0 12px 36px rgba(2, 132, 199, 0.16), 0 2px 8px rgba(15, 23, 42, 0.06)',
    maxHeight: '260px',
    overflow: 'auto',
    color: C.ink,
    cursor: 'grab',
  } as CSSStyleDeclaration);

  root.appendChild(bar);
  root.appendChild(moreMenu);
  root.appendChild(panel);
  enableDrag(root, bar);
  enableDrag(root, brand);
  enableDrag(root, panel);
  bindScrollContainment(root);
  doc.documentElement.appendChild(root);
}

export function setBubbleError(message: string, doc: Document = document): void {
  const panel = doc.querySelector(
    `#${ROOT_ID} [data-lb-bubble-panel]`,
  ) as HTMLElement | null;
  if (!panel) return;
  panel.style.display = 'block';
  panel.style.borderLeftColor = C.danger;
  panel.replaceChildren();
  const body = doc.createElement('div');
  body.textContent = message || t('bubbleFail');
  Object.assign(body.style, {
    font: '500 13px/1.5 "Segoe UI", "PingFang SC", sans-serif',
    color: C.danger,
  } as CSSStyleDeclaration);
  panel.appendChild(body);
  repositionBubbleForResult(doc);
}

export function setBubbleResult(
  translation: string,
  terms: ExplainResult['terms'] = [],
  docOrSource?: Document | string,
  maybeDoc?: Document,
  _targetLang?: 'zh' | 'en',
): void {
  const sourceText =
    typeof docOrSource === 'string' ? docOrSource.trim() : '';
  const doc =
    typeof docOrSource === 'object' && docOrSource
      ? docOrSource
      : (maybeDoc ?? document);
  const ui = bubbleUi();
  const panel = doc.querySelector(
    `#${ROOT_ID} [data-lb-bubble-panel]`,
  ) as HTMLElement | null;
  if (!panel) return;
  panel.style.display = 'block';
  panel.style.borderLeftColor = C.skyBright;
  panel.style.maxHeight = '320px';
  panel.replaceChildren();

  let folded = false;
  const head = doc.createElement('div');
  Object.assign(head.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '10px',
  } as CSSStyleDeclaration);

  const title = doc.createElement('div');
  title.textContent = ui.resultTitle;
  Object.assign(title.style, {
    flex: '1',
    font: '700 11px/1.2 "Segoe UI", "PingFang SC", sans-serif',
    color: C.sky,
    letterSpacing: '0.08em',
  } as CSSStyleDeclaration);

  const content = doc.createElement('div');
  content.setAttribute('data-lb-result-body', '1');

  const foldBtn = makeIconBtn(doc, ui.fold, ICONS.chevron, () => {
    folded = !folded;
    content.style.display = folded ? 'none' : 'block';
    foldBtn.style.transform = folded ? 'rotate(-90deg)' : 'none';
    foldBtn.title = folded ? ui.expand : ui.fold;
  });
  Object.assign(foldBtn.style, {
    width: '28px',
    height: '28px',
    transition: 'transform 120ms ease',
  } as CSSStyleDeclaration);

  const closeResult = makeIconBtn(
    doc,
    ui.closeResult,
    ICONS.close,
    () => {
      panel.style.display = 'none';
      panel.replaceChildren();
      const root = doc.getElementById(ROOT_ID);
      // Close result → return beside the original selection.
      if (root && root.dataset.lbPinned !== '1' && selectionAnchor) {
        positionNearSelection(root, selectionAnchor, true);
      }
    },
    { accent: true },
  );
  Object.assign(closeResult.style, { width: '28px', height: '28px' });

  head.appendChild(title);
  head.appendChild(foldBtn);
  head.appendChild(closeResult);
  panel.appendChild(head);
  panel.appendChild(content);

  if (sourceText) {
    const srcLabel = doc.createElement('div');
    srcLabel.textContent = ui.source;
    Object.assign(srcLabel.style, {
      font: '700 11px/1.2 "Segoe UI", "PingFang SC", sans-serif',
      color: C.teal,
      marginBottom: '6px',
      letterSpacing: '0.08em',
    } as CSSStyleDeclaration);
    const srcBody = doc.createElement('div');
    srcBody.textContent = sourceText;
    Object.assign(srcBody.style, {
      font: '450 13px/1.55 "Segoe UI", "PingFang SC", sans-serif',
      color: C.slate,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      marginBottom: '12px',
    } as CSSStyleDeclaration);
    content.appendChild(srcLabel);
    content.appendChild(srcBody);
  }

  const dstLabel = doc.createElement('div');
  dstLabel.textContent = ui.translation;
  Object.assign(dstLabel.style, {
    font: '700 11px/1.2 "Segoe UI", "PingFang SC", sans-serif',
    color: C.sky,
    marginBottom: '6px',
    letterSpacing: '0.08em',
  } as CSSStyleDeclaration);

  const body = doc.createElement('div');
  body.textContent = translation;
  Object.assign(body.style, {
    font: '500 14px/1.6 "Segoe UI", "PingFang SC", sans-serif',
    color: C.ink,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  } as CSSStyleDeclaration);

  content.appendChild(dstLabel);
  content.appendChild(body);

  if (terms.length) {
    const list = doc.createElement('div');
    Object.assign(list.style, {
      marginTop: '12px',
      paddingTop: '12px',
      borderTop: '1px solid rgba(14, 165, 233, 0.15)',
      display: 'grid',
      gap: '12px',
    } as CSSStyleDeclaration);

    const head = doc.createElement('div');
    head.textContent = ui.keywords;
    Object.assign(head.style, {
      font: '700 11px/1.2 "Segoe UI", "PingFang SC", sans-serif',
      color: C.teal,
      letterSpacing: '0.08em',
    } as CSSStyleDeclaration);
    list.appendChild(head);

    for (const t of terms) {
      const card = doc.createElement('div');
      Object.assign(card.style, {
        display: 'grid',
        gap: '4px',
        padding: '8px 10px',
        borderRadius: '12px',
        background: 'rgba(14, 165, 233, 0.05)',
        border: '1px solid rgba(14, 165, 233, 0.12)',
      } as CSSStyleDeclaration);

      const top = doc.createElement('div');
      Object.assign(top.style, {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'baseline',
        gap: '6px 8px',
      } as CSSStyleDeclaration);

      const term = doc.createElement('span');
      term.textContent = t.term;
      Object.assign(term.style, {
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: '999px',
        background: `linear-gradient(135deg, rgba(14,165,233,0.16), rgba(20,184,166,0.16))`,
        color: C.sky,
        font: '700 12px/1.4 "Segoe UI", "PingFang SC", sans-serif',
        border: '1px solid rgba(14, 165, 233, 0.2)',
      } as CSSStyleDeclaration);
      top.appendChild(term);

      if (t.phonetic) {
        const ph = doc.createElement('span');
        ph.textContent = t.phonetic;
        Object.assign(ph.style, {
          color: C.teal,
          font: '500 12px/1.4 "Segoe UI", "PingFang SC", Consolas, monospace',
        } as CSSStyleDeclaration);
        top.appendChild(ph);
      }
      card.appendChild(top);

      const meaning = doc.createElement('div');
      meaning.textContent = t.meaning;
      Object.assign(meaning.style, {
        color: C.ink,
        font: '500 13px/1.45 "Segoe UI", "PingFang SC", sans-serif',
      } as CSSStyleDeclaration);
      card.appendChild(meaning);

      if (t.example) {
        const ex = doc.createElement('div');
        ex.textContent = `${ui.examplePrefix}${t.example}`;
        Object.assign(ex.style, {
          color: C.slate,
          font: '400 12px/1.45 "Segoe UI", "PingFang SC", sans-serif',
          fontStyle: 'italic',
        } as CSSStyleDeclaration);
        card.appendChild(ex);
      }

      list.appendChild(card);
    }
    content.appendChild(list);
  }

  repositionBubbleForResult(doc);
}

export function getSelectedText(): string {
  return (window.getSelection()?.toString() ?? '').trim();
}

export function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (!rect.width && !rect.height) return null;
  return rect;
}
