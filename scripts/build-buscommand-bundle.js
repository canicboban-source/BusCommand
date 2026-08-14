#!/usr/bin/env node
/**
 * Generiše js/fleet-bundle.js — svi moduli u jednom install(global) closure-u.
 * Zadržava onclick handlere preko window.* registracije.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const MODULE_ORDER = [
  "js/core/store.js",
  "js/core/constants.js",
  "js/core/utils.js",
  "js/core/state.js",
  "js/core/access.js",
  "js/ui/modals.js",
  "js/features/print-calendar.js",
  "js/dispatcher/dispatchers.js",
  "js/core/export-csv.js",
  "js/maps/gps-track.js",
  "js/features/onboarding.js",
  "js/ui/theme.js",
  "js/core/license.js",
  "js/ui/mode-badge.js",
  "js/sync/cross-tab.js",
  "js/ui/i18n.js",
  "js/ui/confirm-modal.js",
  "js/auth/superadmin.js",
  "js/auth/login-ui.js",
  "js/auth/login-driver.js",
  "js/auth/login-dispatcher.js",
  "js/layout/shell.js",
  "js/layout/pretrip.js",
  "js/layout/role-switch.js",
  "js/layout/navigation.js",
  "js/dispatcher/shift-utils.js",
  "js/dispatcher/shift-grid.js",
  "js/dispatcher/shifts.js",
  "js/driver/dashboard.js",
  "js/ui/speak.js",
  "js/driver/message-alerts.js",
  "js/driver/messages-inbox.js",
  "js/driver/avatar.js",
  "js/driver/calendar.js",
  "js/driver/reports.js",
  "js/dispatcher/msg-compose.js",
  "js/dispatcher/dashboard.js",
  "js/dispatcher/sent-messages.js",
  "js/dispatcher/quick-view.js",
  "js/dispatcher/reports.js",
  "js/dispatcher/lost-items.js",
  "js/dispatcher/vacations.js",
  "js/admin/company-admin-settings.js",
  "js/data/groups.js",
  "js/data/drivers.js",
  "js/data/buses-routes.js",
  "js/maps/helpers.js",
  "js/maps/map-data.js",
  "js/maps/live-map-core.js",
  "js/maps/sos-siren.js",
  "js/maps/damage-photo.js",
  "js/driver/quick-reports.js",
  "js/maps/route-stops.js",
  "js/maps/schedule-parse.js",
  "js/maps/schedule-upload.js",
  "js/maps/schedule-viewer.js",
  "js/maps/schedule-auto-detect.js",
  "js/admin/superadmin.js",
  "js/admin/company-admin.js",
  "js/admin/dispatcher-setup.js",
  "js/data/schedules.js",
  "js/layout/mobile-nav.js",
  "js/bootstrap/init.js",
];

const SKIP_MODULES = new Set([
  "js/maps/map-data.js", // stanje je u shared preamble
]);

/** Jednolinijske deklaracije koje preskačemo (preamble ih već ima) */
const SHARED_DECL_RE = /^(?:let|const)\s+(_confirmCallback|_msgScope)\b/;

function stripHeader(lines) {
  return lines.filter(l => !l.startsWith("// Auto-extracted") && !/^\/\/ [\w.-]+ — BusCommand/.test(l));
}

