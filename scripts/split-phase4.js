#!/usr/bin/env node
/**
 * Faza 4: dispatcher messages/dashboard, dispatcher-map, driver messages
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
  if (!fs.existsSync(full)) return;
  const dest = srcRel.replace(/\.js$/, ".legacy.js");
  fs.renameSync(full, path.join(ROOT, dest));
  console.log("ARCHIVE", dest);
}

// --- dispatcher/messages.js ---
const dispMsg = "js/dispatcher/messages.js";
writeModule("js/dispatcher/msg-compose.js", slice(dispMsg, 2, 218));
writeModule("js/dispatcher/reports.js", slice(dispMsg, 220, 309));
writeModule("js/dispatcher/lost-items.js", slice(dispMsg, 311, 365));
writeModule("js/dispatcher/vacations.js", slice(dispMsg, 367, 417));
writeModule("js/dispatcher/settings.js", slice(dispMsg, 419, 438));
archive(dispMsg);

// --- dispatcher/dashboard.js ---
const dispDash = "js/dispatcher/dashboard.js";
archive(dispDash);
const dashLegacy = "js/dispatcher/dashboard.legacy.js";
writeModule("js/dispatcher/dashboard.js", slice(dashLegacy, 3, 142));
writeModule("js/dispatcher/sent-messages.js", slice(dashLegacy, 144, 282));
writeModule("js/dispatcher/quick-view.js", slice(dashLegacy, 285, 372));

// --- maps/dispatcher-map.js ---
const dispMap = "js/maps/dispatcher-map.js";
writeModule("js/maps/map-data.js", slice(dispMap, 4, 48));
writeModule("js/maps/live-map-core.js", slice(dispMap, 50, 210));
writeModule("js/maps/sos-siren.js", slice(dispMap, 212, 275));
writeModule("js/maps/damage-photo.js", slice(dispMap, 277, 305));
writeModule("js/ui/speak.js", slice(dispMap, 307, 336));
writeModule("js/driver/quick-reports.js", slice(dispMap, 338, 383));
archive(dispMap);

// --- driver/messages.js ---
const drvMsg = "js/driver/messages.js";
writeModule("js/driver/message-alerts.js", slice(drvMsg, 83, 114) + "\n\n" + slice(drvMsg, 230, 353));
writeModule("js/driver/messages-inbox.js", slice(drvMsg, 2, 81));
writeModule("js/driver/avatar.js", slice(drvMsg, 116, 228));
archive(drvMsg);

console.log("\nFaza 4 završena.");
