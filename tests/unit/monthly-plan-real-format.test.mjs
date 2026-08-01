import test from "node:test";
import assert from "node:assert/strict";

globalThis.window = {
    location: { hostname: "localhost", search: "" },
    state: { activeLineId: "320", groups: [] }
};

const { parseDienstplanSheet } = await import("../../js/imports/monthly-plan-excel.js");
const { isMonthlyPlanCsv, parseMonthlyPlanCsv } = await import("../../js/imports/monthly-plan-csv.js");

test("parses an individual Dienstplan using the real Tag/Bus/Linie-Dienst layout", () => {
    const rows = [
        ["Dienstplan für:", "Marko Petrović", "", ""],
        ["Von 01.09.2026 bis 30.09.2026", "", "Dispogruppenauswahl: 42: VOR 310/320", ""],
        ["", "", "", ""],
        ["Tag", "Bus", "Linie/Dienst", "Deo dana"],
        ["01.09.2026 (Dienstag)", "91504", "320.F05 (Ferien in NOe)", "pre podne"],
        ["21.09.2026 (Montag)", "91103", "320.S06 (Schule in NOe)", "popodne"],
        ["27.09.2026 (Sonntag)", "91503", "320.701 (Sonn/Feiertage in NOe)", "nedelja"]
    ];
    const parsed = parseDienstplanSheet(rows, "320");
    assert.equal(parsed.month, "2026-09");
    assert.equal(parsed.rowCount, 3);
    assert.equal(parsed.byDriver["Marko Petrović"].parsedShifts[1].routeCode, "320.F05");
    assert.equal(parsed.byDriver["Marko Petrović"].parsedShifts[1].bus, "91504");
    assert.equal(parsed.byDriver["Marko Petrović"].parsedShifts[21].type, "afternoon");
    assert.equal(parsed.byDriver["Marko Petrović"].parsedShifts[27].routeCode, "320.701");
});

test("parses the strict long-form monthly CSV and preserves bus assignments", () => {
    const csv = [
        "datum;dan;linija;dienst;rezim;bus;firma_id;ime_prezime;deo_dana",
        "01.09.2026;Dienstag;320;320.F05;Ferien in NOe;91504;100601;Marko Petrović;pre podne",
        "01.09.2026;Dienstag;320;320.F07;Ferien in NOe;91505;100602;Nikola Jovanović;pre podne",
        "21.09.2026;Montag;320;320.S06;Schule in NOe;91103;100601;Marko Petrović;popodne"
    ].join("\n");
    assert.equal(isMonthlyPlanCsv(csv), true);
    const parsed = parseMonthlyPlanCsv(csv, "320");
    assert.equal(parsed.month, "2026-09");
    assert.equal(parsed.rowCount, 3);
    assert.deepEqual(Object.keys(parsed.byDriver).sort(), ["Marko Petrović", "Nikola Jovanović"]);
    assert.equal(parsed.byDriver["Marko Petrović"].parsedShifts[21].type, "afternoon");
    assert.equal(parsed.byDriver["Nikola Jovanović"].parsedShifts[1].bus, "91505");
});

test("long-form import rejects a line mismatch and duplicate driver/day assignment", () => {
    const mismatch = [
        "datum;linija;dienst;ime_prezime",
        "01.09.2026;310;310.S01;Marko Petrović"
    ].join("\n");
    assert.throws(() => parseMonthlyPlanCsv(mismatch, "320"), /ne odgovara izabranoj grupi/);

    const duplicate = [
        "datum;linija;dienst;ime_prezime",
        "01.09.2026;320;320.S01;Marko Petrović",
        "01.09.2026;320;320.S02;Marko Petrović"
    ].join("\n");
    assert.throws(() => parseMonthlyPlanCsv(duplicate, "320"), /već ima smenu/);
});

test("overview matrices are not silently treated as import plans", () => {
    const rows = [
        ["Mesecni plan 320 - septembar 2026"],
        ["Vozac", "firma_id", 1, 2, 3],
        ["Marko Petrović", "100601", "F05", "F05", "F05"]
    ];
    assert.equal(parseDienstplanSheet(rows, "320"), null);
});
