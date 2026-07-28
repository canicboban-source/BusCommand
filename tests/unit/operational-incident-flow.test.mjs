import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dispatcher incident endpoint is today-only, group-scoped and audited", async () => {
    const source = await read("../../server/driver-routes.js");
    const route = source.slice(
        source.indexOf('app.post("/api/staff/operational-incidents"'),
        source.indexOf('app.get("/api/staff/shift-confirmations"')
    );
    assert.match(route, /req\.staff\.role !== "dispatcher"/);
    assert.match(route, /dispatcherCanAccessGroup\(req\.staff\.groups, groupId\)/);
    assert.match(route, /parsed\.data\.date !== today/);
    assert.match(route, /type: "coverage:disruption"/);
    assert.match(route, /operational_incident_created/);
});

test("operations center requires a reason and keeps the shift until replacement", async () => {
    const dashboard = await read("../../js/dispatcher/dashboard.js");
    assert.match(dashboard, /openOperationalIncident/);
    assert.match(dashboard, /ops-incident-reason/);
    assert.match(dashboard, /minlength="2"/);
    assert.match(dashboard, /ApiClient\.createStaffOperationalIncident/);
    const submit = dashboard.slice(
        dashboard.indexOf("async function submitOperationalIncident"),
        dashboard.indexOf("/** Reši / Dodeli")
    );
    assert.doesNotMatch(submit, /persistShift\(driver, today, "clear"\)/);
});

test("daily replacement closes the matching active coverage incident", async () => {
    const daily = await read("../../js/dispatcher/daily-plan.js");
    assert.match(daily, /report\.type === "coverage:disruption"/);
    assert.match(daily, /report\.driverId === \(previousDriver\.id \|\| previousDriver\.uid\)/);
    assert.match(daily, /await resolveReport\(incident\.id\)/);
});

test("incident workflow has genuine EN SR and DE text", async () => {
    const translations = await read("../../translations.js");
    for (const phrase of [
        "Vozač ne može da nastavi smenu",
        "Driver cannot continue the shift",
        "Fahrer kann die Schicht nicht fortsetzen"
    ]) assert.match(translations, new RegExp(phrase));
});
