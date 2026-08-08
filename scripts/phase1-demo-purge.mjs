/**
 * Phase 1 helper: move filled catalogs to test-only fixtures,
 * rename IS_DEMO_MODE → USE_LOCAL_STATE in product JS, strip FORCE_LOCAL_DEMO.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

// 1) Move filled Import xlsx → test fixture only
const filledXlsx = path.join(root, "public/templates/BusCommand_Dienstplan_Import_v1.xlsx");
const fixtureXlsx = path.join(root, "tests/fixtures/qa-dienstplan-sample.xlsx");
ensureDir(path.dirname(fixtureXlsx));
if (fs.existsSync(filledXlsx)) {
  fs.copyFileSync(filledXlsx, fixtureXlsx);
  fs.unlinkSync(filledXlsx);
  console.log("moved filled xlsx → tests/fixtures/qa-dienstplan-sample.xlsx");
} else if (!fs.existsSync(fixtureXlsx)) {
  console.warn("WARNING: filled Import xlsx already missing and no fixture copy");
}

// Remove any leftover filled product templates
for (const name of [
  "BusCommand_Dienstplan_Import_v1.csv",
  "BusCommand_Dienstplan_Import_v1.pdf",
  "BusCommand_Drivers_Import_pilot_sr.csv"
]) {
  const p = path.join(root, "public/templates", name);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    console.log("removed", name);
  }
  const d = path.join(root, "dist/templates", name);
  if (fs.existsSync(d)) {
    fs.unlinkSync(d);
    console.log("removed dist", name);
  }
}
const distImportXlsx = path.join(root, "dist/templates/BusCommand_Dienstplan_Import_v1.xlsx");
if (fs.existsSync(distImportXlsx)) {
  fs.unlinkSync(distImportXlsx);
  console.log("removed dist Import xlsx");
}

// 2) Minimal CSV fixture for unit parse tests (NOT under public/)
const csvFixture = path.join(root, "tests/fixtures/qa-dienstplan-minimal.csv");
if (!fs.existsSync(csvFixture)) {
  fs.writeFileSync(
    csvFixture,
    [
      "section,key,value,duty_code,day_type,work_start,first_trip_start,last_trip_end,work_end,start_location,end_location,sequence,activity_type,start,end,line,course,from,to",
      "PLAN,template_version,BUSCOMMAND-DIENSTPLAN-1,,,,,,,,,,,,,,,",
      "PLAN,plan_code,310,,,,,,,,,,,,,,,",
      "PLAN,plan_version,66,,,,,,,,,,,,,,,",
      "PLAN,valid_from,2026-02-09,,,,,,,,,,,,,,,",
      "PLAN,timezone,Europe/Vienna,,,,,,,,,,,,,,,",
      "SMENE,,,310.S01,SCHOOL_WEEKDAY,04:02,04:33,14:00,14:35,Depot,Depot,,,,,,,",
      "AKTIVNOSTI,,,310.S01,,,,,,,,1,ARBEIT,04:02,04:17,,,,",
      "AKTIVNOSTI,,,310.S01,,,,,,,,2,DEPOT,04:17,04:33,,,,",
      "AKTIVNOSTI,,,310.S01,,,,,,,,3,FAHRT,04:33,14:00,310,101,,,",
      "AKTIVNOSTI,,,310.S01,,,,,,,,4,DEPOT,14:00,14:25,,,,",
      "AKTIVNOSTI,,,310.S01,,,,,,,,5,ARBEIT,14:25,14:35,,,,",
      ""
    ].join("\n"),
    "utf8"
  );
  console.log("wrote tests/fixtures/qa-dienstplan-minimal.csv");
}

// 3) Delete production demo-ops-baseline module
const baseline = path.join(root, "js/core/demo-ops-baseline.js");
if (fs.existsSync(baseline)) {
  fs.unlinkSync(baseline);
  console.log("deleted js/core/demo-ops-baseline.js");
}

// 4) Bulk rename IS_DEMO_MODE → USE_LOCAL_STATE in js/ (product path)
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let renamedFiles = 0;
for (const file of walk(path.join(root, "js"))) {
  let text = fs.readFileSync(file, "utf8");
  const before = text;
  // imports / exports / identifiers
  text = text.replace(/\bIS_DEMO_MODE\b/g, "USE_LOCAL_STATE");
  text = text.replace(/window\.USE_LOCAL_STATE = USE_LOCAL_STATE;/g, "window.USE_LOCAL_STATE = USE_LOCAL_STATE;");
  // avoid double-renaming already-correct USE_LOCAL_STATE imports that also imported alias
  text = text.replace(
    /import \{ USE_LOCAL_STATE, USE_LOCAL_STATE,/g,
    "import { USE_LOCAL_STATE,"
  );
  text = text.replace(
    /import \{ BusCommandConfig, USE_LOCAL_STATE, COMPANY_ID \}/g,
    "import { BusCommandConfig, USE_LOCAL_STATE, COMPANY_ID }"
  );
  if (text !== before) {
    fs.writeFileSync(file, text);
    renamedFiles += 1;
  }
}
console.log("renamed IS_DEMO_MODE in js files:", renamedFiles);

console.log("phase1-demo-purge done");
