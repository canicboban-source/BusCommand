import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  TEMPLATE_VERSION,
  unfoldTimes,
  validateServicePlan
} from "../../shared/service-plan-contract.mjs";
import { parseCsvText } from "../../js/imports/service-plan-csv.js";
import { parseServicePlanWorkbook, validateServicePlanFile } from "../../js/imports/service-plan-excel.js";
import { buildStructuredPdfPayload, parseStructuredPdfText } from "../../js/imports/service-plan-pdf.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function validPlan(overrides = {}) {
  return {
    templateVersion: TEMPLATE_VERSION,
    planCode: "310",
    planVersion: "66",
    validFrom: "2026-02-09",
    timezone: "Europe/Vienna",
    duties: [{
      code: "310.S01",
      dayType: "SCHOOL_WEEKDAY",
      workStart: "04:02",
      firstTripStart: "04:33",
      lastTripEnd: "14:00",
      workEnd: "14:35",
      startLocation: "Depot",
      endLocation: "Depot"
    }],
    activities: [
      { dutyCode: "310.S01", sequence: 1, type: "ARBEIT", start: "04:02", end: "04:17" },
      { dutyCode: "310.S01", sequence: 2, type: "DEPOT", start: "04:17", end: "04:33" },
      { dutyCode: "310.S01", sequence: 3, type: "FAHRT", start: "04:33", end: "14:00", line: "310", course: "101" },
      { dutyCode: "310.S01", sequence: 4, type: "DEPOT", start: "14:00", end: "14:25" },
      { dutyCode: "310.S01", sequence: 5, type: "ARBEIT", start: "14:25", end: "14:35" }
    ],
    ...overrides
  };
}

test("service plan validates the 310.S01 work and trip boundaries", () => {
  const result = validateServicePlan(validPlan());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.summary.dutyCount, 1);
  assert.equal(result.summary.activityCount, 5);
  assert.equal(result.plan.duties[0].workStart, "04:02");
  assert.equal(result.plan.duties[0].firstTripStart, "04:33");
  assert.equal(result.plan.duties[0].lastTripEnd, "14:00");
  assert.equal(result.plan.duties[0].workEnd, "14:35");
  const serverPass = validateServicePlan(result.plan);
  assert.equal(serverPass.valid, true, JSON.stringify(serverPass.errors));
});

test("service plan rejects unsupported templates and mismatched trip boundaries", () => {
  const input = validPlan({ templateVersion: "LEGACY-1" });
  input.duties[0].firstTripStart = "04:30";
  const result = validateServicePlan(input);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === "unsupported_template"));
  assert.ok(result.errors.some(error => error.code === "trip_bounds_mismatch"));
});

test("service plan rejects gaps, unknown duty references and cross-plan codes", () => {
  const gapInput = validPlan();
  gapInput.activities[1].start = "04:18";
  const gapResult = validateServicePlan(gapInput);
  assert.equal(gapResult.valid, false);
  assert.ok(gapResult.errors.some(error => error.code === "activity_gap"));

  const referenceInput = validPlan();
  referenceInput.activities.push({ dutyCode: "310.UNKNOWN", sequence: 1, type: "FAHRT", start: "08:00", end: "09:00" });
  referenceInput.duties[0].code = "311.S01";
  const referenceResult = validateServicePlan(referenceInput);
  assert.equal(referenceResult.valid, false);
  assert.ok(referenceResult.errors.some(error => error.code === "unknown_duty"));
  assert.ok(referenceResult.errors.some(error => error.code === "wrong_plan_prefix"));
});

test("overnight times unfold into the next company-local day", () => {
  const timeline = unfoldTimes(["23:40", "00:05", "01:00", "01:15"]);
  assert.deepEqual(timeline.map(item => item.dayOffset), [0, 1, 1, 1]);

  const result = validateServicePlan(validPlan({
    duties: [{
      code: "310.N01", dayType: "ALL_DAYS", workStart: "23:40",
      firstTripStart: "00:05", lastTripEnd: "01:00", workEnd: "01:15"
    }],
    activities: [
      { dutyCode: "310.N01", sequence: 1, type: "ARBEIT", start: "23:40", end: "23:50" },
      { dutyCode: "310.N01", sequence: 2, type: "DEPOT", start: "23:50", end: "00:05" },
      { dutyCode: "310.N01", sequence: 3, type: "FAHRT", start: "00:05", end: "01:00" },
      { dutyCode: "310.N01", sequence: 4, type: "ARBEIT", start: "01:00", end: "01:15" }
    ]
  }));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.duties[0].endDayOffset, 1);
});

