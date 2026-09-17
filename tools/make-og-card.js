#!/usr/bin/env node
/**
 * Regenerate assets/brand/og.png — the 1200x630 card link previews use.
 *
 * WHY THIS EXISTS
 *
 * The logo pack ships no image at the 1.91:1 ratio Open Graph wants. Its
 * closest candidates both fail as a social card: the lockup PNGs are 3.6:1 with
 * a transparent background (bone text on whatever colour the chat app paints
 * behind it — invisible on a light theme), and the Instagram avatar is square,
 * so a scraper honouring twitter:card=summary_large_image centre-crops it to
 * 2:1 and slices the logo. So the card is composed here instead: the Hebrew
 * lockup, downscaled and flattened onto the brand ink.
 *
 * Pure Node by necessity — the box has neither sharp nor ImageMagick, and this
 * runs about once per logo redesign, which does not justify a dependency.
 * Handles only what the pack actually contains: 8-bit non-interlaced RGB/RGBA.
 *
 *   node tools/make-og-card.js
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets/brand/png/brickdeal-lockup-he-on-dark.png');
const OUT = path.join(ROOT, 'assets/brand/og.png');

const W = 1200;
const H = 630;
const INK = [0x0b, 0x0b, 0x0c];   // brand ink, per assets/brand/README.txt
const LOCKUP_WIDTH_RATIO = 0.68;  // leaves a comfortable margin at 1200px wide

/* ---------- decode ---------- */

/** Reverse the per-row filter PNG applies before compression (spec §9.2). */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const type = raw[pos++];
    const line = raw.subarray(pos, pos + stride);
    pos += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;          // left
      const b = prev ? prev[i] : 0;                    // up
      const c = prev && i >= bpp ? prev[i - bpp] : 0;  // up-left
      let v = line[i];
      switch (type) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unsupported PNG filter type ${type} on row ${y}`);
      }
      cur[i] = v & 0xff;
    }
  }
  return out;
}

/** @returns {{width:number, height:number, data:Buffer}} data is RGBA. */
function decodePng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} is not a PNG`);

  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') ihdr = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const depth = ihdr[8];
  const colorType = ihdr[9];
  const interlace = ihdr[12];
  if (depth !== 8) throw new Error(`expected 8-bit, got ${depth}-bit`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  if (colorType !== 2 && colorType !== 6) {
    throw new Error(`expected RGB or RGBA, got colour type ${colorType}`);
  }

  const bpp = colorType === 6 ? 4 : 3;
  const px = unfilter(zlib.inflateSync(Buffer.concat(idat)), width, height, bpp);

  if (bpp === 4) return { width, height, data: px };

  const rgba = Buffer.alloc(width * height * 4);          // widen RGB to RGBA
  for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
    rgba[j] = px[i]; rgba[j + 1] = px[i + 1]; rgba[j + 2] = px[i + 2]; rgba[j + 3] = 255;
  }
  return { width, height, data: rgba };
}

/* ---------- resample ---------- */

/**
 * Box-filter downscale. Alpha is premultiplied before averaging: straight RGBA
 * would drag the colour of fully transparent pixels into the edge of every
 * glyph, fringing the bone wordmark toward black.
 */
function resize(src, dw, dh) {
  const { width: sw, height: sh, data } = src;
  const out = Buffer.alloc(dw * dh * 4);

  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * sh / dh);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sh / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * sw / dw);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sw / dw));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * sw + sx) * 4;
          const al = data[i + 3] / 255;
          r += data[i] * al; g += data[i + 1] * al; b += data[i + 2] * al;
          a += data[i + 3];
          n++;
        }
      }
      // Divide the premultiplied sums by the alpha sum, not by n: that is the
      // un-premultiply and the box average in one step. Fully transparent
      // blocks keep RGB 0, which is fine — alpha 0 means they never composite.
      const j = (y * dw + x) * 4;
      if (a > 0) {
        out[j] = Math.min(255, Math.round(r * 255 / a));
        out[j + 1] = Math.min(255, Math.round(g * 255 / a));
        out[j + 2] = Math.min(255, Math.round(b * 255 / a));
      }
      out[j + 3] = Math.round(a / n);
    }
  }
  return { width: dw, height: dh, data: out };
}

/* ---------- encode ---------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, tail]);
}

/** Encode opaque RGB. The card is flattened, so an alpha channel would be dead weight. */
function encodePng(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // colour type: truecolour
  ihdr[12] = 0;   // no interlace

  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;   // filter: none — flat brand colours deflate fine
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- compose ---------- */

const lockup = decodePng(SRC);

const dw = Math.round(W * LOCKUP_WIDTH_RATIO);
const dh = Math.round(dw * lockup.height / lockup.width);
if (dh > H) throw new Error(`lockup is ${dh}px tall, taller than the ${H}px card`);
const scaled = resize(lockup, dw, dh);

const ox = Math.round((W - dw) / 2);
const oy = Math.round((H - dh) / 2);

const canvas = Buffer.alloc(W * H * 3);
for (let i = 0; i < canvas.length; i += 3) {
  canvas[i] = INK[0]; canvas[i + 1] = INK[1]; canvas[i + 2] = INK[2];
}

for (let y = 0; y < dh; y++) {
  for (let x = 0; x < dw; x++) {
    const s = (y * dw + x) * 4;
    const a = scaled.data[s + 3] / 255;
    if (a === 0) continue;
    const d = ((oy + y) * W + (ox + x)) * 3;
    for (let c = 0; c < 3; c++) {
      canvas[d + c] = Math.round(scaled.data[s + c] * a + canvas[d + c] * (1 - a));
    }
  }
}

fs.writeFileSync(OUT, encodePng(W, H, canvas));
console.log(`wrote ${path.relative(ROOT, OUT)} — ${W}x${H}, lockup ${dw}x${dh} at ${ox},${oy}`);
