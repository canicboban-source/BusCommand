import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "../fixtures");

globalThis.window = {
    location: { hostname: "localhost", search: "" },
    state: { activeLineId: "320", groups: [{ id: "320" }, { id: "310" }] }
};

const { parseDienstplanSheet } = await import("../../js/imports/monthly-plan-excel.js");
const { isMonthlyPlanCsv, parseMonthlyPlanCsv } = await import("../../js/imports/monthly-plan-csv.js");
const { parseExtractedScheduleText } = await import("../../js/maps/schedule-import-utils.js");
const { normalizeShiftCode } = await import("../../js/imports/import-parse-utils.js");

test("normalizeShiftCode accepts F-codes, bare Dienst and Urlaub", () => {
    assert.equal(normalizeShiftCode("320.F06 (Ferien in NOe)", "320").routeCode, "320.F06");
    assert.equal(normalizeShiftCode("Urlaub", "320").type, "vacation");
    assert.equal(normalizeShiftCode("Dienst", "320").name, "Dienst");
    assert.equal(normalizeShiftCode("F08", "320").routeCode, "320.F08");
    assert.equal(normalizeShiftCode("S09", "320").routeCode, "320.S09");
});

test("Canic Boban August CSV from screenshot parses fully", () => {
    const csv = fs.readFileSync(path.join(fixtures, "canic-boban-2026-08.csv"), "utf8");
    assert.equal(isMonthlyPlanCsv(csv), true);
    const parsed = parseMonthlyPlanCsv(csv, "320");
    assert.equal(parsed.month, "2026-08");
    assert.ok(parsed.rowCount >= 20);
    const shifts = parsed.byDriver["Canic Boban"].parsedShifts;
    assert.equal(shifts[2].routeCode, "320.701");
    assert.equal(shifts[2].bus, "91103");
    assert.equal(shifts[11].type, "vacation");
    assert.equal(shifts[30].name, "Dienst");
    assert.equal(shifts[31].routeCode, "320.F05");
});

test("Canic Boban July and June CSV fixtures parse", () => {
    for (const [file, month, minDays] of [
        ["canic-boban-2026-07.csv", "2026-07", 20],
        ["canic-boban-2026-06.csv", "2026-06", 5]
    ]) {
        const csv = fs.readFileSync(path.join(fixtures, file), "utf8");
        const parsed = parseMonthlyPlanCsv(csv, "320");
        assert.equal(parsed.month, month);
        assert.ok(parsed.rowCount >= minDays, `${file} days`);
        assert.ok(parsed.byDriver["Canic Boban"]);
    }
});

test("Tag/Bus/Linie-Dienst sheet with inline Dienstplan für: name", () => {
    const rows = [
        ["Dienstplan für: Canic Boban", "", ""],
        ["Von 01.08.2026 bis 31.08.2026", "Dispogruppenauswahl: 42: VOR 310/320", ""],
        ["Tag", "Bus", "Linie/Dienst"],
        ["02.08.2026 (Sonntag)", "91103", "320.701 (Sonn/Feiertage in NOe)"],
        ["11.08.2026 (Dienstag)", "", "Urlaub"],
        ["30.08.2026 (Sonntag)", "", "Dienst"],
        ["31.08.2026 (Montag)", "91504", "320.F05 (Ferien in NOe)"]
    ];
    const parsed = parseDienstplanSheet(rows, "320");
    assert.ok(parsed);
    assert.equal(parsed.month, "2026-08");
    assert.ok(parsed.byDriver["Canic Boban"]);
    assert.equal(parsed.byDriver["Canic Boban"].parsedShifts[11].type, "vacation");
    assert.equal(parsed.byDriver["Canic Boban"].parsedShifts[30].name, "Dienst");
    assert.equal(parsed.byDriver["Canic Boban"].parsedShifts[31].bus, "91504");
});

test("loose text parser recognizes F-codes and Von/bis month", () => {
    const text = `
Dienstplan für: Canic Boban
Von 01.08.2026 bis 31.08.2026
Dispogruppenauswahl: 42: VOR 310/320
03.08.2026 (Montag) | 91504 | 320.F06 (Ferien in NOe)
11.08.2026 (Dienstag) |  | Urlaub
30.08.2026 (Sonntag) |  | Dienst
`;
    const parsed = parseExtractedScheduleText(text);
    assert.equal(parsed.month, "2026-08");
    assert.equal(parsed.shifts[3].routeCode, "320.F06");
    assert.equal(parsed.shifts[3].bus, "91504");
    assert.equal(parsed.shifts[11].type, "vacation");
    assert.equal(parsed.shifts[30].name, "Dienst");
    assert.equal(parsed.quality, "partial");
});
