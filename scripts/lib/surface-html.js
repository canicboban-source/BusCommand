/**
 * Canonical BusCommand surface HTML + favicon transform (WIDE-04).
 * One pipeline for check (read-only) and explicit maintainer write.
 */
const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = path.join(__dirname, "..", "..");
const SURFACE_FILES = ["index.html", "staff.html", "driver.html"];
const APP_LOGO = "/brand/logo-hero.png";
const FAVICON_ICON = `  <link rel="icon" type="image/png" href="${APP_LOGO}">`;
const FAVICON_APPLE = `  <link rel="apple-touch-icon" href="${APP_LOGO}">`;
const LANDING_REL = path.join("scripts", "landing", "official-landing.html");
const STALE_HINT = [
  "Tracked surface HTML is stale vs the canonical generator (including favicon).",
  "Regular `npm run build` does not modify tracked HTML.",
  "Regenerate committed surfaces with: npm run build:surfaces"
].join("\n");

const STAFF_ONLY_IDS = [
  "dispatcher-password-setup-view",
  "dispatcher-group-setup-view",
  "dispatcher-sos-banner",
  "superadmin-nav",
  "company-admin-nav",
  "dispatcher-nav",
  "superadmin-dashboard",
  "company-admin-dashboard",
  "company-admin-branding",
  "company-admin-groups",
  "company-admin-service-plan",
  "company-admin-drivers",
  "company-admin-audit",
  "company-admin-team",
  "company-admin-settings",
  "dispatcher-shifts",
  "dispatcher-daily-schedule",
  "dispatcher-dashboard",
  "dispatcher-daily-plan-pick",
  "dispatcher-monthly-plan-pick",
  "dispatcher-live-map-section",
  "dispatcher-group-hub",
  "dispatcher-vehicles",
  "dispatcher-monthly-plans-full",
  "dispatcher-daily-plan-full",
  "dispatcher-reports",
  "dispatcher-lost-found",
  "dispatcher-vacations",
  "dispatcher-messages",
  "onboarding-wizard",
  "ca-onboarding-wizard",
  "factory-reset-modal",
  "dispatcher-help-btn",
  "dispatcher-help-modal",
  "print-schedule-modal",
  "clear-sos-modal",
  "superadmin-pin-modal",
  "sa-support-modal",
  "sa-delete-company-modal",
  "duty-conflict-modal"
];

const DRIVER_ONLY_IDS = [
  "driver-activation-modal",
  "driver-nav",
  "driver-dashboard",
  "driver-calendar",
  "driver-reports",
  "driver-vacation",
  "mobile-bottom-nav",
  "fp-mobile-nav",
  "pre-trip-modal",
  "sos-trigger-modal",
  "msg-fullscreen-alert"
];

function toLf(text) {
  return String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimTrailingSpaces(html) {
  return toLf(html).split("\n").map((line) => line.trimEnd()).join("\n");
}

function writeUtf8Lf(file, html) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, toLf(html), "utf8");
}

