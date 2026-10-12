#!/usr/bin/env node
/**
 * Generate PNG icons for the PWA (no external deps).
 * Smooth anti-aliased rounded-square icon with a white pill shape.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG_TOP = { r: 0x1a, g: 0x1f, b: 0x29 };
const BG_BOT = { r: 0x0b, g: 0x0d, b: 0x10 };
const WHITE = { r: 0xff, g: 0xff, b: 0xff };
const SHADOW = { r: 0x00, g: 0x00, b: 0x00 };
const DIVIDER = { r: 0xc0, g: 0xc6, b: 0xcf };
const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

const SS = 2; // supersample for AA

function encodePNG(width, height, pixels) {
  const sig = Buffer.from([137,80,78,71,13,10,26,10]);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([tb, data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcData), 0);
    return Buffer.concat([len, tb, data, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y+1) * stride);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function mix(a, b, t) {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

function makeBuffer(w, h, clear) {
  const buf = new Float32Array(w*h*4);
  for (let i = 0; i < w*h; i++) {
    buf[i*4] = clear.r; buf[i*4+1] = clear.g; buf[i*4+2] = clear.b;
    buf[i*4+3] = clear.a == null ? 1 : clear.a;
  }
  return buf;
}

function setPixel(buf, w, x, y, c, alpha) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y*w + x)*4;
  const a = Math.max(0, Math.min(1, (c.a == null ? 1 : c.a) * (alpha == null ? 1 : alpha)));
  if (a < 1e-4) return;
  const dstA = buf[i+3];
  const outA = a + dstA * (1 - a);
  if (outA < 1e-4) { buf[i+3] = 0; return; }
  buf[i]   = (c.r * a + buf[i]   * dstA * (1 - a)) / outA;
  buf[i+1] = (c.g * a + buf[i+1] * dstA * (1 - a)) / outA;
  buf[i+2] = (c.b * a + buf[i+2] * dstA * (1 - a)) / outA;
  buf[i+3] = outA;
}

function roundedRectSDF(x, y, x0, y0, x1, y1, r) {
  const cx = Math.max(x0, Math.min(x, x1));
  const cy = Math.max(y0, Math.min(y, y1));
  const dx = x - cx, dy = y - cy;
  const cornerDist = Math.sqrt(dx*dx + dy*dy);
  const inside = (x >= x0 && x <= x1 && y >= y0 && y <= y1);
  if (inside) {
    const distTop = y - y0, distBot = y1 - y, distLeft = x - x0, distRight = x1 - x;
    const edgeDist = Math.min(distTop, distBot, distLeft, distRight);
    const inTL = x < x0 + r && y < y0 + r;
    const inTR = x > x1 - r && y < y0 + r;
    const inBL = x < x0 + r && y >= y1 - r;
    const inBR = x > x1 - r && y >= y1 - r;
    if (inTL || inTR || inBL || inBR) {
      let cxc, cyc;
      if (inTL) { cxc = x0 + r; cyc = y0 + r; }
      else if (inTR) { cxc = x1 - r; cyc = y0 + r; }
      else if (inBL) { cxc = x0 + r; cyc = y1 - r; }
      else { cxc = x1 - r; cyc = y1 - r; }
      const ddx = cxc - x, ddy = cyc - y;
      return -(r - Math.sqrt(ddx*ddx + ddy*ddy));
    }
    return -edgeDist;
  } else {
    const inTL = x < x0 + r && y < y0 + r;
    const inTR = x > x1 - r && y < y0 + r;
    const inBL = x < x0 + r && y >= y1 - r;
    const inBR = x > x1 - r && y >= y1 - r;
    if (inTL || inTR || inBL || inBR) {
      let cxc, cyc;
      if (inTL) { cxc = x0 + r; cyc = y0 + r; }
      else if (inTR) { cxc = x1 - r; cyc = y0 + r; }
      else if (inBL) { cxc = x0 + r; cyc = y1 - r; }
      else { cxc = x1 - r; cyc = y1 - r; }
      const ddx = x - cxc, ddy = y - cyc;
      return Math.sqrt(ddx*ddx + ddy*ddy) - r;
    }
    return cornerDist;
  }
}

function coverage(d, aa) {
  if (d < -aa) return 1;
  if (d > aa) return 0;
  const t = (d + aa) / (2 * aa);
  return 1 - t*t*(3 - 2*t);
}

function fillRoundedRect(buf, w, x0, y0, x1, y1, r, color) {
  const pad = 2;
  const minX = Math.max(0, Math.floor(x0 - r - pad));
  const maxX = Math.min(w-1, Math.ceil(x1 + r + pad));
  const minY = Math.max(0, Math.floor(y0 - r - pad));
  const maxY = Math.min(w-1, Math.ceil(y1 + r + pad));
  const aa = 0.9;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = roundedRectSDF(x+0.5, y+0.5, x0, y0, x1, y1, r);
      const a = coverage(d, aa);
      if (a > 0.001) setPixel(buf, w, x, y, color, a);
    }
  }
}

function fillGradientRoundedRect(buf, w, x0, y0, x1, y1, r, cTop, cBot) {
  const pad = 2;
  const minX = Math.max(0, Math.floor(x0 - r - pad));
  const maxX = Math.min(w-1, Math.ceil(x1 + r + pad));
  const minY = Math.max(0, Math.floor(y0 - r - pad));
  const maxY = Math.min(w-1, Math.ceil(y1 + r + pad));
  const aa = 0.9;
  const hh = y1 - y0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = roundedRectSDF(x+0.5, y+0.5, x0, y0, x1, y1, r);
      const a = coverage(d, aa);
      if (a <= 0.001) continue;
      const t = Math.max(0, Math.min(1, (y - y0) / hh));
      const c = mix(cTop, cBot, t);
      setPixel(buf, w, x, y, c, a);
    }
  }
}

// Draw a drop shadow for a shape at given offset by only darkening the background
// in regions that are NOT covered by the shape itself. Works by scanning the
// shadow SDF and requiring the point to also be OUTSIDE the foreground shape.
function drawDropShadow(buf, w, fgX0, fgY0, fgX1, fgY1, fgR, shOffX, shOffY, shBlur, shadowColor, baseAlpha) {
  const sx0 = fgX0 + shOffX, sy0 = fgY0 + shOffY;
  const sx1 = fgX1 + shOffX, sy1 = fgY1 + shOffY;
  const sr = fgR;
  const pad = shBlur + 2;
  const minX = Math.max(0, Math.floor(sx0 - sr - pad));
  const maxX = Math.min(w-1, Math.ceil(sx1 + sr + pad));
  const minY = Math.max(0, Math.floor(sy0 - sr - pad));
  const maxY = Math.min(w-1, Math.ceil(sy1 + sr + pad));
  const aa = 0.9;
  for (let pass = 0; pass <= shBlur; pass++) {
    const ox = shOffX + pass * 0.5;
    const oy = shOffY + pass * 0.5;
    const a = baseAlpha * (1 - pass / (shBlur + 1));
    const px0 = fgX0 + ox, py0 = fgY0 + oy, px1 = fgX1 + ox, py1 = fgY1 + oy;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        // Must be outside the foreground pill body (with small margin so shadow doesn't peek through AA edges)
        const fd = roundedRectSDF(x+0.5, y+0.5, fgX0 - 0.25, fgY0 - 0.25, fgX1 + 0.25, fgY1 + 0.25, fgR + 0.25);
        if (fd < 0.3) continue;
        const sd = roundedRectSDF(x+0.5, y+0.5, px0, py0, px1, py1, sr);
        const sa = coverage(sd, aa + pass*0.4) * a;
        if (sa > 0.003) setPixel(buf, w, x, y, shadowColor, sa);
      }
    }
  }
}

function drawPill(buf, w, cx, cy, pillW, pillH) {
  const r = pillH / 2;
  const x0 = cx - pillW/2, x1 = cx + pillW/2;
  const y0 = cy - pillH/2, y1 = cy + pillH/2;

  // Shadow first (darkens only background outside the pill)
  const shOff = Math.max(3, Math.round(pillH / 8));
  drawDropShadow(buf, w, x0, y0, x1, y1, r, shOff*0.4, shOff*0.7, Math.max(2, Math.round(pillH / 14)), SHADOW, 0.55);

  // White pill body on top — fully covers the inner shadow region
  fillRoundedRect(buf, w, x0, y0, x1, y1, r, WHITE);

  // Center score line
  const lw = Math.max(1.5, pillH * 0.05);
  const top = y0 + pillH * 0.22;
  const bot = y1 - pillH * 0.22;
  for (let y = Math.floor(top) - 1; y <= Math.ceil(bot) + 1; y++) {
    const ty = Math.min(y - top, bot - y);
    const taper = Math.max(0, Math.min(1, ty / (pillH * 0.12)));
    if (taper < 0.02) continue;
    for (let dx = -lw/2; dx <= lw/2; dx += 0.5) {
      const edgeFade = 1 - Math.abs(dx) / (lw/2 + 0.5);
      setPixel(buf, w, Math.round(cx + dx), y, DIVIDER, taper * 0.55 * Math.max(0, edgeFade));
    }
  }
}

function finalize(buf, w) {
  const out = Buffer.alloc(w*w*4);
  for (let i = 0; i < w*w; i++) {
    const a = Math.max(0, Math.min(1, buf[i*4+3]));
    out[i*4+3] = Math.round(a * 255);
    if (a < 1e-4) { out[i*4]=out[i*4+1]=out[i*4+2]=0; }
    else {
      out[i*4]   = Math.max(0, Math.min(255, Math.round(buf[i*4])));
      out[i*4+1] = Math.max(0, Math.min(255, Math.round(buf[i*4+1])));
      out[i*4+2] = Math.max(0, Math.min(255, Math.round(buf[i*4+2])));
    }
  }
  return out;
}

function downsample(src, srcW, dstW) {
  const n = SS;
  const out = Buffer.alloc(dstW*dstW*4);
  for (let y = 0; y < dstW; y++) {
    for (let x = 0; x < dstW; x++) {
      let r=0,g=0,b=0,a=0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const i = ((y*n+sy)*srcW + (x*n+sx))*4;
          const sa = src[i+3]/255;
          r += src[i]*sa; g += src[i+1]*sa; b += src[i+2]*sa; a += sa;
        }
      }
      const di = (y*dstW+x)*4;
      if (a < 0.5/n/n) { out[di+3]=0; }
      else {
        out[di] = Math.max(0, Math.min(255, Math.round(r/a)));
        out[di+1] = Math.max(0, Math.min(255, Math.round(g/a)));
        out[di+2] = Math.max(0, Math.min(255, Math.round(b/a)));
        out[di+3] = Math.max(0, Math.min(255, Math.round(a/n/n*255)));
      }
    }
  }
  return out;
}

function generateIcon(size, maskable) {
  const sw = size * SS;
  const buf = makeBuffer(sw, sw, TRANSPARENT);
  if (maskable) {
    fillGradientRoundedRect(buf, sw, -1, -1, sw+1, sw+1, 0, BG_TOP, BG_BOT);
    const content = sw * 0.8;
    const pillW = content * 0.7;
    const pillH = pillW * 0.42;
    drawPill(buf, sw, sw/2, sw/2, Math.round(pillW), Math.round(pillH));
  } else {
    const pad = sw * 0.06;
    const r = sw * 0.22;
    fillGradientRoundedRect(buf, sw, pad, pad, sw-pad, sw-pad, r, BG_TOP, BG_BOT);
    const inner = sw - pad*2;
    const pillW = inner * 0.55;
    const pillH = pillW * 0.42;
    drawPill(buf, sw, sw/2, sw/2, Math.round(pillW), Math.round(pillH));
  }
  const raw = finalize(buf, sw);
  const pix = SS > 1 ? downsample(raw, sw, size) : Buffer.from(raw.buffer);
  return encodePNG(size, size, pix);
}

const out = path.join(__dirname, 'icons');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon-192.png'), generateIcon(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), generateIcon(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), generateIcon(512, true));
console.log('Icons generated.');
