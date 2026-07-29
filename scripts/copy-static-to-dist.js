#!/usr/bin/env node
/** Kopira root statiku u dist/ posle Vite build-a */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "dist");

const FILES = [
  "translations.js",
  "sw-driver.js",
  "manifest-driver.webmanifest",
  "templates/BusCommand_Drivers_Import_v1.csv",
];

const DIRS = [
  "icons",
  "brand",
  "promo",
  "dispatcher",
];

if (!fs.existsSync(DIST)) {
  console.error("dist/ ne postoji — prvo pokreni vite build");
  process.exit(1);
}

FILES.forEach(f => {
  const src = path.join(ROOT, f);
  const alt = path.join(ROOT, "public", f);
  const from = fs.existsSync(src) ? src : (fs.existsSync(alt) ? alt : null);
  const dest = path.join(DIST, f);
  if (!from) {
    console.warn("Preskačem (nema):", f);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(from, dest);
  console.log("COPY", f);
});

DIRS.forEach((dir) => {
  const srcDir = path.join(ROOT, "public", dir);
  const destDir = path.join(DIST, dir);
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir)) {
    const source = path.join(srcDir, name);
    if (!fs.statSync(source).isFile()) continue;
    fs.copyFileSync(source, path.join(destDir, name));
    console.log("COPY", path.join(dir, name));
  }
});

// Surface + shared stylesheets referenced by staff/driver HTML (not hashed by Vite)
for (const rel of [
  "style.css",
  "css/design-tokens.css",
  "css/driver-pwa.css",
  "css/brand.css",
  "css/staff-desktop.css"
]) {
  const srcCss = path.join(ROOT, rel);
  if (!fs.existsSync(srcCss)) {
    console.warn("Preskačem (nema):", rel);
    continue;
  }
  const destCss = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(destCss), { recursive: true });
  fs.copyFileSync(srcCss, destCss);
  console.log("COPY", rel);
}
