#!/usr/bin/env node
/**
 * Fail if Chrome content script bundle embeds secret storage keys.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const contentPath = join(root, '.output', 'chrome-mv3', 'content-scripts', 'content.js');

if (!existsSync(contentPath)) {
  console.error(`✖ missing ${contentPath} — run npm run build first`);
  process.exit(1);
}

const src = readFileSync(contentPath, 'utf8');
const banned = [
  { re: /apiKey/, label: 'apiKey' },
  { re: /local:settings/, label: 'local:settings' },
];

const hits = banned.filter((b) => b.re.test(src)).map((b) => b.label);
if (hits.length) {
  console.error(`✖ content bundle must not contain: ${hits.join(', ')}`);
  process.exit(1);
}

if (!src.includes('publicPrefs')) {
  console.error('✖ content bundle missing expected publicPrefs marker');
  process.exit(1);
}

console.log('✔ content bundle secret assert OK');
