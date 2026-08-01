import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

globalThis.window = globalThis.window || {
    state: {},
    location: { hostname: "localhost", search: "" }
};
const { validatePlanBatch } = await import("../../js/imports/package-import.js");

function plan(month, driverName, days) {
    return {
        parsed: {
            month,
            rowCount: days.length,
            byDriver: {
                [driverName]: {
                    parsedShifts: Object.fromEntries(days.map((day) => [day, { type: "morning" }]))
                }
            }
        }
    };
}

test("plan package accepts one month with known drivers and unique days", () => {
    assert.deepEqual(
        validatePlanBatch(
            [plan("2026-09", "Marko Petrović", [1, 2]), plan("2026-09", "Nikola Jovanović", [1])],
            ["Marko Petrović", "Nikola Jovanović"]
        ),
        []
    );
});

test("plan package rejects mixed months, unknown drivers and duplicate driver-days", () => {
    const errors = validatePlanBatch(
        [
            plan("2026-09", "Marko Petrović", [1, 2]),
            plan("2026-09", "Marko Petrović", [2]),
            plan("2026-10", "Nepoznat Vozač", [1])
        ],
        ["Marko Petrović"]
    );
    assert.ok(errors.some((error) => error.includes("Dupla smena")));
    assert.ok(errors.some((error) => error.includes("nije pronađen")));
    assert.ok(errors.some((error) => error.includes("samo jedan mesec")));
});

test("plan package rejects empty parsed plans", () => {
    assert.ok(validatePlanBatch([{ parsed: { month: null, rowCount: 0 } }]).length);
});

test("package import exposes only verified CSV/XLSX formats and separates dispatcher permissions", () => {
    const html = readFileSync(join(root, "index.legacy-monolith.html"), "utf8");
    const importer = readFileSync(join(root, "js/imports/package-import.js"), "utf8");
    const hub = readFileSync(join(root, "js/dispatcher/data-hub.js"), "utf8");
    assert.match(html, /id="package-import-files"[^>]*accept="\.csv,\.xlsx"/);
    assert.doesNotMatch(html, /id="package-import-files"[^>]*accept="[^"]*\.xls(?:,|")/);
    assert.match(importer, /pkg_driver_csv_admin_only/);
    assert.match(hub, /import_plan_only_title/);
});
