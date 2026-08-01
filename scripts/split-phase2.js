#!/usr/bin/env node
/**
 * Faza 2: dijeli velike module (driver/index.js, maps/live-map.js)
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function extractSlice(srcRel, outRel, start, end, opts = {}) {
  const lines = fs.readFileSync(path.join(ROOT, srcRel), "utf8").split("\n");
  let body = lines.slice(start - 1, end);
  if (opts.skipRelative) {
    body = body.filter((_, i) => !opts.skipRelative.has(i + start));
  }
  let text = body.join("\n");
  if (opts.stripHeader) {
    text = text.replace(/^\/\/ Auto-extracted[^\n]*\n/, "");
  }
  const dir = path.dirname(path.join(ROOT, outRel));
  fs.mkdirSync(dir, { recursive: true });
  const header = `// ${path.basename(outRel)} — BusCommand v9.3\n`;
  fs.writeFileSync(path.join(ROOT, outRel), header + text.trim() + "\n");
  console.log("OK", outRel);
}

// --- driver/index.js → 4 driver + 1 dispatcher ---
const driverSrc = "js/driver/index.js";
extractSlice(driverSrc, "js/driver/dashboard.js", 2, 243, { stripHeader: true });
extractSlice(driverSrc, "js/driver/messages.js", 245, 598, { stripHeader: true });
extractSlice(driverSrc, "js/driver/calendar.js", 599, 817, { stripHeader: true });
extractSlice(driverSrc, "js/driver/reports.js", 819, 973, { stripHeader: true });
extractSlice(driverSrc, "js/dispatcher/dashboard.js", 975, 1345, { stripHeader: true });

// --- maps/live-map.js → 4 fajla (bez duplikata storage listenera) ---
const mapSrc = "js/maps/live-map.js";
extractSlice(mapSrc, "js/maps/helpers.js", 2, 20, { stripHeader: true });
extractSlice(mapSrc, "js/maps/dispatcher-map.js", 40, 421, { stripHeader: true });
extractSlice(mapSrc, "js/maps/route-stops.js", 423, 590, { stripHeader: true });
extractSlice(mapSrc, "js/maps/schedule-upload.js", 592, 873, { stripHeader: true });

// Arhiviraj monolite
fs.renameSync(path.join(ROOT, driverSrc), path.join(ROOT, "js/driver/index.legacy.js"));
fs.renameSync(path.join(ROOT, mapSrc), path.join(ROOT, "js/maps/live-map.legacy.js"));

console.log("\nArhiva: js/driver/index.legacy.js, js/maps/live-map.legacy.js");
