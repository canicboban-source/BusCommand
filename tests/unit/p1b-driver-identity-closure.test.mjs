/**
 * P1-B regression: every operational mutation in the radar-to-resolution flow
 * is keyed by authoritative driverId, never by displayed name. These tests assert
 * the actual source code of the changed modules so the guarantee is structural,
 * not dependent on a live backend. Behavioral proof is in the Playwright
 * UI→API→Firestore regression.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("shifts.js no longer contains name-based driver lookup or mutation helpers", async () => {
    const source = await read("../../js/dispatcher/shifts.js");
    assert.doesNotMatch(source, /function driverByName\(/);
    assert.doesNotMatch(source, /driverByName\(/);
    assert.doesNotMatch(source, /getShiftForDriverDate\(driver\.name/);
    assert.doesNotMatch(source, /setShiftForDriverDate\(driver\.name/);
    assert.doesNotMatch(source, /openShiftCell\(driverName/);
    assert.doesNotMatch(source, /removeShift\(driverName/);
    assert.doesNotMatch(source, /openOperationalIncident\(driver\.name/);
    assert.match(source, /function openShiftCell\(driverId, dateStr\)/);
    assert.match(source, /function removeShift\(driverId, dateStr\)/);
    assert.match(source, /getShiftForDriverIdOnly\(driver\.id, date\)/);
    assert.match(source, /setShiftForDriverIdOnly\(driver\.id, driver\.name, date, \{/);
    assert.match(source, /if \(!driver\.id\) \{\s*showToast\(t\("ops_attn_data_integrity"\)/);
});

test("shifts.js driver select uses authoritative driverId as option value", async () => {
    const source = await read("../../js/dispatcher/shifts.js");
    assert.match(source, /option\.value = driver\.id \|\| driver\.uid \|\| ""/);
    assert.match(source, /const driver = getDriverById\(driverId\)/);
});

test("daily-plan.js mutation handlers accept driverId, not driverName", async () => {
    const source = await read("../../js/dispatcher/daily-plan.js");
    assert.match(source, /function clearDailyShift\(driverId, dateStr\)/);
    assert.match(source, /function undoDailyShift\(driverId, dateStr\)/);
    assert.match(source, /async function dailyPlanAssignDriver\(dateStr, shiftType, routeCode, driverId\)/);
    assert.match(source, /const previousDriver = currentSlot\?\.driverId\s*\?\s*getDriverById\(currentSlot\.driverId\)/);
    assert.match(source, /const nextDriver = driverId \? getDriverById\(driverId\) : null;/);
    assert.match(source, /await removeShift\(id, date\)/);
    assert.doesNotMatch(source, /openShiftCell\(driverName, date\)/);
    assert.doesNotMatch(source, /clearDailyShift\(driverName/);
    assert.doesNotMatch(source, /undoDailyShift\(driverName/);
    // DnD payload is the id, not the name.
    assert.match(source, /draggedDriverId = chip\.dataset\.driverId/);
    assert.match(source, /dailyPlanAssignDriver\(dateStr, slotType, slotCode, driverId\)/);
});

test("daily-plan.js driver fallback select uses driverId as option value", async () => {
    const source = await read("../../js/dispatcher/daily-plan.js");
    assert.match(source, /function driverOptions\(selectedId = ""\)/);
    assert.match(source, /const value = driver\.id \|\| driver\.uid \|\| ""/);
    assert.match(source, /return `<option value="\$\{escapeHtml\(value\)\}" \$\{selected \? "selected" : ""\}>\$\{escapeHtml\(driver\.name\)\}<\/option>`;/);
});

test("dashboard.js inline controls and incident flow use driverId", async () => {
    const source = await read("../../js/dispatcher/dashboard.js");
    assert.doesNotMatch(source, /function driverByName\(/);
    assert.doesNotMatch(source, /driverByName\(/);
    assert.match(source, /async function updateDriverBusInline\(driverId, newBus\)/);
    assert.match(source, /async function updateDriverShiftInline\(driverId, newShiftType\)/);
    assert.match(source, /async function opsAssignDriver\(driverId, shiftType = "morning"\)/);
    assert.match(source, /function openOperationalIncident\(driverId, preferredReplacementDriverId = ""\)/);
    assert.match(source, /actionAttr\("openOperationalIncident", \[drvId\]\)/);
    assert.match(source, /actionAttr\("opsAssignDriver", \[drvId/);
    assert.match(source, /busSelectHtml\(drvId, busNum/);
    assert.match(source, /shiftSelectHtml\(drvId, shift\?\.type/);
    assert.match(source, /getShiftForDriverIdOnly\(driverUid\(driver\), report\.date\)/);
    assert.match(source, /setShiftForDriverIdOnly\(drvId, drv\.name \|\| "", today/);
});

test("ops-attention.js radar action and coverage resolution use driverId", async () => {
    const source = await read("../../js/dispatcher/ops-attention.js");
    assert.doesNotMatch(source, /openShiftCell\(item\.driverName/);
    assert.match(source, /openShiftCell\(item\.driverId, item\.date/);
    assert.match(source, /getShiftForDriverIdOnly\(item\.driverId, item\.date\)/);
    assert.match(source, /const originalShift = getShiftForDriverIdOnly\(report\.driverId, report\.date\)/);
    assert.match(source, /const replacementShift = getShiftForDriverIdOnly\(driverUid\(replacement\), report\.date\)/);
    assert.match(source, /setShiftForDriverIdOnly\(report\.driverId, original\.name \|\| "", report\.date, \{ type: "clear" \}\)/);
    assert.match(source, /setShiftForDriverIdOnly\(replacementDriverId, replacement\.name \|\| "", report\.date/);
    assert.match(source, /isDriverFree\(driver, dateStr\)[\s\S]*?getShiftForDriverIdOnly\(driverUid\(driver\), dateStr\)/);
    assert.match(source, /usedBusesOnDate\(dateStr, excludeDriverId\)[\s\S]*?getShiftForDriverIdOnly\(driverUid\(driver\), dateStr\)/);
});

test("shift-grid.js weekly grid actions carry driverId", async () => {
    const source = await read("../../js/dispatcher/shift-grid.js");
    assert.doesNotMatch(source, /actionAttr\("openShiftCell", \[driver\.name/);
    assert.doesNotMatch(source, /actionAttr\("removeShift", \[driver\.name/);
    assert.match(source, /actionAttr\("openShiftCell", \[drvId, dStr\]\)/);
    assert.match(source, /actionAttr\("removeShift", \[drvId, dStr\]/);
});

test("shift-plan.js exports an ID-first setter", async () => {
    const source = await read("../../js/core/shift-plan.js");
    assert.match(source, /function setShiftForDriverIdOnly\(driverId, driverName, dateStr, \{/);
    assert.match(source, /s\.driverId === driverId/);
    assert.doesNotMatch(source, /setShiftForDriverIdOnly[\s\S]{0,120}driverIdForName/);
});

test("utils.js exports getDriverById helper used by the mutation modules", async () => {
    const source = await read("../../js/core/utils.js");
    assert.match(source, /function getDriverById\(driverId\)/);
    assert.match(source, /export \{[\s\S]*getDriverById/);
});