function transformSource(raw, fileRel) {
  if (SKIP_MODULES.has(fileRel)) {
    return `  // (preskočeno — u shared preamble)`;
  }

  let lines = stripHeader(raw.split("\n"));

  // store.js — IIFE, ostavi netaknut
  if (fileRel.endsWith("store.js")) {
    return lines.join("\n");
  }

  // constants.js + mobile-nav — var → global.
  if (fileRel.endsWith("constants.js") || fileRel.endsWith("mobile-nav.js")) {
    return lines
      .map(l => {
        let x = l.replace(/^var (FRESH_STATE|DEMO_STATE|FP_NAV_MAP)\s*=/, "global.$1 =");
        x = x.replace(/^function (\w+)\s*\(/, "global.$1 = function $1(");
        x = x.replace(/^async function (\w+)\s*\(/, "global.$1 = async function $1(");
        return x;
      })
      .join("\n");
  }

  const out = [];
  let skipUntil = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (skipUntil) {
      if (trimmed === skipUntil) skipUntil = null;
      continue;
    }
    if (trimmed.startsWith("const MSG_TEMPLATES")) {
      skipUntil = "];";
      continue;
    }
    if (SHARED_DECL_RE.test(trimmed)) continue;
    if (/^(?:let|const)\s+(dispatcherMap|busMarkers|gpsSimulationInterval|ROUTE_GPS_PATHS|audioCtx|sirenOscillator|sirenGainNode|sirenInterval)\b/.test(trimmed)) {
      continue;
    }

    let l = line;
    l = l.replace(/^function (\w+)\s*\(/, "global.$1 = function $1(");
    l = l.replace(/^async function (\w+)\s*\(/, "global.$1 = async function $1(");
    out.push(l);
  }
  return out.join("\n");
}

/** Spreči ASI: `}\n(function` se parsira kao poziv funkcije */
function fixAsiBeforeIife(code) {
  return code.replace(/\}\n(\s*)\(function/g, "};\n$1(function");
}

const STORE_GLOBALS = [
  "state", "currentUser", "currentCalendarMonth", "currentShiftWeekOffset",
  "scheduleCurrentTab", "scheduleSelectedFile",
  "_saClickCount", "_saClickTimer", "_licenseInfo",
];

function globalizeStoreRefs(code) {
  for (const id of STORE_GLOBALS) {
    // state.language, state.dispatchers — ali NE audioCtx.state
    code = code.replace(new RegExp(`(?<![.\\w])${id}\\.`, "g"), `global.${id}.`);
    code = code.replace(new RegExp(`(?<![.\\w])${id}([\\[;),\\]|\\?\\s]|\\s*\\|\\|)`, "g"), `global.${id}$1`);
    code = code.replace(new RegExp(`(^|[^\\w.])${id}\\s*=`, "gm"), `$1global.${id} =`);
  }
  return code.replace(/global\.global\./g, "global.");
}

function buildSharedPreamble() {
  return `  // Zajedničko stanje (mapa, poruke, confirm)
  let dispatcherMap = null;
  let busMarkers = {};
  let gpsSimulationInterval = null;
  const ROUTE_GPS_PATHS = {
    "rt-1": [[48.0076,16.2341],[47.9942,16.2483],[47.9822,16.2555],[47.9711,16.2621],[47.9622,16.2733],[47.9422,16.2911],[47.9234,16.3012],[47.9155,16.2811]],
    "rt-2": [[47.9286,16.2167],[47.9177,16.1822],[47.9044,16.1555],[47.9122,16.1211],[47.9022,16.0788]],
    "rt-3": [[47.9534,16.0967],[47.9433,16.1111],[47.9312,16.1311],[47.9222,16.1534],[47.9188,16.1777],[47.9286,16.2167],[47.9455,16.2234],[47.9678,16.2189]],
    "rt-4": [[47.9155,16.2811],[47.9088,16.2755],[47.9011,16.2889],[47.8922,16.2555],[47.8822,16.2422],[47.8544,16.2467],[47.8422,16.2488],[47.8188,16.2455]]
  };
  let audioCtx = null;
  let sirenOscillator = null;
  let sirenGainNode = null;
  let sirenInterval = null;
  let _confirmCallback = null;
  const _msgScope = {};
  const MSG_TEMPLATES = [
    { cat: "tmpl_cat_delay",  items: ["tmpl_delay_5","tmpl_delay_10","tmpl_delay_15","tmpl_delay_20","tmpl_delay_30"] },
    { cat: "tmpl_cat_route",  items: ["tmpl_detour","tmpl_skip_stop","tmpl_route_end","tmpl_route_change"] },
    { cat: "tmpl_cat_ops",    items: ["tmpl_bus_full","tmpl_slow_down","tmpl_pax_check","tmpl_pax_incident","tmpl_police"] },
    { cat: "tmpl_cat_driver", items: ["tmpl_shift_now","tmpl_take_break","tmpl_end_shift","tmpl_call_dispatch","tmpl_help_coming"] }
  ];`;
}

function build() {
  const parts = [];
  for (const rel of MODULE_ORDER) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      console.error("Nedostaje:", rel);
      process.exit(1);
    }
    const raw = fs.readFileSync(full, "utf8");
    parts.push(`  // ── ${rel} ──\n${transformSource(raw, rel)}`);
  }

  const body = `// AUTO-GENERATED — npm run build:bundle
// BusCommand v9.4 — jedan bundle za Vite / ES module

export default function installBusCommand(global) {
${buildSharedPreamble()}

${fixAsiBeforeIife(globalizeStoreRefs(parts.join("\n\n")))}
}
`;

  const outPath = path.join(ROOT, "js", "fleet-bundle.legacy.js");
  fs.writeFileSync(outPath, body);

  const src = fs.readFileSync(outPath, "utf8");
  let depth = 0;
  for (const c of src) {
    if (c === "{") depth++;
    if (c === "}") depth--;
  }
  if (depth !== 0) {
    console.error("GREŠKA: nebalansirane zagrade, delta =", depth);
    process.exit(1);
  }

  const lines = body.split("\n").length;
  console.log("OK js/fleet-bundle.legacy.js (" + lines + " linija, " + MODULE_ORDER.length + " modula)");
}

build();
