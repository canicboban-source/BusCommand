#!/usr/bin/env node
/**
 * Derives the icon-only square crop from the full brand PNG (logo-hero.png).
 * The owner source image embeds a "BusCommand" wordmark below the icon —
 * UI slots that already render a text label next to the logo (login card,
 * landing header) must use the icon-only crop to avoid double text.
 * Pure Node (zlib) — no native image dependencies.
 */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "public", "brand", "logo-hero.png");
const OUT = path.join(ROOT, "public", "brand", "logo-mark.png");

function parsePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("Not a PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.slice(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 2) {
    throw new Error(`Unsupported PNG (bitDepth=${bitDepth}, colorType=${colorType}); expected 8-bit RGB`);
  }
  return { width, height, raw: zlib.inflateSync(Buffer.concat(idat)) };
}

function unfilter(raw, width, height) {
  const bpp = 3;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : null;
    const cur = out.slice(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev ? prev[i] : 0;
      const c = i >= bpp && prev ? prev[i - bpp] : 0;
      let val = row[i];
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        val = (val + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[i] = val;
    }
  }
  return out;
}

/** Row has "content" when enough pixels deviate from the (near-black) corner background. */
function rowActivity(pixels, width, y, bg) {
  const stride = width * 3;
  let count = 0;
  for (let x = 0; x < width; x += 3) { // sample every 3rd pixel
    const i = y * stride + x * 3;
    if (Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 48) count += 1;
  }
  return count;
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(pixels, width, height) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: None
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

const png = parsePng(fs.readFileSync(SRC));
const pixels = unfilter(png.raw, png.width, png.height);
const bg = [pixels[0], pixels[1], pixels[2]];

const activity = [];
for (let y = 0; y < png.height; y += 1) activity[y] = rowActivity(pixels, png.width, y, bg);

let firstRow = activity.findIndex((a) => a > png.width / 100);
let lastRow = png.height - 1;
while (lastRow > 0 && activity[lastRow] <= png.width / 100) lastRow -= 1;
if (firstRow < 0 || lastRow <= firstRow) throw new Error("No content rows detected");

// Widest quiet band between icon and wordmark = split point.
let best = { start: -1, len: 0 };
let run = { start: -1, len: 0 };
for (let y = firstRow; y <= lastRow; y += 1) {
  if (activity[y] <= png.width / 100) {
    if (run.start < 0) run.start = y;
    run.len += 1;
  } else if (run.start >= 0) {
    if (run.len > best.len) best = { ...run };
    run = { start: -1, len: 0 };
  }
}
if (run.start >= 0 && run.len > best.len) best = { ...run };
if (best.len < 4) throw new Error("No quiet band between icon and wordmark found");

const split = best.start + Math.floor(best.len / 2);
const iconTop = firstRow;
const iconBottom = split - 1;

// Column bounding box of the icon region.
let minCol = png.width, maxCol = 0;
for (let y = iconTop; y <= iconBottom; y += 2) {
  for (let x = 0; x < png.width; x += 2) {
    const i = y * png.width * 3 + x * 3;
    if (Math.abs(pixels[i] - bg[0]) + Math.abs(pixels[i + 1] - bg[1]) + Math.abs(pixels[i + 2] - bg[2]) > 48) {
      if (x < minCol) minCol = x;
      if (x > maxCol) maxCol = x;
    }
  }
}
if (minCol >= maxCol) throw new Error("Icon columns not detected");

// Square crop centered on the icon, clamped to the image.
const side = Math.max(maxCol - minCol + 1, iconBottom - iconTop + 1);
const cx = Math.floor((minCol + maxCol) / 2);
const cy = Math.floor((iconTop + iconBottom) / 2);
let left = cx - Math.floor(side / 2);
let top = cy - Math.floor(side / 2);
left = Math.max(0, Math.min(left, png.width - side));
top = Math.max(0, Math.min(top, png.height - side));

const crop = Buffer.alloc(side * side * 3);
for (let y = 0; y < side; y += 1) {
  pixels.copy(crop, y * side * 3, (top + y) * png.width * 3 + left * 3, (top + y) * png.width * 3 + (left + side) * 3);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, encodePng(crop, side, side));
console.log(`logo-mark.png: icon-only ${side}x${side} crop (source ${png.width}x${png.height}, split at row ${split})`);
