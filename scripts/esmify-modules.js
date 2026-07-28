#!/usr/bin/env node
/**
 * Konvertuje js/ module u pravi ESM (export + import umjesto window.*).
 * Generiše js/install.js (side-effect importi) i poziva generate-register-onclick.js.
 *
 * Pokreni: node scripts/esmify-modules.js
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const CORE_MODULES = [
  "js/core/runtime-config.js",
  "js/core/auth-client.js",
  "js/core/api-client.js",
  "js/core/firebase-service.js",
];

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

const ALL_MODULES = [...CORE_MODULES, ...MODULE_ORDER];

const WINDOW_GLOBALS = new Set([
  "state", "currentUser", "currentCalendarMonth", "currentShiftWeekOffset",
  "scheduleCurrentTab", "scheduleSelectedFile",
  "_saClickCount", "_saClickTimer", "_licenseInfo",
  "TRANSLATIONS",
]);

const SKIP_CONVERT = new Set([
  ...CORE_MODULES,
  "js/core/store.js",
  "js/core/constants.js",
  "js/core/map-data.js",
  "js/maps/map-data.js",
  "js/fleet-bundle.legacy.js",
  "js/install.js",
  "js/register-onclick.js",
  "js/main.js",
]);

const RESERVED = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "instanceof",
  "new", "delete", "void", "await", "function", "async", "class", "const",
  "let", "var", "import", "export", "default", "from", "true", "false",
  "null", "undefined", "this", "super", "try", "else", "do", "case", "break",
  "continue", "throw", "in", "of", "with", "yield", "debugger", "window",
  "document", "console", "Math", "Date", "JSON", "Object", "Array", "String",
  "Number", "Boolean", "Promise", "Set", "Map", "Error", "parseInt", "parseFloat",
  "isNaN", "setTimeout", "setInterval", "clearInterval", "clearTimeout",
  "requestAnimationFrame", "localStorage", "sessionStorage", "location",
  "navigator", "alert", "confirm", "fetch", "L", "firebase", "XLSX", "pdfjsLib",
  "lucide", "Event", "Blob", "FileReader", "URL", "FormData", "Headers",
  "Request", "Response", "AbortController", "Intl", "RegExp",
  "encodeURIComponent", "decodeURIComponent", "btoa", "atob",
]);

function stripHeader(lines) {
  return lines.filter(l => {
    const t = l.trim();
    if (l.startsWith("// Auto-extracted")) return false;
    if (/^\/\/ BusCommand ESM/.test(t)) return false;
    if (/^\/\/ AUTO-GENERATED/.test(t)) return false;
    if (/^\/\/ [\w.-]+ — BusCommand/.test(l)) return false;
    return true;
  });
}

function stripImportBlock(code) {
  return code.replace(/^import\s+[\s\S]*?from\s+["'][^"']+["'];\s*\n*/gm, "");
}

function stripTrailingExports(code) {
  let prev = "";
  while (prev !== code) {
    prev = code;
    code = code.replace(/\nexport\s*\{[^}]*\};\s*$/s, "");
  }
  return code.trimEnd();
}

function collectTopLevelNames(code) {
  const fns = new Set();
  const vars = new Set();
  for (const line of code.split("\n")) {
    let m = line.match(/^function\s+(\w+)\s*\(/);
    if (m) { fns.add(m[1]); continue; }
    m = line.match(/^async\s+function\s+(\w+)\s*\(/);
    if (m) { fns.add(m[1]); continue; }
    m = line.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/);
    if (m) vars.add(m[1]);
  }
  return { fns, vars };
}

function buildExportMap() {
  const map = new Map();
  map.set("Auth", "js/core/auth-client.js");
  map.set("ApiClient", "js/core/api-client.js");
  map.set("BusCommandConfig", "js/core/runtime-config.js");
  map.set("IS_DEMO_MODE", "js/core/runtime-config.js");
  map.set("COMPANY_ID", "js/core/runtime-config.js");
  for (const name of [
    "isFirebaseReady", "loadStateFromFirestore", "saveStateToFirestore",
    "startFirestoreSync", "stopFirestoreSync", "showFirebaseStatus", "initFirebase",
  ]) {
    map.set(name, "js/core/firebase-service.js");
  }

  for (const rel of ALL_MODULES) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    const code = fs.readFileSync(full, "utf8");
    for (const m of code.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) map.set(m[1], rel);
    for (const m of code.matchAll(/^export\s+const\s+(\w+)\s*=/gm)) map.set(m[1], rel);
    const block = code.match(/export\s*\{([^}]+)\}/);
    if (block) {
      block[1].split(",").forEach(part => {
        const name = part.trim().split(/\s+as\s+/)[0].trim();
        if (name) map.set(name, rel);
      });
    }
    const { fns } = collectTopLevelNames(code);
    fns.forEach(f => { if (!map.has(f)) map.set(f, rel); });
  }
  return map;
}

