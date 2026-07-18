/** Draggable bilingual caption panel + short history for video SI. */

const ROOT_ID = 'lingua-bridge-caption-root';
const MAX_HISTORY = 40;

export type CuePayload = {
  /** Source / recognition text */
  text?: string;
  /** Translated text */
  translation?: string;
};

export type CueHistoryEntry = {
  text: string;
  translation: string;
  at: number;
};

type CaptionState = {
  folded: boolean;
  historyOpen: boolean;
  history: CueHistoryEntry[];
  current: CueHistoryEntry | null;
  /** Viewport coords; top grows content downward so the header stays visible. */
  pos: { left: number; top: number } | null;
};

const state: CaptionState = {
  folded: false,
  historyOpen: false,
  history: [],
  current: null,
  pos: null,
};

const EDGE = 8;
let resizeBound = false;
/** When set, × closes SI (content script), not just the panel. */
let onCloseRequest: (() => void) | null = null;

/** Wire caption × to stop page SI. Pass null to clear. */
export function setCaptionCloseHandler(handler: (() => void) | null): void {
  onCloseRequest = handler;
}

function css(el: HTMLElement, styles: Record<string, string>): void {
  Object.assign(el.style, styles);
}

/** Keep the panel fully inside the viewport (header never above the top edge). */
function clampCaptionIntoViewport(root: HTMLElement): void {
  const w = root.offsetWidth || 320;
  const h = root.offsetHeight || 80;
  const maxLeft = Math.max(EDGE, window.innerWidth - w - EDGE);
  const maxTop = Math.max(EDGE, window.innerHeight - h - EDGE);
  const rect = root.getBoundingClientRect();
  const left = Math.min(Math.max(EDGE, rect.left), maxLeft);
  const top = Math.min(Math.max(EDGE, rect.top), maxTop);
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.bottom = 'auto';
  root.style.right = 'auto';
  root.style.transform = 'none';
  state.pos = { left, top };
}

function enableDrag(root: HTMLElement, handle: HTMLElement): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let origLeft = 0;
  let origTop = 0;

  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextLeft = Math.min(
      Math.max(EDGE, origLeft + dx),
      Math.max(EDGE, window.innerWidth - root.offsetWidth - EDGE),
    );
    const nextTop = Math.min(
      Math.max(EDGE, origTop + dy),
      Math.max(EDGE, window.innerHeight - root.offsetHeight - EDGE),
    );
    root.style.left = `${nextLeft}px`;
    root.style.top = `${nextTop}px`;
    root.style.bottom = 'auto';
    root.style.right = 'auto';
    root.style.transform = 'none';
    state.pos = { left: nextLeft, top: nextTop };
  };

  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
    clampCaptionIntoViewport(root);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };

  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest('button')) return;
    dragging = true;
    handle.style.cursor = 'grabbing';
    const rect = root.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    origLeft = rect.left;
    origTop = rect.top;
    root.style.left = `${origLeft}px`;
    root.style.top = `${origTop}px`;
    root.style.bottom = 'auto';
    root.style.transform = 'none';
    e.preventDefault();
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });
}