test("XLSX parser requires exact sheets and canonical headers", () => {
  globalThis.XLSX = { utils: { sheet_to_json: sheet => sheet.rows } };
  const workbook = {
    SheetNames: ["PLAN", "SMENE", "AKTIVNOSTI"],
    Sheets: {
      PLAN: { rows: [["key", "value"], ["template_version", TEMPLATE_VERSION], ["plan_code", "310"], ["plan_version", "66"], ["valid_from", "2026-02-09"], ["timezone", "Europe/Vienna"]] },
      SMENE: { rows: [["duty_code", "day_type", "work_start", "first_trip_start", "last_trip_end", "work_end", "start_location", "end_location"], ["310.S01", "SCHOOL_WEEKDAY", "04:02", "04:33", "14:00", "14:35", "Depot", "Depot"]] },
      AKTIVNOSTI: { rows: [["duty_code", "sequence", "activity_type", "start", "end", "line", "course", "from", "to"], ...validPlan().activities.map(row => [row.dutyCode, row.sequence, row.type, row.start, row.end, row.line || "", row.course || "", "", ""])] }
    }
  };
  const result = parseServicePlanWorkbook(workbook);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.planVersion, "66");

  const missing = parseServicePlanWorkbook({ SheetNames: ["PLAN"], Sheets: workbook.Sheets });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some(error => error.code === "missing_sheet"));
});

test("file gate accepts BusCommand xlsx, csv and pdf up to 5 MB", () => {
  assert.equal(validateServicePlanFile({ name: "plan.xlsx", size: 1024 }), null);
  assert.equal(validateServicePlanFile({ name: "plan.csv", size: 1024 }), null);
  assert.equal(validateServicePlanFile({ name: "plan.pdf", size: 1024 }), null);
  assert.equal(validateServicePlanFile({ name: "plan.pdf", size: 3.4 * 1024 * 1024 }), null);
  assert.equal(validateServicePlanFile({ name: "plan.xls", size: 1024 }), "ca_plan_err_file_type");
  assert.equal(validateServicePlanFile({ name: "plan.txt", size: 1024 }), "ca_plan_err_file_type");
  assert.equal(validateServicePlanFile({ name: "plan.xlsx", size: 6 * 1024 * 1024 }), "ca_plan_err_file_too_large");
});

test("ephemeral QA CSV fixture parses into the validated contract (not a product template)", () => {
  const csv = fs.readFileSync(path.join(root, "tests/fixtures/qa-dienstplan-minimal.csv"), "utf8");
  const result = parseCsvText(csv);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.planCode, "310");
  assert.equal(result.plan.planVersion, "66");
  assert.equal(result.summary.dutyCount, 1);
  assert.equal(result.summary.activityCount, 5);
});

test("structured PDF payload parses and rejects non-BusCommand text", () => {
  const payload = buildStructuredPdfPayload(validPlan());
  const result = parseStructuredPdfText(payload);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.duties[0].code, "310.S01");

  const rejected = parseStructuredPdfText("Some random company Dienstplan PDF without markers");
  assert.equal(rejected.valid, false);
  assert.ok(rejected.errors.some(error => error.code === "unsupported_pdf"));
});

