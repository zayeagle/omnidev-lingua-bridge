const ROOT_ID = 'lingua-bridge-toast';

export type ToastOptions = {
  /** Auto-dismiss ms; 0 = stay until closed. Default 4000. */
  durationMs?: number;
};

let hideTimer: number | undefined;

function ensureRoot(doc: Document): HTMLElement {
  let root = doc.getElementById(ROOT_ID);
  if (!root) {
    root = doc.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'status');
    Object.assign(root.style, {
      position: 'fixed',
      top: '16px',
      right: '16px',
      zIndex: '2147483647',
      display: 'none',
      alignItems: 'flex-start',
      gap: '10px',
      maxWidth: 'min(340px, 92vw)',
      padding: '12px 12px 12px 14px',
      borderRadius: '14px',
      background:
        'linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%)',
      color: '#0f172a',
      border: '1px solid rgba(14, 165, 233, 0.22)',
      borderLeft: '3px solid #0ea5e9',
      boxShadow:
        '0 12px 32px rgba(2, 132, 199, 0.18), 0 2px 8px rgba(15, 23, 42, 0.06)',
      font: '500 13px/1.45 "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    } as CSSStyleDeclaration);

    const text = doc.createElement('div');
    text.setAttribute('data-lb-toast-text', '1');
    text.style.flex = '1';
    text.style.minWidth = '0';

    const close = doc.createElement('button');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭');
    close.textContent = '×';
    Object.assign(close.style, {
      flex: '0 0 auto',
      width: '26px',
      height: '26px',
      margin: '0',
      padding: '0',
      border: '0',
      borderRadius: '999px',
      background: 'rgba(148, 163, 184, 0.16)',
      color: '#64748b',
      font: '700 16px/26px sans-serif',
      cursor: 'pointer',
    } as CSSStyleDeclaration);
    close.addEventListener('click', () => hideToast(doc));

    root.appendChild(text);
    root.appendChild(close);
    doc.documentElement.appendChild(root);
  }
  return root;
}

export function hideToast(doc: Document = document): void {
  if (hideTimer != null) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
  const root = doc.getElementById(ROOT_ID);
  if (root) root.style.display = 'none';
}

/** Light toast: auto-dismiss + manual close. */
export function showToast(
  message: string,
  opts: ToastOptions = {},
  doc: Document = document,
): void {
  const root = ensureRoot(doc);
  const text = root.querySelector('[data-lb-toast-text]') as HTMLElement | null;
  if (text) text.textContent = message;
  root.style.display = 'flex';

  if (hideTimer != null) window.clearTimeout(hideTimer);
  const ms = opts.durationMs ?? 4000;
  if (ms > 0) {
    hideTimer = window.setTimeout(() => hideToast(doc), ms);
  }
}
