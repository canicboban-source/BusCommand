#!/usr/bin/env node
/** One-shot: apply root ChatGPT logo to public/brand + favicons. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = path.join(ROOT, "ChatGPT Image Aug 15, 2026, 09_46_21 PM (3).png");
if (!fs.existsSync(src)) {
  console.error("Missing logo source:", src);
  process.exit(1);
}

const png = fs.readFileSync(src);
const brand = path.join(ROOT, "public", "brand");
fs.mkdirSync(brand, { recursive: true });

for (const name of ["logo-hero.png", "logo-mark.png", "logo-icon-512.png", "logo-icon-192.png"]) {
  fs.writeFileSync(path.join(brand, name), png);
  console.log("wrote public/brand/" + name, png.length);
}

function pngToIco(pngBuf) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(0, 0);
  entry.writeUInt8(0, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

fs.writeFileSync(path.join(ROOT, "public", "favicon.ico"), pngToIco(png));
const svg = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"',
  '  viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="BusCommand">',
  '  <image xlink:href="/brand/logo-hero.png" href="/brand/logo-hero.png"',
  '    width="512" height="512" preserveAspectRatio="xMidYMid meet"/>',
  "</svg>",
  ""
].join("\n");
fs.writeFileSync(path.join(ROOT, "public", "favicon.svg"), svg, "utf8");
console.log("wrote public/favicon.ico");
console.log("wrote public/favicon.svg");

// Derive the icon-only mark (no embedded wordmark) after the full-image copy,
// so header/login slots that render their own "BusCommand" text never double it.
require("./crop-logo-icon.cjs");
