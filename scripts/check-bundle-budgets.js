#!/usr/bin/env node
/**
 * Soft-pilot performance budgets (D17 / Ch17 / WIDE-36).
 * Measures Vite hashed app chunks only — not CDN Firebase/Lucide/Leaflet.
 *
 * Staff reports:
 *   A. anonymous initial Staff payload (staff.html refs, excl. translations)
 *   B. cumulative after Company Admin role graph
 *   C. cumulative after Dispatcher role graph
 *   D. translations chunk (separate)
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assetsDir = path.join(dist, "assets");
const manifestPath = path.join(dist, ".vite", "manifest.json");
const manifestPathAlt = path.join(dist, "manifest.json");

/** Soft-pilot budgets (raw bytes on disk). Tuned after Ch17 surface split. */
const BUDGETS = {
  /**
   * Sum of /assets/*.js referenced by driver.html, excluding the shared
   * translations chunk (locale split is a later chapter).
   */
  /** After cutting dispatcher graph from shared i18n (target ~init+driver+shell). */
  driverAppJsBytesExclTranslations: 220 * 1024,
  /**
   * Anonymous Staff initial graph ceiling (572 KiB legacy ceiling kept —
   * WIDE-36 acceptance also requires initial ≤ 90% of Linux baseline 585065).
   */
  staffAppJsBytesExclTranslations: 572 * 1024,
  /** Linux CI baseline before role-graph split (excl. translations). */
  staffInitialBaselineBytes: 585065,
  /** Acceptance: initial must drop ≥ 32 KiB vs baseline and stay ≤ 90% of old ceiling. */
  staffInitialMaxBytes: Math.min(572 * 1024, Math.floor(585065 * 0.9)),
  /** Soft-pilot ceiling for shared init/firebase chunk on driver (no dispatcher UI). */
  maxSingleDriverChunkBytes: 150 * 1024,
  /**
   * Shared dictionary chunk. +1 KiB in Phase 0 closeout for monthly_edit_day /
   * assigned-day plural strings (en/sr/de only — kept out of 16-lang propagate).
   * +1 KiB in P1.1 for inactive bus operational integrity translations.
   */
  translationsChunkBytes: 370 * 1024,
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

function loadManifest() {
  const p = fs.existsSync(manifestPath) ? manifestPath : manifestPathAlt;
  if (!fs.existsSync(p)) {
    throw new Error("Vite manifest missing — enable build.manifest and rebuild");
  }
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function findManifestEntry(manifest, predicate) {
  return Object.entries(manifest).find(([key, value]) => predicate(key, value));
}

/**
 * Collect transitive JS file set for a Vite manifest entry (imports + dynamicImports).
 * Role chunks must remain measurable even when not in staff.html modulepreload.
 */
function collectEntryBytes(manifest, entrySrcSubstring) {
  const hit = findManifestEntry(
    manifest,
    (key, value) => {
      const norm = key.replaceAll("\\", "/");
      if (norm.includes(entrySrcSubstring)) return true;
      const src = String(value?.src || "").replaceAll("\\", "/");
      return src.includes(entrySrcSubstring);
    }
  );
  if (!hit) {
    // Fallback: hashed dynamic chunk whose file name still carries the role marker.
    const byFile = findManifestEntry(
      manifest,
      (key, value) => {
        const file = String(value?.file || key).replaceAll("\\", "/");
        if (entrySrcSubstring.includes("company-admin")) {
          return /install-company-admin-role|staff-role-ca/i.test(file) && value?.isDynamicEntry;
        }
        if (entrySrcSubstring.includes("dispatcher-role")) {
          return /install-dispatcher-role|staff-role-dispatcher/i.test(file) && value?.isDynamicEntry;
        }
        return false;
      }
    );
    if (!byFile) {
      throw new Error(`Manifest entry not found for ${entrySrcSubstring}`);
    }
    return collectFromKey(manifest, byFile[0]);
  }
  return collectFromKey(manifest, hit[0]);
}

function collectFromKey(manifest, entryKey) {
  const files = new Set();
  const walk = (key, stack = new Set()) => {
    if (stack.has(key)) return;
    stack.add(key);
    const entry = manifest[key];
    if (!entry) return;
    if (entry.file && String(entry.file).endsWith(".js")) {
      const rel = entry.file.replace(/^\//, "");
      files.add(rel.startsWith("assets/") ? rel : `assets/${path.basename(rel)}`);
    }
    // Static graph only — further lazy clicks (audit/onboarding/plan-import/msg-compose)
    // stay out of the role-loaded cumulative measurement.
    for (const imp of entry.imports || []) walk(imp, stack);
  };
  walk(entryKey);
  return { entryKey, files: [...files], bytes: [...files].reduce((s, rel) => s + fileSize(rel), 0) };
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

function sumUnique(refs) {
  const set = new Set(refs);
  return [...set].reduce((sum, rel) => sum + fileSize(rel), 0);
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
const staffInitialBytes = staffAppRefs.reduce((sum, rel) => sum + fileSize(rel), 0);
const translationsRel = findTranslationsChunk();
const translationsBytes = fileSize(translationsRel);
const maxDriverChunk = driverAppRefs.reduce((max, rel) => Math.max(max, fileSize(rel)), 0);

const manifest = loadManifest();
const caGraph = collectEntryBytes(manifest, "/staff/install-company-admin-role");
const dispoGraph = collectEntryBytes(manifest, "/staff/install-dispatcher-role");

const staffPlusCaFiles = new Set([...staffAppRefs, ...caGraph.files.filter((f) => !isTranslations(f))]);
const staffPlusDispoFiles = new Set([...staffAppRefs, ...dispoGraph.files.filter((f) => !isTranslations(f))]);
const staffPlusCaBytes = sumUnique(staffPlusCaFiles);
const staffPlusDispoBytes = sumUnique(staffPlusDispoFiles);

const baseline = BUDGETS.staffInitialBaselineBytes;
const savedVsBaseline = baseline - staffInitialBytes;
const headroomVsLegacyCeiling = BUDGETS.staffAppJsBytesExclTranslations - staffInitialBytes;
const headroomVsAcceptance = BUDGETS.staffInitialMaxBytes - staffInitialBytes;
const fillPct = ((staffInitialBytes / BUDGETS.staffAppJsBytesExclTranslations) * 100).toFixed(2);

console.log("--- Staff role-graph measurement (WIDE-36) ---");
console.log(`A  staff initial excl. translations: ${staffInitialBytes} B`);
console.log(`B  staff + CA role cumulative:       ${staffPlusCaBytes} B (role-only ${caGraph.bytes} B, files ${caGraph.files.length})`);
console.log(`C  staff + Dispatcher cumulative:    ${staffPlusDispoBytes} B (role-only ${dispoGraph.bytes} B, files ${dispoGraph.files.length})`);
console.log(`D  translations chunk:               ${translationsBytes} B`);
console.log(`   baseline (Linux): ${baseline} B; saved: ${savedVsBaseline} B; fill of legacy ceiling: ${fillPct}%`);
console.log(`   headroom vs legacy 572KiB: ${headroomVsLegacyCeiling} B; vs acceptance max ${BUDGETS.staffInitialMaxBytes}: ${headroomVsAcceptance} B`);

assertBudget(
  "driver app JS excl. translations",
  driverBytes,
  BUDGETS.driverAppJsBytesExclTranslations
);
assertBudget(
  "staff app JS excl. translations (legacy ceiling)",
  staffInitialBytes,
  BUDGETS.staffAppJsBytesExclTranslations
);
assertBudget(
  "staff initial vs WIDE-36 acceptance max",
  staffInitialBytes,
  BUDGETS.staffInitialMaxBytes
);
if (savedVsBaseline < 32 * 1024) {
  throw new Error(
    `Staff initial must drop ≥ 32 KiB vs baseline ${baseline}; saved only ${savedVsBaseline} B (actual ${staffInitialBytes})`
  );
}
console.log(`OK  staff initial drop vs baseline: ${savedVsBaseline} >= ${32 * 1024}`);

if (staffPlusCaBytes > baseline) {
  throw new Error(
    `CA cumulative ${staffPlusCaBytes} exceeds baseline ${baseline} without approved evidence`
  );
}
console.log(`OK  staff+CA cumulative <= baseline: ${staffPlusCaBytes} <= ${baseline}`);

if (staffPlusDispoBytes > baseline) {
  throw new Error(
    `Dispatcher cumulative ${staffPlusDispoBytes} exceeds baseline ${baseline} without approved evidence`
  );
}
console.log(`OK  staff+Dispo cumulative <= baseline: ${staffPlusDispoBytes} <= ${baseline}`);

assertBudget("largest non-translations driver chunk", maxDriverChunk, BUDGETS.maxSingleDriverChunkBytes);
assertBudget("translations chunk", translationsBytes, BUDGETS.translationsChunkBytes);

// Guard: initial staff.html must not preload role payloads or duplicate modulepreloads.
const staffHtml = readHtml("staff.html");
if (/staff-role-ca|staff-role-dispatcher|install-company-admin-role|install-dispatcher-role/i.test(staffHtml)) {
  throw new Error("staff.html must not modulepreload CA/Dispatcher role payloads");
}
const preloadHrefs = [...staffHtml.matchAll(/modulepreload[^>]+href="([^"]+)"/g)].map((m) => m[1]);
const preloadDupes = preloadHrefs.filter((href, i) => preloadHrefs.indexOf(href) !== i);
if (preloadDupes.length) {
  throw new Error(`Duplicate modulepreload in staff.html: ${preloadDupes.join(", ")}`);
}

// Guard: driver must not preload a dispatcher/state-observer staff blob.
const driverHtml = readHtml("driver.html");
if (/state-observer-setup-staff|dispatcher\/dashboard|group-hub|staff-role-ca|staff-role-dispatcher/i.test(driverHtml)) {
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
  // Dynamic import() path strings for Staff role graphs are allowed in shared
  // bootstrap only when gated by isStaffSurface — never embed the role bodies.
  if (
    /function\s+install\s*\(\)\s*\{/.test(body) &&
    /registerCompanyAdminSections|registerDispatcherSections/.test(body)
  ) {
    throw new Error(`Driver chunk ${rel} embeds staff role installer body`);
  }
}

// Landing must not reference staff role graphs.
if (fs.existsSync(path.join(dist, "index.html"))) {
  const landing = readHtml("index.html");
  if (/staff-role-ca|staff-role-dispatcher|install-company-admin-role|install-dispatcher-role/i.test(landing)) {
    throw new Error("index.html must not reference Staff role-graph modules");
  }
}

console.log("Bundle budgets OK (D17 soft-pilot + WIDE-36 role split).");
module.exports = { BUDGETS };