function applyFavicon(html) {
  let out = toLf(html);
  out = out
    .replace(/\s*<link\b[^>]*\brel=["'](?:shortcut\s+)?icon["'][^>]*>/gi, "")
    .replace(/\s*<link\b[^>]*\brel=["']apple-touch-icon["'][^>]*>/gi, "");
  const titleEnd = out.indexOf("</title>");
  if (titleEnd < 0) throw new Error("Missing <title> in surface HTML");
  const insertAt = titleEnd + "</title>".length;
  return `${out.slice(0, insertAt)}\n${FAVICON_ICON}\n${FAVICON_APPLE}${out.slice(insertAt)}`;
}

function countRelLinks(html, relPattern) {
  const re = new RegExp(`<link\\b[^>]*\\brel=["']${relPattern}["'][^>]*>`, "gi");
  return (toLf(html).match(re) || []).length;
}

function assertFavicon(html, name) {
  const lf = toLf(html);
  const logoLinks = lf.match(/href=["']\/brand\/logo-hero\.png["']/g) || [];
  const icons = countRelLinks(lf, "(?:shortcut\\s+)?icon");
  const apples = countRelLinks(lf, "apple-touch-icon");
  if (icons !== 1 || apples !== 1 || logoLinks.length !== 2 || lf.includes("logo-mark.svg")) {
    throw new Error(`Accepted BusCommand app logo was not linked correctly in ${name}`);
  }
}

/** Remove first element with id=... including nested tags (tag-depth count). */
function removeElementById(html, id) {
  const openRe = new RegExp(`<([a-zA-Z][\\w:-]*)([^>]*\\sid=["']${id}["'][^>]*)>`, "i");
  const match = openRe.exec(html);
  if (!match) return html;
  const tag = match[1].toLowerCase();
  const start = match.index;
  let i = start + match[0].length;
  if (/\/>$/.test(match[0]) || /^(input|img|br|hr|meta|link)$/i.test(tag)) {
    return html.slice(0, start) + html.slice(i);
  }
  let depth = 1;
  const tagRe = new RegExp(`</?${tag}\\b[^>]*>`, "gi");
  tagRe.lastIndex = i;
  let m;
  while ((m = tagRe.exec(html))) {
    const token = m[0];
    if (/^<\//.test(token)) depth -= 1;
    else if (!/\/>$/.test(token)) depth += 1;
    if (depth === 0) {
      return html.slice(0, start) + html.slice(m.index + token.length);
    }
  }
  console.warn("removeElementById: unclosed", id);
  return html;
}

function removeAllById(html, ids) {
  let out = html;
  for (const id of ids) out = removeElementById(out, id);
  return out;
}

function buildSurfaceHtml(monolith, surface, entryScript, extras = {}) {
  let html = monolith;
  html = html.replace(/<html\s+lang="en">/, `<html lang="en" data-app-surface="${surface}">`);

  if (surface === "driver") {
    html = html.replace(/<title>[^<]*<\/title>/, "<title>BusCommand — Driver</title>");
    html = html.replace(/<!-- PDF\.js[\s\S]*?xlsx\.full\.min\.js"><\/script>\s*/i, "");
    html = html.replace(/<!-- Leaflet\.js[\s\S]*?leaflet\.js"[^>]*><\/script>\s*/i, "");
    html = removeAllById(html, STAFF_ONLY_IDS);
    html = html.replace(/\s*data-action="handleLogoClick"/g, "");
    html = html.replace(
      /id="tab-dispatcher-btn"/,
      'id="tab-dispatcher-btn" class="login-tab hidden" hidden'
    );
    html = html.replace(
      'class="login-tab hidden" class="login-tab"',
      'class="login-tab hidden"'
    );
  } else {
    html = html.replace(/<title>[^<]*<\/title>/, "<title>BusCommand — Dispatcher & Admin</title>");
    html = removeAllById(html, DRIVER_ONLY_IDS);
    html = html.replace(
      /id="tab-driver-btn"[^>]*class="login-tab[^"]*"/,
      'id="tab-driver-btn" class="login-tab hidden" hidden style="display:none;" aria-hidden="true"'
    );
    html = html.replace(
      /id="tab-dispatcher-btn" class="login-tab"/,
      'id="tab-dispatcher-btn" class="login-tab active"'
    );
    html = html.replace(
      /id="driver-login-form" class="login-form-content"/,
      'id="driver-login-form" class="login-form-content hidden" hidden style="display:none;" aria-hidden="true"'
    );
    html = html.replace(
      /id="dispatcher-login-form" class="login-form-content hidden"/,
      'id="dispatcher-login-form" class="login-form-content"'
    );
  }

  const headExtra = surface === "driver" ? (extras.headLinks || "") : (extras.staffHead || "");
  const filteredExtra = headExtra.replace(/\s*<link rel="stylesheet" href="css\/brand\.css">\s*/g, "\n");
  html = html.replace(
    /<script type="module" src="js\/main\.js"><\/script>/,
    `${filteredExtra}    <script type="module" src="${entryScript}"></script>`
  );
  return html;
}

function assertSurface(html, surface) {
  const mustHave = surface === "driver"
    ? ["driver-dashboard", "main-driver.js", "data-app-surface=\"driver\""]
    : ["dispatcher-dashboard", "main-staff.js", "data-app-surface=\"staff\""];
  const mustNot = surface === "driver"
    ? ["dispatcher-dashboard", "company-admin-dashboard", "leaflet", "superadmin-pin-modal", "handleLogoClick"]
    : ["driver-dashboard", "mobile-bottom-nav", "pre-trip-modal"];
  for (const needle of mustHave) {
    if (!html.includes(needle)) throw new Error(`${surface} missing: ${needle}`);
  }
  for (const needle of mustNot) {
    if (html.includes(needle)) throw new Error(`${surface} still contains: ${needle}`);
  }
}

function assertLanding(html) {
  for (const needle of [
    'id="top"',
    'id="compare"',
    'id="downloads"',
    'id="pricing"',
    'data-lang="de"',
    'data-lang="sr"',
    'data-lang="en"',
    "/downloads/BusCommand_Technical_Security_Audit.html",
    'href="/staff"',
    'href="/driver"'
  ]) {
    if (!html.includes(needle)) {
      throw new Error(`Official landing missing required marker: ${needle}`);
    }
  }
  if (html.includes('class="card"') && !html.includes("compare-card")) {
    throw new Error("Official landing looks like the minimal two-button card; refusing to write.");
  }
}

function readMonolith(root) {
  const legacyPath = path.join(root, "index.legacy-monolith.html");
  const srcPath = fs.existsSync(legacyPath) ? legacyPath : path.join(root, "index.html");
  const src = fs.readFileSync(srcPath, "utf8");
  if (!src.includes("login-screen") || !src.includes("app-container")) {
    throw new Error(`Source HTML does not look like the BusCommand app shell: ${srcPath}`);
  }
  return { srcPath, src: toLf(src) };
}

function buildCanonicalSurfaces(root = DEFAULT_ROOT) {
  const { srcPath, src } = readMonolith(root);
  const driverHead = `    <link rel="manifest" href="/manifest-driver.webmanifest">
    <meta name="theme-color" content="#0b1220">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="BusCommand">
    <link rel="stylesheet" href="css/brand.css">
    <link rel="stylesheet" href="css/driver-pwa.css">
`;
  const staffHead = `    <link rel="stylesheet" href="css/brand.css">
    <link rel="stylesheet" href="css/staff-desktop.css">
`;
  const driverHtml = applyFavicon(trimTrailingSpaces(
    buildSurfaceHtml(src, "driver", "js/main-driver.js", { headLinks: driverHead })
  ));
  const staffHtml = applyFavicon(trimTrailingSpaces(
    buildSurfaceHtml(src, "staff", "js/main-staff.js", { staffHead })
  ));
  const landingSourcePath = path.join(root, LANDING_REL);
  if (!fs.existsSync(landingSourcePath)) {
    throw new Error(`Missing official landing source: ${landingSourcePath}`);
  }
  const landing = applyFavicon(toLf(fs.readFileSync(landingSourcePath, "utf8")));
  assertSurface(driverHtml, "driver");
  assertSurface(staffHtml, "staff");
  assertLanding(landing);
  assertFavicon(driverHtml, "driver.html");
  assertFavicon(staffHtml, "staff.html");
  assertFavicon(landing, "index.html");
  return {
    srcPath,
    files: {
      "driver.html": driverHtml,
      "staff.html": staffHtml,
      "index.html": landing
    }
  };
}

function readSurfaceDir(dir) {
  const out = {};
  for (const name of SURFACE_FILES) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) throw new Error(`Missing generated surface: ${name}`);
    out[name] = fs.readFileSync(file, "utf8");
  }
  return out;
}

function checkSurfaces({ root = DEFAULT_ROOT, dir = root } = {}) {
  const { files } = buildCanonicalSurfaces(root);
  const existing = readSurfaceDir(dir);
  const stale = [];
  for (const name of SURFACE_FILES) {
    if (toLf(existing[name]) !== toLf(files[name])) stale.push(name);
  }
  if (stale.length) {
    const err = new Error(`${STALE_HINT}\nStale files: ${stale.join(", ")}`);
    err.stale = stale;
    throw err;
  }
  return { ok: true, files: SURFACE_FILES.slice() };
}

function syncDistHtml(root, files) {
  const dist = path.join(root, "dist");
  if (!fs.existsSync(dist)) return;
  for (const name of SURFACE_FILES) {
    writeUtf8Lf(path.join(dist, name), files[name]);
  }
  const brandSrc = path.join(root, "public", "brand");
  const brandDest = path.join(dist, "brand");
  if (fs.existsSync(brandSrc)) {
    fs.mkdirSync(brandDest, { recursive: true });
    for (const name of fs.readdirSync(brandSrc)) {
      fs.copyFileSync(path.join(brandSrc, name), path.join(brandDest, name));
    }
  }
  for (const rel of ["css/brand.css", "css/driver-pwa.css", "css/staff-desktop.css", "css/landing.css"]) {
    const srcCss = path.join(root, rel);
    if (!fs.existsSync(srcCss)) continue;
    const destCss = path.join(dist, rel);
    fs.mkdirSync(path.dirname(destCss), { recursive: true });
    fs.copyFileSync(srcCss, destCss);
  }
}

function writeSurfaces({ root = DEFAULT_ROOT, dir = root, syncDist = true } = {}) {
  const { srcPath, files } = buildCanonicalSurfaces(root);
  for (const name of SURFACE_FILES) {
    writeUtf8Lf(path.join(dir, name), files[name]);
  }
  if (syncDist && dir === root) syncDistHtml(root, files);
  return { srcPath, files };
}

function parseCliArgs(argv) {
  const args = argv.slice();
  let outDir = null;
  const outIdx = args.indexOf("--out-dir");
  if (outIdx >= 0) {
    outDir = args[outIdx + 1];
    if (!outDir || outDir.startsWith("--")) {
      throw new Error("--out-dir requires a path");
    }
  }
  const write = args.includes("--write");
  const checkFlag = args.includes("--check");
  if (write && checkFlag) {
    throw new Error("Use either --check or --write, not both");
  }
  const mode = write ? "write" : "check";
  return { mode, outDir };
}

function runSurfaceCli(argv, options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const { mode, outDir } = parseCliArgs(argv);
  const target = outDir ? path.resolve(outDir) : root;
  if (mode === "write") {
    const { srcPath, files } = writeSurfaces({
      root,
      dir: target,
      syncDist: !outDir
    });
    console.log(
      `Wrote driver.html, staff.html, index.html (landing) from ${path.basename(srcPath)}`
    );
    console.log("  driver bytes:", files["driver.html"].length, "| staff bytes:", files["staff.html"].length);
    if (!outDir && fs.existsSync(path.join(root, "dist"))) {
      console.log("Synced surface HTML + brand assets → dist/");
    }
    return { mode, target };
  }
  checkSurfaces({ root, dir: target });
  console.log("Surface HTML check OK (tracked files match canonical generator + favicon).");
  return { mode: "check", target };
}

function runFaviconCli(argv, options = {}) {
  const root = options.root || DEFAULT_ROOT;
  const { mode, outDir } = parseCliArgs(argv);
  const target = outDir ? path.resolve(outDir) : root;
  for (const name of SURFACE_FILES) {
    const file = path.join(target, name);
    if (!fs.existsSync(file)) throw new Error(`Missing generated surface: ${name}`);
    const current = fs.readFileSync(file, "utf8");
    const next = applyFavicon(current);
    assertFavicon(next, name);
    if (mode === "write") {
      writeUtf8Lf(file, next);
    } else if (toLf(current) !== next) {
      const err = new Error(`${STALE_HINT}\nFavicon transform would change ${name}`);
      err.stale = [name];
      throw err;
    }
    console.log(`FAVICON OK ${name} -> ${APP_LOGO}`);
  }
  return { mode, target };
}

module.exports = {
  APP_LOGO,
  DEFAULT_ROOT,
  LANDING_REL,
  STALE_HINT,
  SURFACE_FILES,
  applyFavicon,
  assertFavicon,
  assertSurface,
  buildCanonicalSurfaces,
  checkSurfaces,
  parseCliArgs,
  runFaviconCli,
  runSurfaceCli,
  toLf,
  writeSurfaces
};
