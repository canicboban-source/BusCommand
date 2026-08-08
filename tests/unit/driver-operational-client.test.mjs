import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [quickReports, reportForms, dashboard, messages, messageAlerts, api, vacations, shifts, workSession, gps, shellDriver, bootstrap, rules, dispatcherDashboard] = await Promise.all([
    read("../../js/driver/quick-reports.js"),
    read("../../js/driver/reports.js"),
    read("../../js/driver/dashboard.js"),
    read("../../js/driver/messages-inbox.js"),
    read("../../js/driver/message-alerts.js"),
    read("../../js/core/api-client.js"),
    read("../../js/dispatcher/vacations.js"),
    read("../../js/dispatcher/shifts.js"),
    read("../../js/driver/work-session.js"),
    read("../../js/maps/gps-track.js"),
    read("../../js/layout/shell-driver.js"),
    read("../../js/bootstrap/init.js"),
    read("../../firestore.rules"),
    read("../../js/dispatcher/dashboard.js")
]);

test("production driver actions use narrow server APIs instead of global state sync", () => {
    assert.match(quickReports, /ApiClient\.createDriverReport/);
    assert.match(quickReports, /if \(USE_LOCAL_STATE\) saveState\(\)/);
    assert.match(reportForms, /ApiClient\.createDriverReport/);
    assert.match(reportForms, /ApiClient\.createDriverLostItem/);
    assert.match(dashboard, /ApiClient\.createDriverSos/);
    assert.match(dashboard, /if \(USE_LOCAL_STATE\) saveState\(\)/);
    assert.match(messages, /ApiClient\.markDriverMessageRead/);
    assert.match(messages, /if \(USE_LOCAL_STATE\) saveState\(\)/);
    assert.match(api, /\/api\/driver\/reports/);
    assert.match(api, /\/api\/driver\/sos/);
    assert.match(api, /\/api\/driver\/vacations/);
    assert.match(api, /\/api\/staff\/vacations\//);
    assert.match(api, /\/api\/driver\/messages\//);
    assert.match(messageAlerts, /ApiClient\.archiveDriverMessage/);
});

test("vacation clients use narrow APIs, stable states and safe DOM rendering", () => {
    assert.match(reportForms, /ApiClient\.createDriverVacation/);
    assert.match(reportForms, /pendingForms\.has\("vacation-form"\)/);
    assert.match(reportForms, /days < 1 \|\| days > 366/);
    assert.match(reportForms, /if \(USE_LOCAL_STATE\) saveState\(\)/);
    assert.match(vacations, /ApiClient\.setVacationStatus/);
    assert.match(vacations, /pendingVacationActions/);
    assert.match(vacations, /driver\.textContent = driverName/);
    assert.match(vacations, /vacation\.driver \|\| vacation\.driverName/);
    assert.doesNotMatch(vacations, /innerHTML/);
});

test("dispatcher shift assignments use the narrow staff API outside demo mode", () => {
    assert.match(api, /\/api\/staff\/shifts\/assignment/);
    assert.match(shifts, /ApiClient\.assignStaffShift/);
    assert.match(shifts, /expectedRevision/);
    assert.match(shifts, /REVISION_CONFLICT/);
    assert.match(shifts, /if \(!USE_LOCAL_STATE\) \{[\s\S]*?return true;\s*\}\s*if \(bus != null\)[\s\S]*?saveState\(\);/);
});

test("driver privacy mode stops GPS, realtime notifications and the session after work", () => {
    assert.match(api, /\/api\/driver\/work-session/);
    assert.match(api, /\/api\/driver\/shift-confirmations/);
    assert.match(api, /\/api\/staff\/shift-confirmations/);
    assert.match(api, /getStaffShiftConfirmations/);
    assert.match(dispatcherDashboard, /confirmationAttention/);
    assert.match(dispatcherDashboard, /delivery_failed/);
    assert.match(dispatcherDashboard, /status_confirmation_delivery_failed/);
    assert.match(workSession, /stopDriverGpsTracking\(\)/);
    assert.match(workSession, /stopFirestoreSync\(\)/);
    assert.match(workSession, /policy\.notificationsUntil/);
    assert.match(workSession, /policy\.sessionEndsAt/);
    assert.match(workSession, /confirmUpcomingShifts/);
    assert.match(gps, /clearWatch\(window\._gpsWatchId\)/);
    assert.match(shellDriver, /isDriverWorkSessionActive\(\)/);
    assert.match(bootstrap, /await prepareDriverWorkSession\(\)/);
    assert.match(rules, /isDriverNotificationWindow\(companyId\)/);
    assert.match(rules, /notificationsUntil >= request\.time/);
});

test("quick report rejects unknown actions and blocks duplicate submission", () => {
    assert.match(quickReports, /const definition = definitions\[type\]/);
    assert.match(quickReports, /if \(!definition\)/);
    assert.match(quickReports, /quickReportPending/);
    assert.match(quickReports, /lastQuickReportAt/);
    assert.match(quickReports, /window\.currentUser\.role !== "driver"/);
});

test("detailed reports use stable codes, bounded inputs and submission locks", () => {
    assert.match(reportForms, /pendingForms = new Set/);
    assert.match(reportForms, /type: `delay:\$\{minutes\}`/);
    assert.match(reportForms, /type: `breakdown:\$\{breakdownType\}`/);
    assert.match(reportForms, /description\.length > 1000/);
    assert.match(reportForms, /validTypes\.includes\(type\)/);
    assert.match(reportForms, /currentDriverIdentity/);
});

test("archived messages are identity-scoped and removed from the active inbox", () => {
    assert.match(messages, /filter\(m => !isMessageArchivedByMe\(m\)\)/);
    assert.match(messages, /actionAttr\("archiveMessage"/);
    assert.match(messageAlerts, /archivedByIds\?\.includes/);
    assert.match(messageAlerts, /messageTargetsCurrentDriver/);
});
