#!/usr/bin/env node
/**
 * Ekstrahuje app.js u js/ module (bez transformacije tela funkcija).
 * node scripts/extract-modules.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const lines = fs.readFileSync(path.join(ROOT, "app.js"), "utf8").split("\n");

const SLICES = [
  { file: "js/auth/superadmin.js",        start: 12,   end: 95 },
  { file: "js/core/utils.js",             start: 97,   end: 208 },
  { file: "js/core/constants.js",         start: 212,  end: 352, constToVar: true },
  { file: "js/core/state.js",             start: 354,  end: 413, stripLines: [363, 364, 365] },
  { file: "js/ui/modals.js",              start: 417,  end: 468 },
  { file: "js/features/print-calendar.js",start: 474,  end: 527 },
  { file: "js/dispatcher/dispatchers.js", start: 532,  end: 633 },
  { file: "js/core/export-csv.js",        start: 641,  end: 671 },
  { file: "js/maps/gps-track.js",         start: 676,  end: 697 },
  { file: "js/features/onboarding.js",    start: 704,  end: 891 },
  { file: "js/ui/theme.js",               start: 895,  end: 914 },
  { file: "js/ui/mode-badge.js",          start: 1016, end: 1035 },
  { file: "js/core/license.js",           start: 1038, end: 1083, stripLines: [1038] },
  { file: "js/sync/cross-tab.js",         start: 1086, end: 1137 },
  { file: "js/ui/i18n.js",                start: 1139, end: 1373 },
  { file: "js/auth/login.js",             start: 1375, end: 1715 },
  { file: "js/layout/shell.js",           start: 1717, end: 2005 },
  { file: "js/dispatcher/shifts.js",        start: 2011, end: 2310, stripLines: [2011] },
  { file: "js/driver/index.js",           start: 2311, end: 3654 },
  { file: "js/dispatcher/messages.js",    start: 3664, end: 4100 },
  { file: "js/data/fleet-data.js",        start: 4106, end: 4531 },
  { file: "js/maps/live-map.js",          start: 4534, end: 5405 },
  { file: "js/admin/index.js",            start: 5411, end: 6003 },
  { file: "js/data/schedules.js",         start: 6009, end: 6117, stripLines: [6009, 6010] },
  { file: "js/layout/mobile-nav.js",      start: 6121, end: 6176 },
  { file: "js/bootstrap/init.js",         start: 916,  end: 1014 },
];

function extract(slice) {
  let body = lines.slice(slice.start - 1, slice.end);
  if (slice.stripLines) {
    const remove = new Set(slice.stripLines.map(n => n - slice.start));
    body = body.filter((_, i) => !remove.has(i));
  }
  let text = body.join("\n");
  if (slice.constToVar) {
    text = text.replace(/^const (FRESH_STATE|DEMO_STATE)/gm, "var $1");
  }
  const dir = path.dirname(path.join(ROOT, slice.file));
  fs.mkdirSync(dir, { recursive: true });
  const header = `// Auto-extracted from app.js (lines ${slice.start}-${slice.end})\n`;
  fs.writeFileSync(path.join(ROOT, slice.file), header + text + "\n");
  console.log("OK", slice.file);
}

// Backup
fs.copyFileSync(path.join(ROOT, "app.js"), path.join(ROOT, "app.legacy.js"));

for (const s of SLICES) extract(s);

console.log("\nBackup: app.legacy.js");
