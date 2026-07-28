#!/usr/bin/env node
/**
 * Faza 5: shell, shifts, schedule-upload + manji moduli
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function readLines(srcRel) {
  return fs.readFileSync(path.join(ROOT, srcRel), "utf8").split("\n");
}

function writeModule(outRel, body) {
  const dir = path.dirname(path.join(ROOT, outRel));
  fs.mkdirSync(dir, { recursive: true });
  const clean = body
    .split("\n")
    .filter(l => !l.startsWith("// Auto-extracted"))
    .join("\n")
    .trim();
  fs.writeFileSync(
    path.join(ROOT, outRel),
    `// ${path.basename(outRel)} — BusCommand v9.3\n\n${clean}\n`
  );
  console.log("OK", outRel);
}

function slice(srcRel, start, end) {
  return readLines(srcRel).slice(start - 1, end).join("\n");
}

function archive(srcRel) {
  const full = path.join(ROOT, srcRel);
  if (!fs.existsSync(full)) return srcRel.replace(/\.js$/, ".legacy.js");
  const dest = srcRel.replace(/\.js$/, ".legacy.js");
  fs.renameSync(full, path.join(ROOT, dest));
  console.log("ARCHIVE", dest);
  return dest;
}

// --- layout/shell.js ---
const shellLegacy = archive("js/layout/shell.js");
writeModule("js/layout/shell.js", slice(shellLegacy, 2, 115));
writeModule("js/layout/pretrip.js", slice(shellLegacy, 117, 192));
writeModule("js/layout/role-switch.js", slice(shellLegacy, 194, 224));
writeModule("js/layout/navigation.js", slice(shellLegacy, 226, 290));

// --- dispatcher/shifts.js ---
const shiftsLegacy = archive("js/dispatcher/shifts.js");
writeModule(
  "js/dispatcher/shift-utils.js",
  slice(shiftsLegacy, 3, 25) + "\n\n" + slice(shiftsLegacy, 172, 175) + "\n\n" + slice(shiftsLegacy, 244, 298)
);
writeModule("js/dispatcher/shift-grid.js", slice(shiftsLegacy, 66, 170));
writeModule(
  "js/dispatcher/shifts.js",
  slice(shiftsLegacy, 27, 65) + "\n\n" + slice(shiftsLegacy, 177, 242)
);

// --- maps/schedule-upload.js ---
const schedLegacy = archive("js/maps/schedule-upload.js");
writeModule("js/maps/schedule-upload.js", slice(schedLegacy, 2, 114));
writeModule("js/maps/schedule-parse.js", slice(schedLegacy, 116, 179));
writeModule("js/maps/schedule-viewer.js", slice(schedLegacy, 181, 231));
writeModule("js/maps/schedule-auto-detect.js", slice(schedLegacy, 233, 283));

console.log("\nFaza 5 završena.");
