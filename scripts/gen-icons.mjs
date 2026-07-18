/**
 * Product icon: vivid sky→teal tile, white plate, bilingual chat + swap arrows.
 * Clear at 16–128px without fragile glyph stroke painting.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public');
mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function roundedRectMask(x, y, w, h, radius) {
  if (x < 0 || y < 0 || x >= w || y >= h) return 0;
  if (x >= radius && x <= w - 1 - radius && y >= radius && y <= h - 1 - radius) {
    return 1;
  }
  const dx = x < radius ? radius - x : x > w - 1 - radius ? x - (w - 1 - radius) : 0;
  const dy = y < radius ? radius - y : y > h - 1 - radius ? y - (h - 1 - radius) : 0;
  const d = Math.hypot(dx, dy);
  if (d <= radius - 0.45) return 1;
  if (d >= radius + 0.45) return 0;
  return clamp(1 - (d - (radius - 0.45)), 0, 1);
}

function disk(cx, cy, r, x, y) {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= r - 0.4) return 1;
  if (d >= r + 0.4) return 0;
  return clamp(1 - (d - (r - 0.4)), 0, 1);
}

function capsule(x0, y0, x1, y1, r, x, y) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((x - x0) * dx + (y - y0) * dy) / len2;
  t = clamp(t, 0, 1);
  const d = Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy));
  if (d <= r - 0.35) return 1;
  if (d >= r + 0.35) return 0;
  return clamp(1 - (d - (r - 0.35)), 0, 1);
}

/** Soft rounded bubble rect in local coords. */
function bubble(bx, by, bw, bh, br, x, y) {
  return roundedRectMask(x - bx, y - by, bw, bh, br);
}

function png(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  const raw = Buffer.alloc((1 + size * 3) * size);
  const tileR = size * 0.23;
  const outside = [236, 242, 248];
  const cTop = [2, 132, 199];
  const cMid = [6, 182, 212];
  const cBot = [20, 184, 166];
  const white = [255, 255, 255];
  const soft = [224, 242, 254];
  const ink = [3, 105, 161];
  const accent = [251, 146, 60];

  for (let y = 0; y < size; y++) {
    const rowOff = y * (1 + size * 3);
    raw[rowOff] = 0;
    const gy = y / Math.max(1, size - 1);
    for (let x = 0; x < size; x++) {
      const i = rowOff + 1 + x * 3;
      const m = roundedRectMask(x, y, size, size, tileR);
      let c = [...outside];
      if (m > 0) {
        const gx = x / Math.max(1, size - 1);
        let fill = mix(mix(cTop, cMid, gy * 0.55), cBot, clamp(gy * 1.05 - 0.05, 0, 1));
        fill = mix(fill, soft, clamp(1 - Math.hypot(gx - 0.2, gy - 0.15) * 2.6, 0, 1) * 0.38);

        // Inner soft plate
        const plate = disk(size * 0.5, size * 0.5, size * 0.36, x, y);
        if (plate > 0) {
          fill = mix(fill, white, plate * 0.92);
        }

        // Left bubble (source)
        const b1 = bubble(size * 0.16, size * 0.28, size * 0.34, size * 0.28, size * 0.09, x, y);
        if (b1 > 0) fill = mix(fill, ink, b1 * 0.92);

        // Right bubble (target) — slightly lower
        const b2 = bubble(size * 0.5, size * 0.38, size * 0.34, size * 0.28, size * 0.09, x, y);
        if (b2 > 0) fill = mix(fill, [13, 148, 136], b2 * 0.92);

        // Tiny letter marks inside bubbles (dots / bars — readable at small size)
        const markL = capsule(
          size * 0.24,
          size * 0.42,
          size * 0.42,
          size * 0.42,
          size * 0.028,
          x,
          y,
        );
        const markR1 = disk(size * 0.6, size * 0.5, size * 0.03, x, y);
        const markR2 = disk(size * 0.68, size * 0.5, size * 0.03, x, y);
        const markR3 = disk(size * 0.76, size * 0.5, size * 0.03, x, y);
        const marks = Math.max(markL, markR1, markR2, markR3);
        if (marks > 0) fill = mix(fill, white, marks * 0.98);

        // Orange bridge chip between bubbles
        const bridge = capsule(
          size * 0.42,
          size * 0.48,
          size * 0.58,
          size * 0.48,
          size * 0.035,
          x,
          y,
        );
        if (bridge > 0) fill = mix(fill, accent, bridge * 0.98);

        // For larger sizes: add chevron arrows above plate rim
        if (size >= 48) {
          const upArrow = Math.max(
            capsule(size * 0.5, size * 0.18, size * 0.5, size * 0.26, size * 0.02, x, y),
            capsule(size * 0.5, size * 0.18, size * 0.44, size * 0.23, size * 0.018, x, y),
            capsule(size * 0.5, size * 0.18, size * 0.56, size * 0.23, size * 0.018, x, y),
          );
          if (upArrow > 0) fill = mix(fill, white, upArrow * 0.85);
        }

        c = mix(outside, fill, m);
      }

      raw[i] = c[0];
      raw[i + 1] = c[1];
      raw[i + 2] = c[2];
    }
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 96, 128]) {
  writeFileSync(join(outDir, `icon-${size}.png`), png(size));
}
writeFileSync(join(outDir, 'icon.png'), png(128));
console.log('icons written to public/');
