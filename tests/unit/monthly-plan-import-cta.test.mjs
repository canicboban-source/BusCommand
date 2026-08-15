/**
 * Phase 0.3 — monthly plan CTA must open import path, never empty Frei shells.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel) {
    return readFileSync(join(root, rel), "utf8");
}

test("openMonthlyPlanImport is registered on staff action registry", () => {
    const registry = read("js/register-onclick-staff.js");
    const hub = read("js/dispatcher/group-hub.js");

    assert.match(registry, /openMonthlyPlanImport/);
    assert.match(
        registry,
        /import\s*\{[^}]*openMonthlyPlanImport[^}]*\}\s*from\s*"\.\/dispatcher\/group-hub\.js"/s
    );
    assert.match(hub, /function openMonthlyPlanImport\s*\(/);
    assert.match(hub, /dispo-monthly-plan-import/);
    assert.match(hub, /bulk-plan-import-files/);
    assert.match(hub, /input\.click\s*\(/);
    assert.doesNotMatch(hub, /function openNewPlanModal\s*\(/);
    assert.doesNotMatch(registry, /\bopenNewPlanModal\b/);
});

test("staff markup uses import CTA and has no empty-plan modal", () => {
    const html = read("index.legacy-monolith.html");
    assert.match(html, /data-action="openMonthlyPlanImport"/);
    assert.match(html, /id="dispo-monthly-plan-import"/);
    assert.match(html, /id="plan-import-choose-files"/);
    assert.doesNotMatch(html, /id="new-plan-modal"/);
    assert.doesNotMatch(html, /data-action="openNewPlanModal"/);
    assert.doesNotMatch(html, /data-action="confirmNewPlan"/);
});

test("createEmptyMonthlyPlan cannot fabricate Frei shells", () => {
    const monthly = read("js/dispatcher/monthly-plans.js");
    assert.match(monthly, /function createEmptyMonthlyPlan/);
    assert.match(monthly, /monthly_no_empty_plan/);
    assert.doesNotMatch(monthly, /type:\s*["']frei["']/i);
});
