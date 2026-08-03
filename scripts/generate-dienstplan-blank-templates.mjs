/**
 * Generate blank official BusCommand Dienstplan templates (no demo duties).
 * Usage: node scripts/generate-dienstplan-blank-templates.mjs
 */
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "templates");

const TEMPLATE_VERSION = "BUSCOMMAND-DIENSTPLAN-1";
const DUTY_HEADERS = [
  "duty_code", "day_type", "work_start", "first_trip_start",
  "last_trip_end", "work_end", "start_location", "end_location"
];
const ACTIVITY_HEADERS = [
  "duty_code", "sequence", "activity_type", "start", "end",
  "line", "course", "from", "to"
];

function ensureXlsx() {
  try {
    return require("xlsx");
  } catch {
    console.error("Install xlsx temporarily: npm install xlsx --no-save");
    process.exit(1);
  }
}

function writeCsv() {
  const lines = [
    [
      "section", "key", "value",
      ...DUTY_HEADERS,
      ...ACTIVITY_HEADERS.filter((h) => !DUTY_HEADERS.includes(h) && h !== "duty_code")
    ].join(","),
    `PLAN,template_version,${TEMPLATE_VERSION},,,,,,,,,,,,,,,,`,
    "PLAN,plan_code,,,,,,,,,,,,,,,,,",
    "PLAN,plan_version,,,,,,,,,,,,,,,,,",
    "PLAN,valid_from,,,,,,,,,,,,,,,,,",
    "PLAN,timezone,Europe/Vienna,,,,,,,,,,,,,,,,,",
    // Header-only SMENE / AKTIVNOSTI markers via section column for twin format:
  ];

  // Twin CSV format used by parser: section column with PLAN / SMENE / AKTIVNOSTI rows.
  // Blank template keeps PLAN keys empty (except template_version + timezone default)
  // and zero SMENE/AKTIVNOSTI data rows — CA fills before upload.
  const csv = [
    "section,key,value,duty_code,day_type,work_start,first_trip_start,last_trip_end,work_end,start_location,end_location,sequence,activity_type,start,end,line,course,from,to",
    `PLAN,template_version,${TEMPLATE_VERSION},,,,,,,,,,,,,,,,`,
    "PLAN,plan_code,,,,,,,,,,,,,,,,,",
    "PLAN,plan_version,,,,,,,,,,,,,,,,,",
    "PLAN,valid_from,,,,,,,,,,,,,,,,,",
    "PLAN,timezone,Europe/Vienna,,,,,,,,,,,,,,,,,"
  ].join("\n") + "\n";

  const dest = path.join(outDir, "BusCommand_Dienstplan_Blank_v1.csv");
  fs.writeFileSync(dest, csv, "utf8");
  console.log("Wrote", dest);
}

function writeXlsx() {
  const XLSX = ensureXlsx();
  const wb = XLSX.utils.book_new();

  const planRows = [
    ["key", "value"],
    ["template_version", TEMPLATE_VERSION],
    ["plan_code", ""],
    ["plan_version", ""],
    ["valid_from", ""],
    ["timezone", "Europe/Vienna"]
  ];
  const smeneRows = [DUTY_HEADERS];
  const aktRows = [ACTIVITY_HEADERS];
  const guideRows = [
    ["field", "notes"],
    ["plan_code", "Line/group code, e.g. 310"],
    ["plan_version", "Catalog version, e.g. 66"],
    ["valid_from", "ISO date YYYY-MM-DD"],
    ["timezone", "IANA, default Europe/Vienna"],
    ["day_type", "SCHOOL_WEEKDAY | HOLIDAY_WEEKDAY | SATURDAY | SUNDAY_HOLIDAY | ALL_DAYS"],
    ["duty_code", "e.g. 310.S01 (S=school, F=holiday/ferien, 6xx=Sat, 7xx=Sun)"],
    ["times", "HH:MM — work_start / first_trip_start / last_trip_end / work_end"],
    ["activity_type", "ARBEIT | DEPOT | FAHRT | TRANS | PAUSE | RUHE | SONSTIGES"],
    ["upload", "Fill PLAN + at least one SMENE row and matching AKTIVNOSTI, then upload in CA Shift plans"],
    ["also_accepted", "Official company Dienstplan PDF (Dienst + Version ab) or public Austrian Fahrplan PDF"]
  ];

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(planRows), "PLAN");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(smeneRows), "SMENE");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aktRows), "AKTIVNOSTI");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guideRows), "UPUTSTVO");

  const dest = path.join(outDir, "BusCommand_Dienstplan_Blank_v1.xlsx");
  XLSX.writeFile(wb, dest);
  console.log("Wrote", dest);
}

function writeDriversCsv() {
  // Header-only official driver import template (no sample people).
  const dest = path.join(outDir, "BusCommand_Drivers_Import_v1.csv");
  const csv = "eid,first_name,last_name,phone,email,company_code\n";
  fs.writeFileSync(dest, csv, "utf8");
  console.log("Wrote", dest);
}

fs.mkdirSync(outDir, { recursive: true });
writeCsv();
writeXlsx();
writeDriversCsv();
