#!/usr/bin/env node
/** Kopira root statiku u dist/ posle Vite build-a */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const FILES = [
  "translations.js",
];

if (!fs.existsSync(DIST)) {
  console.error("dist/ ne postoji — prvo pokreni vite build");
  process.exit(1);
}

FILES.forEach(f => {
  const src = path.join(ROOT, f);
  const dest = path.join(DIST, f);
  if (!fs.existsSync(src)) {
    console.warn("Preskačem (nema):", f);
    return;
  }
  fs.copyFileSync(src, dest);
  console.log("COPY", f);
});