function makeBtn(
  doc: Document,
  label: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = doc.createElement('button');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.textContent = label;
  css(b, {
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: '#e2e8f0',
    borderRadius: '8px',
    width: '28px',
    height: '26px',
    cursor: 'pointer',
    font: '700 12px/1 "Segoe UI", "PingFang SC", sans-serif',
    padding: '0',
    flex: '0 0 auto',
  });
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function renderBody(root: HTMLElement, doc: Document): void {
  const body = root.querySelector('[data-lb-caption-body]') as HTMLElement | null;
  const hist = root.querySelector('[data-lb-caption-hist]') as HTMLElement | null;
  if (!body || !hist) return;

  body.replaceChildren();
  hist.replaceChildren();

  if (state.folded) {
    body.style.display = 'none';
    hist.style.display = 'none';
    return;
  }
  body.style.display = 'block';

  const cur = state.current;
  if (!cur) {
    const empty = doc.createElement('div');
    empty.textContent = '等待同传字幕…';
    css(empty, { color: '#94a3b8', fontSize: '13px' });
    body.appendChild(empty);
  } else {
    // Top = source, bottom = translation (no labels).
    if (cur.text) {
      const src = doc.createElement('div');
      src.textContent = cur.text;
      css(src, {
        font: '450 13px/1.45 "Segoe UI", "PingFang SC", sans-serif',
        color: '#cbd5e1',
        marginBottom: cur.translation && cur.translation !== cur.text ? '8px' : '0',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      });
      body.appendChild(src);
    }
    const dstText = (cur.translation || cur.text).trim();
    if (dstText && dstText !== cur.text.trim()) {
      const dst = doc.createElement('div');
      dst.textContent = dstText;
      css(dst, {
        font: '600 15px/1.5 "Segoe UI", "PingFang SC", sans-serif',
        color: '#f8fafc',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      });
      body.appendChild(dst);
    } else if (!cur.text && dstText) {
      const dst = doc.createElement('div');
      dst.textContent = dstText;
      css(dst, {
        font: '600 15px/1.5 "Segoe UI", "PingFang SC", sans-serif',
        color: '#f8fafc',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      });
      body.appendChild(dst);
    }
  }

  if (!state.historyOpen) {
    hist.style.display = 'none';
    return;
  }
  hist.style.display = 'block';

  const headRow = doc.createElement('div');
  css(headRow, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  });
  const head = doc.createElement('div');
  head.textContent = `历史（${state.history.length}）`;
  css(head, {
    flex: '1',
    font: '700 10px/1.2 "Segoe UI", "PingFang SC", sans-serif',
    color: '#94a3b8',
    letterSpacing: '0.06em',
  });
  const closeHist = makeBtn(doc, '收起', '收起历史，回到当前字幕', () => {
    state.historyOpen = false;
    paint(doc);
  });
  css(closeHist, {
    width: 'auto',
    padding: '0 8px',
    fontSize: '11px',
  });
  headRow.appendChild(head);
  headRow.appendChild(closeHist);
  hist.appendChild(headRow);

  if (!state.history.length) {
    const empty = doc.createElement('div');
    empty.textContent = '暂无历史';
    css(empty, { color: '#64748b', fontSize: '12px' });
    hist.appendChild(empty);
    return;
  }

  for (const item of state.history) {
    const row = doc.createElement('button');
    row.type = 'button';
    css(row, {
      display: 'block',
      width: '100%',
      textAlign: 'left',
      border: '1px solid rgba(148,163,184,0.2)',
      background: 'rgba(15,23,42,0.55)',
      borderRadius: '10px',
      padding: '8px 10px',
      marginBottom: '6px',
      cursor: 'pointer',
      color: '#e2e8f0',
    });
    if (item.text) {
      const t1 = doc.createElement('div');
      t1.textContent = item.text;
      css(t1, {
        font: '400 12px/1.4 "Segoe UI", "PingFang SC", sans-serif',
        color: '#94a3b8',
        marginBottom: '4px',
      });
      row.appendChild(t1);
    }
    const t2 = doc.createElement('div');
    t2.textContent = item.translation || item.text;
    css(t2, {
      font: '550 13px/1.4 "Segoe UI", "PingFang SC", sans-serif',
      color: '#f1f5f9',
    });
    row.appendChild(t2);
    row.addEventListener('click', () => {
      state.current = item;
      state.historyOpen = false;
      paint(doc);
    });
    hist.appendChild(row);
  }
}

function paint(doc: Document = document): void {
  const root = ensureCaptionRoot(doc);
  const foldBtn = root.querySelector('[data-lb-fold]') as HTMLButtonElement | null;
  const histBtn = root.querySelector('[data-lb-hist-btn]') as HTMLButtonElement | null;
  if (foldBtn) foldBtn.textContent = state.folded ? '▢' : '–';
  if (histBtn) {
    histBtn.textContent = state.historyOpen ? '回' : '史';
    histBtn.title = state.historyOpen ? '收起历史' : '历史字幕';
    histBtn.setAttribute('aria-label', histBtn.title);
    histBtn.style.background = state.historyOpen
      ? 'rgba(14,165,233,0.35)'
      : 'rgba(255,255,255,0.12)';
  }
  renderBody(root, doc);
  // Content/history height changes must not push the header above the viewport.
  if (state.pos || root.style.opacity === '1') {
    clampCaptionIntoViewport(root);
  }
}