test("company Dienstplan PDF text parses duties with day types and version", async () => {
  const { parseCompanyDienstplanText, parseStructuredPdfText } = await import("../../js/imports/service-plan-pdf.js");
  const sample = fs.readFileSync(path.join(root, "tests/fixtures/company-dienstplan-310-sample.txt"), "utf8");
  const result = parseCompanyDienstplanText(sample);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.planCode, "310");
  assert.equal(result.plan.planVersion, "66");
  assert.equal(result.plan.validFrom, "2026-02-09");
  assert.equal(result.summary.dutyCount, 5);
  assert.ok(result.plan.duties.some(duty => duty.code === "310.S01" && duty.dayType === "SCHOOL_WEEKDAY"));
  assert.ok(result.plan.duties.some(duty => duty.code === "310.F01" && duty.dayType === "HOLIDAY_WEEKDAY"));
  assert.ok(result.plan.duties.some(duty => duty.code === "310.601" && duty.dayType === "SATURDAY"));
  assert.ok(result.plan.duties.some(duty => duty.code === "310.701" && duty.dayType === "SUNDAY_HOLIDAY"));
  assert.ok(result.plan.duties.some(duty => duty.code === "310.S91" && duty.dayType === "SCHOOL_WEEKDAY"));

  const viaRouter = parseStructuredPdfText(sample);
  assert.equal(viaRouter.valid, true, JSON.stringify(viaRouter.errors));
  assert.equal(viaRouter.summary.dutyCount, 5);

  const scanned = parseStructuredPdfText("-- 1 of 32 --\n\n-- 2 of 32 --\n");
  assert.equal(scanned.valid, false);
  assert.ok(scanned.errors.some(error => error.code === "pdf_no_text"));
});

test("pdf.js Version glyph spacing joins and parses", async () => {
  const { joinPdfTextItems, parseCompanyDienstplanText } = await import("../../js/imports/service-plan-pdf.js");
  const joined = joinPdfTextItems([
    { str: "Version", transform: [38, 0, 0, 38, 72, 510], width: 139 },
    { str: " ", transform: [38, 0, 0, 38, 212, 510], width: 10 },
    { str: "6", transform: [38, 0, 0, 38, 222, 510], width: 21 },
    { str: "6", transform: [38, 0, 0, 38, 243, 510], width: 21 },
    { str: " ", transform: [38, 0, 0, 38, 264, 510], width: 10 },
    { str: "ab", transform: [38, 0, 0, 38, 274, 510], width: 44 },
    { str: " ", transform: [38, 0, 0, 38, 318, 510], width: 10 },
    { str: "09", transform: [38, 0, 0, 38, 328, 510], width: 42 },
    { str: ".", transform: [38, 0, 0, 38, 370, 510], width: 11 },
    { str: "0", transform: [38, 0, 0, 38, 381, 510], width: 21 },
    { str: "2", transform: [38, 0, 0, 38, 402, 510], width: 21 },
    { str: ".202", transform: [38, 0, 0, 38, 423, 510], width: 74 },
    { str: "6", transform: [38, 0, 0, 38, 496, 510], width: 21 }
  ]);
  assert.match(joined, /Version\s+66\s+ab\s+09\.02\.2026/);

  const spaced = fs.readFileSync(path.join(root, "tests/fixtures/company-dienstplan-310-sample.txt"), "utf8")
    .replace("Version 66 ab 09.02.2026", "Version 6 6 ab 09 . 0 2 .202 6");
  const result = parseCompanyDienstplanText(spaced);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.planVersion, "66");
  assert.equal(result.plan.validFrom, "2026-02-09");
});

test("Austrian public Fahrplan text converts courses into duties", async () => {
  const { parseAustrianFahrplanText } = await import("../../js/imports/service-plan-pdf.js");
  const sample = [
    "306 Baden - Alland Betreiber: Test GmbH Gültig ab 09.02.2026",
    "Montag - Freitag (Werktag) Kursnummer",
    "101 5.11 5.16 5.21 5.22 5.23 5.24 5.25 5.26 5.27 5.28 6.22 6.23",
    "103 6.15 6.16 6.21 6.22 6.23 6.24 6.25 6.26 6.27 6.28 7.22 7.23",
    "Samstag (Werktag)",
    "301 6.22 6.26 6.32 6.33 6.34 6.35 6.36 6.37 6.38 6.39 7.37"
  ].join("\n");
  const result = parseAustrianFahrplanText(sample);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.plan.planCode, "306");
  assert.equal(result.plan.validFrom, "2026-02-09");
  assert.ok(result.plan.duties.some(duty => duty.code === "306.101"));
  assert.ok(result.plan.duties.some(duty => duty.code === "306.301" && duty.dayType === "SATURDAY"));
});
