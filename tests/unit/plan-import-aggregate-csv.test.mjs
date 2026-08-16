import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const planImport = await readFile(new URL("../../js/dispatcher/plan-import.js", import.meta.url), "utf8");
const serverSettings = await readFile(new URL("../../server/company-settings.js", import.meta.url), "utf8");
const clientModel = await readFile(new URL("../../js/admin/company-admin-settings-model.js", import.meta.url), "utf8");
const monolith = await readFile(new URL("../../index.legacy-monolith.html", import.meta.url), "utf8");

test("D27: a long-format CSV never guesses the driver from the file name", () => {
    // The bug: an aggregate CSV carries the driver in a COLUMN, but an unmatched row
    // fell through to detectDriverFromFilename(file.name) and then to
    // "the group has one driver, use them" — silently writing one driver's month
    // onto another person.
    assert.match(planImport, /aggregate = false/);
    assert.match(planImport, /if \(!driver && !ambiguous && !aggregate\) \{\s*\n\s*const fromFile = detectDriverFromFilename/);
    assert.match(planImport, /if \(!driver && !ambiguous && !aggregate && drivers\.length === 1\) driver = drivers\[0\];/);
});

test("D27: the CSV branch marks every row as aggregate", () => {
    const start = planImport.indexOf('name.endsWith(".csv") && isMonthlyPlanCsv(text)');
    assert.notEqual(start, -1, "the long-format CSV branch must exist");
    const branch = planImport.slice(start, start + 1400);
    assert.match(branch, /aggregate: true/);
    // The driver name must come from the parser's byDriver key, not from file.name.
    assert.match(branch, /for \(const \[driverName, payload\] of Object\.entries\(structured\.byDriver \|\| \{\}\)\)/);
});

test("D27: a multi-driver Excel sheet is aggregate too, a single-driver one is not", () => {
    assert.match(planImport, /aggregate: names\.length > 1/);
});

test("D27: an unmatched aggregate row names the driver, not the file", () => {
    assert.match(planImport, /plan_import_driver_unmatched", \{ driver: String\(driverName \|\| ""\)\.trim\(\) \}/);
    // The row survives into the preview so the dispatcher can map it by hand;
    // commit stays fail-closed while driverId is empty.
    const start = planImport.indexOf("if (!driver && !ambiguous && aggregate) {");
    assert.notEqual(start, -1);
    const branch = planImport.slice(start, planImport.indexOf("} else if", start));
    assert.doesNotMatch(branch, /return 0;/, "an unmatched aggregate row must not be dropped");
});

test("D27: a CSV parse failure surfaces the offending row instead of a generic file error", () => {
    assert.match(planImport, /structured = parseMonthlyPlanCsv\(text, lineId\);/);
    assert.match(planImport, /plan_import_csv_row_error", \{ reason: err\?\.message \|\| "" \}/);
});

test("D27: client and server country->timezone maps cannot drift apart", () => {
    const parse = (src, name) => {
        const start = src.indexOf(`${name} = Object.freeze({`);
        assert.notEqual(start, -1, `${name} must exist`);
        const body = src.slice(start, src.indexOf("});", start));
        return Object.fromEntries(
            [...body.matchAll(/\b([A-Z]{2}):\s*"([A-Za-z_/+-]+)"/g)].map((m) => [m[1], m[2]])
        );
    };
    const server = parse(serverSettings, "COMPANY_COUNTRY_TIMEZONE");
    const client = parse(clientModel, "COMPANY_TIMEZONES");
    assert.deepEqual(client, server, "the two country->timezone maps must be identical");
    assert.ok(Object.keys(server).length >= 40, "the European country list must be complete");
    for (const [code, zone] of Object.entries(server)) {
        assert.match(zone, /^[A-Za-z]+\/[A-Za-z_]+$/, `${code} must map to an IANA zone, got ${zone}`);
    }
    // The pilot countries must survive the expansion.
    assert.equal(server.AT, "Europe/Vienna");
    assert.equal(server.RS, "Europe/Belgrade");
    assert.equal(server.DE, "Europe/Berlin");
    assert.equal(server.CH, "Europe/Zurich");
});

test("D27: every offered country resolves to a zone Intl actually accepts", () => {
    const start = serverSettings.indexOf("COMPANY_COUNTRY_TIMEZONE = Object.freeze({");
    const body = serverSettings.slice(start, serverSettings.indexOf("});", start));
    const zones = [...body.matchAll(/\b[A-Z]{2}:\s*"([A-Za-z_/+-]+)"/g)].map((m) => m[1]);
    for (const zone of zones) {
        assert.doesNotThrow(
            () => new Intl.DateTimeFormat("en", { timeZone: zone }).format(0),
            `${zone} must be a real IANA zone — the confirmation scheduler depends on it`
        );
    }
});

test("D27: the country select is populated from the map, with no hardcoded country names", () => {
    const start = monolith.indexOf('id="ca-settings-country"');
    assert.notEqual(start, -1);
    const select = monolith.slice(start, monolith.indexOf("</select>", start));
    assert.doesNotMatch(select, /<option value="AT"/, "country options must not be hardcoded in HTML");
    assert.doesNotMatch(select, /Austrija|Österreich|Austria/);
});

test("D27: the duplicated CA 'Operational view' nav tab is gone", () => {
    assert.doesNotMatch(monolith, /data-action="openCompanyOpsOverview"/);
    assert.doesNotMatch(monolith, /data-i18n="ca_nav_ops_view"/);
    // The dedicated tabs stay.
    for (const key of ["ca_nav_drivers", "ca_nav_buses", "ca_nav_groups", "ca_nav_team", "ca_nav_service_plan"]) {
        assert.match(monolith, new RegExp(`data-i18n="${key}"`), `${key} tab must remain`);
    }
});
