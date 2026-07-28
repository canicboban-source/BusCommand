import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Company Admin driver page exposes a safe group-scoped CSV workflow", async () => {
  const [html, client, api, server] = await Promise.all([
    read("../../staff.html"),
    read("../../js/admin/company-admin-drivers.js"),
    read("../../js/core/api-client.js"),
    read("../../server/driver-routes.js")
  ]);
  assert.match(html, /id="company-admin-drivers"/);
  assert.match(html, /id="ca-drivers-import-group"/);
  assert.match(html, /id="ca-driver-edit-modal"/);
  assert.match(html, /BusCommand_Drivers_Import_v1\.csv/);
  assert.match(client, /MAX_FILE_BYTES = 1_000_000/);
  assert.match(client, /MAX_IMPORT_ROWS = 250/);
  assert.match(client, /pendingImport\.groupId/);
  assert.doesNotMatch(client, /company_code[^\n]*innerHTML/);
  assert.match(api, /JSON\.stringify\(\{ companyId, groupId, csv \}\)/);
  assert.match(server, /req\.staff\.role !== "company_admin"/);
});

test("driver directory supports filtering, pagination and immediate access revocation", async () => {
  const [client, firebase, rules] = await Promise.all([
    read("../../js/admin/company-admin-drivers.js"),
    read("../../js/core/firebase-service.js"),
    read("../../firestore.rules")
  ]);
  assert.match(client, /PAGE_SIZE = 25/);
  assert.match(client, /function filteredDrivers\(\)/);
  assert.match(client, /ApiClient\.setDriverActive\(driverId, nextActive\)/);
  assert.match(firebase, /company-admin-drivers/);
  assert.match(firebase, /item\.key === "groups" \|\| item\.key === "dispatchers" \|\| item\.key === "reports" \|\| item\.key === "drivers"/);
  const driverRules = rules.match(/match \/companies\/\{companyId\}\/drivers\/\{driverId\}[\s\S]*?\n {4}}/)[0];
  assert.match(driverRules, /allow create, delete: if false/);
  assert.match(driverRules, /onlyUpdatingAllowedDriverFields\(\)/);
  assert.doesNotMatch(driverRules, /allow create: if isCompanyAdmin\(companyId\)/);
  assert.doesNotMatch(driverRules, /allow create: if isCompanyStaff\(companyId\)/);
});

test("Company Admin can edit driver profile fields and CA-only EID/PIN controls", async () => {
  const [html, client, api, validation, server, firebase] = await Promise.all([
    read("../../index.legacy-monolith.html"),
    read("../../js/admin/company-admin-drivers.js"),
    read("../../js/core/api-client.js"),
    read("../../server/validation.js"),
    read("../../api-server.js"),
    read("../../js/core/firebase-service.js")
  ]);
  assert.match(html, /id="ca-driver-edit-modal"/);
  assert.match(html, /id="ca-driver-edit-first-name"/);
  assert.match(html, /id="ca-driver-edit-eid"/);
  assert.match(html, /id="ca-driver-edit-pin"/);
  assert.match(client, /openCompanyDriverEdit/);
  assert.match(client, /ApiClient\.updateCompanyDriver/);
  assert.match(client, /listCompanyDrivers/);
  assert.match(client, /setCompanyDriverPersonalCode/);
  assert.match(client, /ca_drivers_eid/);
  assert.doesNotMatch(client, /updateCompanyDriver\([^)]*(?:eid|pin|company_code)/);
  assert.match(api, /updateCompanyDriver\(companyId, driverId, payload\)/);
  assert.match(api, /personal-code/);
  assert.match(validation, /companyDriverProfileBody/);
  assert.match(validation, /companyDriverPersonalCodeBody/);
  assert.match(validation, /\.strict\(\)/);
  assert.doesNotMatch(validation, /companyDriverProfileBody[\s\S]*?\beid\b/);
  assert.match(server, /app\.patch\(\s*"\/api\/company-admin\/drivers\/:driverId"/);
  assert.match(server, /driver_profile_updated/);
  assert.match(server, /driver_personal_code_set/);
  assert.match(server, /loginCodeHash/);
  assert.match(server, /codeActivated:\s*true/);
  assert.match(validation, /\\d\{5,12\}/);
  assert.match(firebase, /sanitizeDriverRecordForClient/);
  assert.match(firebase, /role !== "dispatcher"/);
});

test("driver account translations are complete in pilot languages", async () => {
  const source = await read("../../translations.js");
  const context = { window: {} };
  const vm = await import("node:vm");
  vm.runInNewContext(source, context);
  for (const language of ["en", "de", "sr"]) {
    for (const key of [
      "ca_nav_drivers", "ca_drivers_title", "ca_drivers_import_title", "ca_drivers_directory_title",
      "ca_drivers_security_note", "ca_drivers_edit_title", "ca_drivers_edit_hint", "ca_drivers_edit_saved",
      "ca_drivers_eid", "ca_drivers_pin_label", "ca_drivers_pin_saved"
    ]) {
      assert.ok(context.window.TRANSLATIONS[language][key], `${language}.${key} missing`);
    }
  }
});
