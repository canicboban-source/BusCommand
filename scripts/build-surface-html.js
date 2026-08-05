#!/usr/bin/env node
/**
 * Builds driver.html + staff.html from monolith shell + landing index.html.
 * Run: node scripts/build-surface-html.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const legacyPath = path.join(ROOT, "index.legacy-monolith.html");
const srcPath = fs.existsSync(legacyPath) ? legacyPath : path.join(ROOT, "index.html");
const src = fs.readFileSync(srcPath, "utf8");

if (!src.includes("login-screen") || !src.includes("app-container")) {
  console.error("Source HTML does not look like the BusCommand app shell:", srcPath);
  process.exit(1);
}

/** Remove first element with id=... including nested tags (tag-depth count). */
function removeElementById(html, id) {
  const openRe = new RegExp(`<([a-zA-Z][\\w:-]*)([^>]*\\sid=["']${id}["'][^>]*)>`, "i");
  const match = openRe.exec(html);
  if (!match) return html;
  const tag = match[1].toLowerCase();
  const start = match.index;
  let i = start + match[0].length;
  // self-closing
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
  "dispatcher-monthly-plans-full",
  "dispatcher-daily-plan-full",
  "dispatcher-reports",
  "dispatcher-lost-found",
  "dispatcher-vacations",
  "dispatcher-messages",
  "onboarding-wizard",
  "ca-onboarding-wizard",
  "factory-reset-modal",
  "print-schedule-modal",
  "clear-sos-modal",
  // The Super Admin entry only has handlers on the staff bundle, so on the
  // driver surface this markup was a modal nothing could open. The id here used
  // to be "sa-pin-modal", which matches nothing in the shell.
  "superadmin-pin-modal"
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

function buildSurfaceHtml(surface, entryScript, extras = {}) {
  let html = src;
  html = html.replace(/<html\s+lang="en">/, `<html lang="en" data-app-surface="${surface}">`);

  if (surface === "driver") {
    html = html.replace(/<title>[^<]*<\/title>/, "<title>BusCommand — Driver</title>");
    html = html.replace(/<!-- PDF\.js[\s\S]*?xlsx\.full\.min\.js"><\/script>\s*/i, "");
    html = html.replace(/<!-- Leaflet\.js[\s\S]*?leaflet\.js"[^>]*><\/script>\s*/i, "");
    html = removeAllById(html, STAFF_ONLY_IDS);
    // The logo is the Super Admin entry point, and that handler is only bundled
    // for staff. Leaving the action here would advertise a click that does
    // nothing.
    html = html.replace(/\s*data-action="handleLogoClick"/g, "");
    // Hide staff login tab markup (JS also hides it)
    html = html.replace(
      /id="tab-dispatcher-btn"/,
      'id="tab-dispatcher-btn" class="login-tab hidden" hidden'
    );
    // Fix duplicate class if already present
    html = html.replace(
      'class="login-tab hidden" class="login-tab"',
      'class="login-tab hidden"'
    );
  } else {
    html = html.replace(/<title>[^<]*<\/title>/, "<title>BusCommand — Dispatcher & Admin</title>");
    html = removeAllById(html, DRIVER_ONLY_IDS);
    html = html.replace(
      /id="tab-driver-btn"/,
      'id="tab-driver-btn" class="login-tab hidden" hidden'
    );
    // Staff preview: email/password only — never show driver PWA login markup first
    html = html.replace(
      /id="driver-login-form" class="login-form-content"/,
      'id="driver-login-form" class="login-form-content hidden" hidden'
    );
    html = html.replace(
      /id="dispatcher-login-form" class="login-form-content hidden"/,
      'id="dispatcher-login-form" class="login-form-content"'
    );
  }

    const headExtra = surface === "driver" ? (extras.headLinks || "") : (extras.staffHead || "");
  // brand.css already in monolith head — avoid duplicate when injecting surface CSS
  const filteredExtra = headExtra.replace(/\s*<link rel="stylesheet" href="css\/brand\.css">\s*/g, "\n");
  html = html.replace(
    /<script type="module" src="js\/main\.js"><\/script>/,
    `${filteredExtra}    <script type="module" src="${entryScript}"></script>`
  );

  return html;
}

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

const driverHtml = buildSurfaceHtml("driver", "js/main-driver.js", { headLinks: driverHead });
const staffHtml = buildSurfaceHtml("staff", "js/main-staff.js", { staffHead });

fs.writeFileSync(path.join(ROOT, "driver.html"), driverHtml);
fs.writeFileSync(path.join(ROOT, "staff.html"), staffHtml);

// Preview entry: one BusCommand app (email + password). Driver PWA is not offered on `/`.
const landing = `<!DOCTYPE html>
<html lang="sr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BusCommand</title>
  <link rel="icon" type="image/png" href="/brand/logo-hero.png">
  <link rel="apple-touch-icon" href="/brand/logo-hero.png">
  <meta http-equiv="refresh" content="0;url=/staff.html">
  <link rel="canonical" href="/staff.html">
  <script>
    location.replace("/staff.html" + location.search + location.hash);
  </script>
</head>
<body>
  <p style="font-family:system-ui,sans-serif;text-align:center;margin-top:20vh;color:#94a3b8;">
    <a href="/staff.html" style="color:#3b82f6;font-weight:600;text-decoration:none;">BusCommand</a>
  </p>
</body>
</html>
`;

if (!fs.existsSync(legacyPath) && path.basename(srcPath) === "index.html" && src.includes("login-screen")) {
  fs.copyFileSync(srcPath, legacyPath);
  console.log("BACKUP index → index.legacy-monolith.html");
}

fs.writeFileSync(path.join(ROOT, "index.html"), landing);

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

assertSurface(driverHtml, "driver");
assertSurface(staffHtml, "staff");
console.log("Wrote driver.html, staff.html, index.html (landing) from", path.basename(srcPath));
console.log("  driver bytes:", driverHtml.length, "| staff bytes:", staffHtml.length);

// Keep dist/ in sync — api-server serves dist when present
const DIST = path.join(ROOT, "dist");
if (fs.existsSync(DIST)) {
  for (const name of ["driver.html", "staff.html", "index.html"]) {
    fs.copyFileSync(path.join(ROOT, name), path.join(DIST, name));
  }
  const brandSrc = path.join(ROOT, "public", "brand");
  const brandDest = path.join(DIST, "brand");
  if (fs.existsSync(brandSrc)) {
    fs.mkdirSync(brandDest, { recursive: true });
    for (const name of fs.readdirSync(brandSrc)) {
      fs.copyFileSync(path.join(brandSrc, name), path.join(brandDest, name));
    }
  }
  for (const rel of ["css/brand.css", "css/driver-pwa.css", "css/staff-desktop.css"]) {
    const srcCss = path.join(ROOT, rel);
    if (!fs.existsSync(srcCss)) continue;
    const destCss = path.join(DIST, rel);
    fs.mkdirSync(path.dirname(destCss), { recursive: true });
    fs.copyFileSync(srcCss, destCss);
  }
  console.log("Synced surface HTML + brand assets → dist/");
}
