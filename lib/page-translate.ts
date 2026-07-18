import { detectLang, targetLangFor, type LangCode } from './lang-detect';

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEXTAREA',
  'INPUT',
  'CODE',
  'PRE',
  'KBD',
  'SAMP',
  'SVG',
  'MATH',
]);

const ATTR_ORIG = 'data-lb-orig';
const ATTR_DONE = 'data-lb-done';

export type TranslateBatchFn = (
  texts: string[],
  targetLang: 'zh' | 'en',
) => Promise<string[]>;

export function isSkippableElement(el: Element | null): boolean {
  if (!el) return true;
  let cur: Element | null = el;
  while (cur) {
    if (SKIP_TAGS.has(cur.tagName)) return true;
    if (cur.getAttribute('contenteditable') === 'true') return true;
    cur = cur.parentElement;
  }
  return false;
}

export function isInViewport(node: Node, margin = 80): boolean {
  const el = node.parentElement;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.bottom >= -margin &&
    rect.top <= vh + margin &&
    rect.right >= -margin &&
    rect.left <= vw + margin
  );
}

export function collectVisibleTextNodes(root: ParentNode = document.body): Text[] {
  if (!root) return [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const text = node.textContent ?? '';
      if (!text.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (isSkippableElement(parent)) return NodeFilter.FILTER_REJECT;
      if (parent?.hasAttribute(ATTR_DONE)) return NodeFilter.FILTER_REJECT;
      if (!isInViewport(node)) return NodeFilter.FILTER_REJECT;
      const lang = detectLang(text);
      if (!targetLangFor(lang)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

export async function translateViewport(
  translateBatch: TranslateBatchFn,
  root: ParentNode = document.body,
): Promise<{ translated: number; failed: number }> {
  const nodes = collectVisibleTextNodes(root);
  if (!nodes.length) return { translated: 0, failed: 0 };

  // Group by target language for fewer API calls
  const groups = new Map<'zh' | 'en', { node: Text; text: string }[]>();
  for (const node of nodes) {
    const text = node.textContent ?? '';
    const source = detectLang(text) as LangCode;
    const target = targetLangFor(source);
    if (!target) continue;
    const list = groups.get(target) ?? [];
    list.push({ node, text });
    groups.set(target, list);
  }

  let translated = 0;
  let failed = 0;

  for (const [target, items] of groups) {
    try {
      const results = await translateBatch(
        items.map((i) => i.text),
        target,
      );
      items.forEach((item, idx) => {
        const parent = item.node.parentElement;
        if (!parent) return;
        if (!parent.hasAttribute(ATTR_ORIG)) {
          parent.setAttribute(ATTR_ORIG, item.text);
        }
        const next = results[idx];
        if (typeof next === 'string' && next.length > 0) {
          item.node.textContent = next;
          parent.setAttribute(ATTR_DONE, '1');
          translated++;
        }
      });
    } catch {
      failed += items.length;
    }
  }

  return { translated, failed };
}

export function restoreOriginals(root: ParentNode = document.body): void {
  const marked = (root as ParentNode & { querySelectorAll: typeof document.querySelectorAll })
    .querySelectorAll?.(`[${ATTR_ORIG}]`) ?? [];
  marked.forEach((el) => {
    const orig = el.getAttribute(ATTR_ORIG);
    if (orig != null && el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
      el.firstChild.textContent = orig;
    }
    el.removeAttribute(ATTR_ORIG);
    el.removeAttribute(ATTR_DONE);
  });
}
