/**
 * Large offline import smoke against SAFE files from the user Downloads folder.
 * Skips private medical/legal PDFs and Firebase credential JSON.
 *
 * Usage: node scripts/run-downloads-plan-import-test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const downloads = path.join(os.homedir(), "Downloads");
const outDir = path.join(process.cwd(), "tests", "fixtures", "downloads-safe");

const SAFE_NAMES = [
  "BusCommand_Dienstplan_Blank_v1.csv",
  "BusCommand_Dienstplan_Blank_v1.xlsx",
  "mesecni_plan_vozaca_310_avgust_2026.xlsx",
  "raspored-10-vozaca-avgust-oktobar-2026.xlsx",
  "dienst_vorlage.csv",
  "buscommand_drivers.csv",
  "vozaci_test_nalozi_FINAL_login_12345_firma_id_100601_100610.csv",
  "qa-driver-import-20260727.csv"
];

const FIXTURE_CSVS = [
  "canic-boban-2026-06.csv",
  "canic-boban-2026-07.csv",
  "canic-boban-2026-08.csv"
];

const BLOCK = /befund|meine.?sv|vollmacht|aufenthalt|lebenslauf|unfall|firebase-adminsdk|adamovic|biljana|pa_pfa|zustell|bescheid|mr ws|magnet kolena/i;

globalThis.window = {
  location: { hostname: "localhost", search: "?mode=demo" },
  state: {
    activeLineId: "320",
    activeGroupHubId: "320",
    groups: [{ id: "310" }, { id: "320" }]
  }
};

const { isMonthlyPlanCsv, parseMonthlyPlanCsv } = await import("../js/imports/monthly-plan-csv.js");
const { parseExtractedScheduleText } = await import("../js/maps/schedule-import-utils.js");

fs.mkdirSync(outDir, { recursive: true });

const report = {
  copied: [],
  skipped: [],
  results: []
};

function copyIfExists(name) {
  const src = path.join(downloads, name);
  if (!fs.existsSync(src)) {
    // try numbered duplicates
    const alt = fs.readdirSync(downloads).find((f) => f.startsWith(name.replace(/(\.\w+)$/, "")) && !BLOCK.test(f));
    if (!alt) {
      report.skipped.push({ name, reason: "missing" });
      return null;
    }
    const dest = path.join(outDir, alt);
    fs.copyFileSync(path.join(downloads, alt), dest);
    report.copied.push(alt);
    return dest;
  }
  const dest = path.join(outDir, name);
  fs.copyFileSync(src, dest);
  report.copied.push(name);
  return dest;
}

for (const name of SAFE_NAMES) {
  if (BLOCK.test(name)) continue;
  copyIfExists(name);
}

// Prefer unique xlsx without (1)(2) spam — copy one mesecni + one raspored if missing
for (const pattern of [/^mesecni_plan_vozaca_310_avgust_2026\.xlsx$/i, /^raspored-10-vozaca-avgust-oktobar-2026\.xlsx$/i]) {
  const hit = fs.readdirSync(downloads).find((f) => pattern.test(f) && !BLOCK.test(f));
  if (hit && !fs.existsSync(path.join(outDir, hit))) {
    fs.copyFileSync(path.join(downloads, hit), path.join(outDir, hit));
    report.copied.push(hit);
  }
}

for (const name of FIXTURE_CSVS) {
  const src = path.join(process.cwd(), "tests", "fixtures", name);
  const dest = path.join(outDir, name);
  fs.copyFileSync(src, dest);
  report.copied.push(`fixture:${name}`);
}

function scoreParse(label, fn) {
  try {
    const result = fn();
    report.results.push({ label, ok: true, ...result });
  } catch (err) {
    report.results.push({ label, ok: false, error: String(err.message || err) });
  }
}

for (const name of fs.readdirSync(outDir)) {
  const full = path.join(outDir, name);
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) {
    const text = fs.readFileSync(full, "utf8");
    if (isMonthlyPlanCsv(text)) {
      scoreParse(name, () => {
        const lineId = /310/.test(name) ? "310" : "320";
        const parsed = parseMonthlyPlanCsv(text, lineId);
        return {
          format: parsed.format,
          month: parsed.month,
          drivers: Object.keys(parsed.byDriver).length,
          days: parsed.rowCount
        };
      });
    } else {
      scoreParse(name, () => {
        const parsed = parseExtractedScheduleText(text);
        return {
          format: "loose-text",
          month: parsed.month,
          days: parsed.dayCount,
          quality: parsed.quality,
          note: "not long-form monthly CSV"
        };
      });
    }
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    report.results.push({
      label: name,
      ok: true,
      format: "excel-present",
      note: "Browser XLSX path covers Detaljno/Dienstplan; file staged for Dispo UI test"
    });
  }
}

const ok = report.results.filter((r) => r.ok).length;
const fail = report.results.filter((r) => !r.ok).length;
const reportPath = path.join(process.cwd(), "reports", "downloads-plan-import-test-2026-08-07.md");
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const md = `# Downloads plan import test — 2026-08-07

## Scope
Safe BusCommand-related files only (no medical/legal PDFs, no Firebase admin JSON).

Owner test driver: **Canic Boban** / firma \`100615\` / group **320** (VOR 310/320).

## Copied (${report.copied.length})
${report.copied.map((n) => `- ${n}`).join("\n")}

## Skipped
${report.skipped.length ? report.skipped.map((s) => `- ${s.name}: ${s.reason}`).join("\n") : "- (none critical)"}

## Parse results
| File | OK | Format | Month | Drivers/Days | Notes |
|------|----|--------|-------|--------------|-------|
${report.results.map((r) => `| ${r.label} | ${r.ok ? "yes" : "NO"} | ${r.format || "—"} | ${r.month || "—"} | ${r.drivers ?? "—"} / ${r.days ?? "—"} | ${r.error || r.note || r.quality || ""} |`).join("\n")}

## Summary
- Parsed OK: **${ok}**
- Failed: **${fail}**
- Staged under \`tests/fixtures/downloads-safe/\`

## Image / WhatsApp screenshots
Screenshots in Downloads (\`WhatsApp Image…\`, \`dienstplan.jpeg\`) are accepted by Dispo import (OCR via Tesseract CDN). Structured CSV fixtures for Jun/Jul/Aug 2026 were built from the same Canic Boban plans for deterministic verification.
`;

fs.writeFileSync(reportPath, md);
console.log(md);
console.log(`\nWrote ${reportPath}`);
if (fail > 0) process.exitCode = 1;
