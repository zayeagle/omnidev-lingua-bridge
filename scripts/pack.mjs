#!/usr/bin/env node
/**
 * One-click pack for Windows / Linux / macOS.
 * Usage:
 *   npm run pack:all
 *   node scripts/pack.mjs
 *   node scripts/pack.mjs --skip-test
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipTest = process.argv.includes('--skip-test');
const npmCmd = platform() === 'win32' ? 'npm.cmd' : 'npm';

function run(cmd, args, label) {
  console.log(`\n▶ ${label}`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    // Avoid shell+args deprecation; npm.cmd works directly on Windows.
  });
  if (r.status !== 0) {
    console.error(`\n✖ Failed: ${label} (exit ${r.status ?? 'unknown'})`);
    process.exit(r.status ?? 1);
  }
}

console.log('Lingua Bridge · one-click pack');
console.log(`Platform: ${platform()} | Node: ${process.version}`);
console.log(`Root: ${root}`);

if (!existsSync(join(root, 'package.json'))) {
  console.error('package.json not found — run from repo root');
  process.exit(1);
}

if (!existsSync(join(root, 'node_modules'))) {
  run(npmCmd, ['install'], 'npm install');
}

run(npmCmd, ['run', 'icons'], 'generate icons');

if (!skipTest) {
  run(npmCmd, ['test'], 'unit tests');
} else {
  console.log('\n⏭ skip tests (--skip-test)');
}

run(npmCmd, ['run', 'zip'], 'zip Chrome');
run(npmCmd, ['run', 'assert:content'], 'assert content bundle has no secrets');
run(npmCmd, ['run', 'zip:firefox'], 'zip Firefox');

const out = join(root, '.output');
const zips = existsSync(out)
  ? readdirSync(out).filter((f) => f.endsWith('.zip'))
  : [];

console.log('\n✔ Pack complete. Installable artifacts:');
for (const z of zips) {
  console.log(`  · .output/${z}`);
}
console.log('\nInstall like a normal extension:');
console.log('  Chrome/Edge: chrome://extensions → Developer mode → Load unpacked (.output/chrome-mv3) or drag zip');
console.log('  Firefox: about:debugging → This Firefox → Load Temporary Add-on (.output/firefox-mv2)');
console.log(`\nTip: npm run pack:all -- --skip-test   # faster rebuild`);
