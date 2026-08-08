#!/usr/bin/env node
/**
 * Soft-pilot performance budgets (D17 / Ch17).
 * Measures Vite hashed app chunks only — not CDN Firebase/Lucide/Leaflet.
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assetsDir = path.join(dist, "assets");

/** Soft-pilot budgets (raw bytes on disk). Tuned after Ch17 surface split. */
const BUDGETS = {
  /**
   * Sum of /assets/*.js referenced by driver.html, excluding the shared
   * translations chunk (locale split is a later chapter).
   */
  /** After cutting dispatcher graph from shared i18n (target ~init+driver+shell). */
  driverAppJsBytesExclTranslations: 220 * 1024,
  /** Staff graph: SA companies table/modal + license badge + Phase 1 multi-group (Ultimate v3.1). */
  staffAppJsBytesExclTranslations: 568 * 1024,
  /** Soft-pilot ceiling for shared init/firebase chunk on driver (no dispatcher UI). */
  maxSingleDriverChunkBytes: 150 * 1024,
  /** Shared EN/DE/SR dictionary (license packages + SA table strings). */
  translationsChunkBytes: 368 * 1024,
};

function readHtml(name) {
  return fs.readFileSync(path.join(dist, name), "utf8");
}

function assetRefsFromHtml(html) {
  const refs = new Set();
  const re = /(?:src|href)="(\.?\/?assets\/[^"]+\.js)"/g;
  let match;
  while ((match = re.exec(html))) {
    const rel = match[1].replace(/^\.\//, "").replace(/^\//, "");
    refs.add(rel);
  }
  // modulepreload
  const pre = /modulepreload[^>]+href="(\.?\/?assets\/[^"]+\.js)"/g;
  while ((match = pre.exec(html))) {
    const rel = match[1].replace(/^\.\//, "").replace(/^\//, "");
    refs.add(rel);
  }
  return [...refs];
}

function fileSize(relFromDist) {
  const abs = path.join(dist, relFromDist);
  if (!fs.existsSync(abs)) {
    throw new Error(`Missing built asset: ${relFromDist}`);
  }
  return fs.statSync(abs).size;
}

function findTranslationsChunk() {
  if (!fs.existsSync(assetsDir)) throw new Error("dist/assets missing — run vite build first");
  const hit = fs.readdirSync(assetsDir).find((name) => name.startsWith("translations-") && name.endsWith(".js"));
  if (!hit) throw new Error("translations-* chunk missing");
  return path.join("assets", hit);
}

function assertBudget(label, actual, max) {
  if (actual > max) {
    throw new Error(
      `Bundle budget exceeded: ${label} is ${actual} bytes (max ${max}). ` +
        `See D17 / reports/poglavlje-17-*.md`
    );
  }
  console.log(`OK  ${label}: ${actual} <= ${max}`);
}

if (!fs.existsSync(dist)) {
  throw new Error("dist/ missing — run build before check-bundle-budgets");
}

const isTranslations = (rel) => /(?:^|\/)translations-[^/]+\.js$/.test(rel);
const driverRefs = assetRefsFromHtml(readHtml("driver.html"));
const staffRefs = assetRefsFromHtml(readHtml("staff.html"));
const driverAppRefs = driverRefs.filter((rel) => !isTranslations(rel));
const staffAppRefs = staffRefs.filter((rel) => !isTranslations(rel));
const driverBytes = driverAppRefs.reduce((sum, rel) => sum + fileSize(rel), 0);
const staffBytes = staffAppRefs.reduce((sum, rel) => sum + fileSize(rel), 0);
const translationsRel = findTranslationsChunk();
const translationsBytes = fileSize(translationsRel);
const maxDriverChunk = driverAppRefs.reduce((max, rel) => Math.max(max, fileSize(rel)), 0);

assertBudget(
  "driver app JS excl. translations",
  driverBytes,
  BUDGETS.driverAppJsBytesExclTranslations
);
assertBudget(
  "staff app JS excl. translations",
  staffBytes,
  BUDGETS.staffAppJsBytesExclTranslations
);
assertBudget("largest non-translations driver chunk", maxDriverChunk, BUDGETS.maxSingleDriverChunkBytes);
assertBudget("translations chunk", translationsBytes, BUDGETS.translationsChunkBytes);

// Guard: driver must not preload a dispatcher/state-observer staff blob.
const driverHtml = readHtml("driver.html");
if (/state-observer-setup-staff|dispatcher\/dashboard|group-hub/i.test(driverHtml)) {
  throw new Error("driver.html must not reference staff dispatcher observer modules");
}
for (const rel of driverRefs) {
  const body = fs.readFileSync(path.join(dist, rel), "utf8");
  // String paths for dynamic import() are OK; embedded staff UI implementations are not.
  if (
    body.includes("function renderDispatcherDashboard") ||
    body.includes("function renderGroupHub") ||
    body.includes("openOperationalIncident")
  ) {
    throw new Error(`Driver chunk ${rel} embeds dispatcher UI implementation`);
  }
}

console.log("Bundle budgets OK (D17 soft-pilot).");
module.exports = { BUDGETS };