function relImportPath(fromRel, toRel) {
  const from = path.join(ROOT, fromRel);
  const to = path.join(ROOT, toRel);
  let rel = path.relative(path.dirname(from), to).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function globalizeStoreRefs(code) {
  for (const id of WINDOW_GLOBALS) {
    code = code.replace(new RegExp(`(?<![.\\w])${id}\\.`, "g"), `window.${id}.`);
    code = code.replace(new RegExp(`(?<![.\\w])${id}([\\[;),\\]|\\?\\s]|\\s*\\|\\|)`, "g"), `window.${id}$1`);
    code = code.replace(new RegExp(`(^|[^\\w.])${id}\\s*=`, "gm"), `$1window.${id} =`);
  }
  return code.replace(/window\.window\./g, "window.");
}

function convertExternalToImports(code, localFns, moduleRel, exportMap) {
  const needed = new Set();
  const external = new Set([...exportMap.keys()].filter(f => !localFns.has(f)));

  for (const name of external) {
    if (RESERVED.has(name)) continue;
    if (exportMap.get(name) === moduleRel) continue;

    const winCall = new RegExp(`window\\.${name}\\s*\\(`, "g");
    if (winCall.test(code)) {
      code = code.replace(new RegExp(`window\\.${name}\\s*\\(`, "g"), `${name}(`);
      needed.add(name);
    }

    const bareCall = new RegExp(`(?<!(?:function|async function)\\s+)\\b${name}\\s*\\(`, "g");
    if (bareCall.test(code) && exportMap.has(name)) {
      needed.add(name);
    }

    code = code.replace(
      new RegExp(`typeof\\s+${name}\\s*===\\s*["']function["']`, "g"),
      "true"
    );
  }

  if (moduleRel !== "js/core/runtime-config.js") {
    for (const cfg of ["IS_DEMO_MODE", "COMPANY_ID", "BusCommandConfig"]) {
      if (new RegExp(`window\\.${cfg}\\b`).test(code)) {
        code = code.replace(new RegExp(`window\\.${cfg}\\b`, "g"), cfg);
        needed.add(cfg);
      }
    }
  }

  const importsByModule = new Map();
  for (const name of needed) {
    const src = exportMap.get(name);
    if (!src || src === moduleRel) continue;
    if (!importsByModule.has(src)) importsByModule.set(src, new Set());
    importsByModule.get(src).add(name);
  }

  const importLines = [...importsByModule.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([src, names]) => {
      const sorted = [...names].sort();
      const p = relImportPath(moduleRel, src);
      if (sorted.length === 1 && sorted[0] === "Auth") {
        return `import Auth from "${p}";`;
      }
      if (sorted.length === 1 && sorted[0] === "ApiClient") {
        return `import ApiClient from "${p}";`;
      }
      return `import { ${sorted.join(", ")} } from "${p}";`;
    });

  return { code, importBlock: importLines.join("\n") + (importLines.length ? "\n\n" : "") };
}

function fixAsiBeforeIife(code) {
  return code.replace(/\}\n(\s*)\(function/g, "};\n$1(function");
}

function buildExports(localFns, localVars, code) {
  if (/\nexport\s*\{/.test(code)) return "";
  const skipVars = new Set(["_confirmCallback", "colorPicker"]);
  const alreadyExported = new Set();
  for (const m of code.matchAll(/^export\s+(?:const|let|var|function|async function)\s+(\w+)/gm)) {
    alreadyExported.add(m[1]);
  }
  const exportVars = [...localVars].filter(v => !skipVars.has(v) && !v.startsWith("_") && !alreadyExported.has(v));
  const exportFns = [...localFns].filter(f => !alreadyExported.has(f));
  if (exportFns.length === 0 && exportVars.length === 0) return "";
  const parts = [...exportFns, ...exportVars];
  return `\nexport {\n    ${parts.join(",\n    ")}\n};\n`;
}

function convertModule(rel, exportMap) {
  if (SKIP_CONVERT.has(rel)) return null;

  const full = path.join(ROOT, rel);
  let raw = fs.readFileSync(full, "utf8");
  let lines = stripHeader(raw.split("\n"));
  let code = stripTrailingExports(stripImportBlock(lines.join("\n")));

  const { fns: localFns, vars: localVars } = collectTopLevelNames(code);

  if (rel.endsWith("constants.js")) {
    code = code.replace(/^var\s+(FRESH_STATE|DEMO_STATE)\s*=/gm, "export const $1 =");
  }

  if (rel.endsWith("state.js")) {
    code = `import { FRESH_STATE, DEMO_STATE } from "./constants.js";\nimport { IS_DEMO_MODE, COMPANY_ID } from "./runtime-config.js";\n\n` + code;
    code = code.replace(/\bwindow\.IS_DEMO_MODE\b/g, "IS_DEMO_MODE");
    code = code.replace(/\bwindow\.COMPANY_ID\b/g, "COMPANY_ID");
  }

  if (rel.endsWith("live-map-core.js")) {
    code = `import { mapState, ROUTE_GPS_PATHS } from "./map-data.js";\n\n` + code;
    code = code.replace(/\bdispatcherMap\b/g, "mapState.dispatcherMap");
    code = code.replace(/\bbusMarkers\b/g, "mapState.busMarkers");
    code = code.replace(/\bgpsSimulationInterval\b/g, "mapState.gpsSimulationInterval");
  }

  if (rel.endsWith("msg-compose.js")) {
    code = code.replace(/^const MSG_TEMPLATES\s*=/m, "export const MSG_TEMPLATES =");
  }

  if (rel.endsWith("mobile-nav.js")) {
    code = code.replace(/^var\s+FP_NAV_MAP\s*=/m, "export const FP_NAV_MAP =");
  }

  code = globalizeStoreRefs(code);
  const { code: converted, importBlock } = convertExternalToImports(code, localFns, rel, exportMap);
  code = fixAsiBeforeIife(converted);

  const exports = buildExports(localFns, localVars, code);
  return `// BusCommand ESM v9.5\n${importBlock}${code}${exports}`;
}

function generateInstall() {
  const imports = ALL_MODULES.map((rel) => {
    const importPath = "./" + rel.replace(/^js\//, "");
    return `import "${importPath}";`;
  }).join("\n");

  return `// AUTO-GENERATED — node scripts/esmify-modules.js
// Side-effect importi svih modula (v9.5 — bez window registracije)

${imports}

export function installBusCommand() {
    // Moduli se učitavaju importom iznad; onclick handleri u register-onclick.js
}
`;
}

function main() {
  const exportMap = buildExportMap();

  for (const rel of MODULE_ORDER) {
    const out = convertModule(rel, exportMap);
    if (out === null) continue;
    fs.writeFileSync(path.join(ROOT, rel), out);
    console.log("ESM", rel);
  }

  fs.writeFileSync(path.join(ROOT, "js", "install.js"), generateInstall());
  console.log("OK js/install.js");

  execSync("node scripts/generate-register-onclick.js", { cwd: ROOT, stdio: "inherit" });
}

main();