export function ensureCaptionRoot(doc: Document = document): HTMLElement {
  let root = doc.getElementById(ROOT_ID);
  if (root) return root;

  root = doc.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('data-lb-caption', '1');
  css(root, {
    position: 'fixed',
    left: state.pos ? `${state.pos.left}px` : '50%',
    top: state.pos ? `${state.pos.top}px` : 'auto',
    bottom: state.pos ? 'auto' : '40px',
    transform: state.pos ? 'none' : 'translateX(-50%)',
    zIndex: '2147483646',
    width: 'min(520px, 92vw)',
    maxWidth: '92vw',
    maxHeight: `calc(100vh - ${EDGE * 2}px)`,
    borderRadius: '14px',
    background: 'linear-gradient(180deg, rgba(15,23,42,0.94), rgba(2,6,23,0.92))',
    color: '#f2f6fa',
    font: '500 14px/1.45 "Segoe UI", "PingFang SC", sans-serif',
    boxShadow: '0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(56,189,248,0.18)',
    opacity: '0',
    transition: 'opacity 160ms ease',
    pointerEvents: 'auto',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  });

  const header = doc.createElement('div');
  header.setAttribute('data-lb-caption-drag', '1');
  css(header, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    cursor: 'grab',
    background: 'rgba(14,165,233,0.12)',
    borderBottom: '1px solid rgba(148,163,184,0.15)',
    userSelect: 'none',
    flex: '0 0 auto',
  });

  const title = doc.createElement('div');
  title.textContent = '同传字幕';
  css(title, {
    flex: '1',
    font: '700 12px/1 "Segoe UI", "PingFang SC", sans-serif',
    color: '#7dd3fc',
    letterSpacing: '0.04em',
  });

  const histBtn = makeBtn(doc, '史', '历史字幕', () => {
    state.historyOpen = !state.historyOpen;
    if (state.historyOpen) state.folded = false;
    paint(doc);
  });
  histBtn.setAttribute('data-lb-hist-btn', '1');
  histBtn.setAttribute('aria-pressed', 'false');

  const foldBtn = makeBtn(doc, '–', '折叠 / 展开', () => {
    state.folded = !state.folded;
    paint(doc);
  });
  foldBtn.setAttribute('data-lb-fold', '1');

  const closeBtn = makeBtn(doc, '×', '关闭同传', () => {
    if (onCloseRequest) {
      onCloseRequest();
      return;
    }
    hideCue(doc);
  });

  header.appendChild(title);
  header.appendChild(histBtn);
  header.appendChild(foldBtn);
  header.appendChild(closeBtn);

  const body = doc.createElement('div');
  body.setAttribute('data-lb-caption-body', '1');
  css(body, {
    padding: '12px 14px 10px',
    textAlign: 'left',
    overflow: 'auto',
    flex: '1 1 auto',
    minHeight: '0',
  });

  const hist = doc.createElement('div');
  hist.setAttribute('data-lb-caption-hist', '1');
  css(hist, {
    display: 'none',
    padding: '0 14px 12px',
    maxHeight: '220px',
    overflow: 'auto',
    borderTop: '1px solid rgba(148,163,184,0.12)',
    flex: '0 1 auto',
    minHeight: '0',
  });

  root.appendChild(header);
  root.appendChild(body);
  root.appendChild(hist);
  enableDrag(root, header);
  doc.documentElement.appendChild(root);
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', () => {
      const el = document.getElementById(ROOT_ID);
      if (el && el.style.opacity === '1') clampCaptionIntoViewport(el);
    });
  }
  return root;
}

/**
 * Show bilingual cue. Accepts legacy string (translation only) or payload.
 */
export function showCue(
  input: string | CuePayload,
  doc: Document = document,
): void {
  const payload: CuePayload =
    typeof input === 'string' ? { translation: input } : input;
  const text = (payload.text ?? '').trim();
  const translation = (payload.translation ?? text).trim();
  if (!text && !translation) {
    hideCue(doc);
    return;
  }

  const entry: CueHistoryEntry = {
    text,
    translation: translation || text,
    at: Date.now(),
  };
  state.current = entry;
  const dup =
    state.history[0] &&
    state.history[0].text === entry.text &&
    state.history[0].translation === entry.translation;
  if (!dup) {
    state.history.unshift(entry);
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
  }
  state.folded = false;

  const root = ensureCaptionRoot(doc);
  root.style.opacity = '1';
  paint(doc);
}

export function hideCue(doc: Document = document): void {
  const root = doc.getElementById(ROOT_ID);
  if (!root) return;
  state.current = null;
  state.historyOpen = false;
  state.folded = false;
  // Keep history for reopen on next cue; hide window now.
  paint(doc);
  root.style.opacity = '0';
}

export function clearCaptionHistory(doc: Document = document): void {
  state.history = [];
  state.current = null;
  state.historyOpen = false;
  paint(doc);
}

export function removeCaptionRoot(doc: Document = document): void {
  doc.getElementById(ROOT_ID)?.remove();
  state.history = [];
  state.current = null;
  state.historyOpen = false;
  state.folded = false;
  state.pos = null;
  onCloseRequest = null;
}

/** Test helper */
export function getCaptionHistoryForTest(): CueHistoryEntry[] {
  return state.history.slice();
}
