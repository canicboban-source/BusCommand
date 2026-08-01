import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [calendar, viewer, upload, scheduleImportUtils, planImport, packageImport, sync, shiftPlan, rules, driverHtml, staffHtml] = await Promise.all([
    read("../../js/driver/calendar.js"),
    read("../../js/maps/schedule-viewer.js"),
    read("../../js/maps/schedule-upload.js"),
    read("../../js/maps/schedule-import-utils.js"),
    read("../../js/dispatcher/plan-import.js"),
    read("../../js/imports/package-import.js"),
    read("../../js/core/firebase-service.js"),
    read("../../js/core/shift-plan.js"),
    read("../../firestore.rules"),
    read("../../driver.html"),
    read("../../staff.html")
]);

test("driver calendar uses real month and schedule data without fabricated shifts", () => {
    assert.match(calendar, /new Date\(\)\.toISOString\(\)\.slice\(0, 7\)/);
    assert.match(calendar, /getShiftForDriverDate\(driver\.name, date\)/);
    assert.match(calendar, /new Intl\.DateTimeFormat/);
    assert.doesNotMatch(calendar, /Canic Boban|bobanShifts|2026-06|patternIndex/);
    assert.doesNotMatch(calendar, /innerHTML/);
});

test("calendar and document viewer render untrusted schedule values as text", () => {
    assert.match(calendar, /info\.textContent = translatedShiftName/);
    assert.match(viewer, /pre\.textContent =/);
    assert.match(viewer, /title\.textContent = schedule\.fileName/);
    assert.match(viewer, /safeScheduleDataUrl/);
    assert.doesNotMatch(viewer, /innerHTML/);
});

test("schedule upload accepts up to 10 MB without persisting raw file payloads", () => {
    assert.match(scheduleImportUtils, /MAX_SCHEDULE_FILE_BYTES = 10 \* 1024 \* 1024/);
    assert.match(scheduleImportUtils, /ALLOWED_SCHEDULE_EXTENSIONS/);
    assert.match(upload, /validateScheduleFile\(file\)/);
    assert.match(planImport, /validateScheduleFile\(file\)/);
    assert.doesNotMatch(scheduleImportUtils, /readAsDataURL|fileData/);
    assert.doesNotMatch(upload, /\bfileData\b/);
    assert.doesNotMatch(planImport, /\bfileData\b/);
    assert.doesNotMatch(packageImport, /readAsDataURL|fileMeta\.fileData/);
    assert.match(shiftPlan, /fileData: ""/);
    assert.doesNotMatch(staffHtml, /id="upload-schedule-form"/);
});

test("drivers load only their own shifts and schedules", () => {
    assert.match(sync, /item\.key === "shifts" \|\| item\.key === "schedules"/);
    assert.match(sync, /where\("driverId", "==", _driverUid\(\)\)/);
    assert.match(shiftPlan, /driverId: driverIdForName\(driverName\)/);
    const shiftsBlock = rules.match(/match \/companies\/\{companyId\}\/shifts\/\{shiftId\}[\s\S]*?\n {4}}/)[0];
    const schedulesBlock = rules.match(/match \/companies\/\{companyId\}\/schedules\/\{scheduleId\}[\s\S]*?\n {4}}/)[0];
    assert.match(shiftsBlock, /resource\.data\.driverId == request\.auth\.uid/);
    assert.match(schedulesBlock, /resource\.data\.driverId == request\.auth\.uid/);
});

test("calendar controls expose localized accessible names", () => {
    assert.match(driverHtml, /data-i18n-aria-label="calendar_previous_month"/);
    assert.match(driverHtml, /data-i18n-aria-label="calendar_next_month"/);
    assert.match(driverHtml, /id="calendar-days-container" role="grid"/);
});
