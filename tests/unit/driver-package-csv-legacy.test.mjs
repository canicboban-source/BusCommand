import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

globalThis.window = globalThis.window || {
  state: {},
  location: { hostname: "localhost", search: "" },
  currentUser: { role: "company-admin", companyId: "qa-local", activeGroupId: "101" }
};

const {
  parseDriverCsv,
  localDriverRecordFromCanonical
} = await import("../../js/imports/driver-csv-import.js");
const {
  applyDriversFromCsv,
  isCompanyAdminRole
} = await import("../../js/imports/package-import.js");

const CANONICAL = "eid,last_name,first_name,email,phone,postal_code\nEMP-001,Sample,Driver,driver01@example.invalid,+43100000000,01010\n";

test("legacy adapter uses the shared contract and rejects Initial_PIN without echoing the value", () => {
  assert.throws(
    () => parseDriverCsv("eid,last_name,first_name,email,phone,postal_code,Initial_PIN\nE1,A,B,a@b.invalid,+43100000000,1010,SECRET\n"),
    (error) => {
      assert.equal(error.code, "CREDENTIAL_COLUMNS_FORBIDDEN");
      assert.doesNotMatch(error.message, /SECRET/);
      assert.equal(Object.hasOwn(error, "pin"), false);
      return true;
    }
  );
});

test("legacy adapter rejects company_code and never returns a pin property", () => {
  assert.throws(
    () => parseDriverCsv("eid,last_name,first_name,email,phone,postal_code,company_code\nE1,A,B,a@b.invalid,+43100000000,1010,SECRET\n"),
    (error) => {
      assert.equal(error.code, "CREDENTIAL_COLUMNS_FORBIDDEN");
      assert.doesNotMatch(error.message, /SECRET/);
      return true;
    }
  );
  const drivers = parseDriverCsv(CANONICAL);
  assert.equal(drivers[0].pin, undefined);
  assert.equal(Object.hasOwn(drivers[0], "pin"), false);
  assert.equal(drivers[0].postal_code, "01010");
});

test("localDriverRecordFromCanonical writes postalCode and no credential field", () => {
  const drivers = parseDriverCsv(CANONICAL);
  const record = localDriverRecordFromCanonical(drivers[0], {
    id: "drv-1",
    groupId: "101",
    companyId: "qa-local"
  });
  assert.equal(record.postalCode, "01010");
  assert.equal(record.pin, undefined);
  assert.equal(record.company_code, undefined);
  assert.equal(record.activation_code, undefined);
  assert.equal(record.password, undefined);
  assert.equal(record.passcode, undefined);
  assert.equal(record.codeActivated, false);
});

test("applyDriversFromCsv never writes pin and maps PLZ to postalCode", () => {
  window.state = {
    drivers: [{ id: "old", name: "Sample Driver", eid: "EMP-001", pin: "9999" }],
    groups: [{ id: "101", name: "G1", lineId: "101" }],
    activeGroupHubId: "101"
  };
  window.currentUser = { role: "company-admin", companyId: "qa-local", activeGroupId: "101" };
  const n = applyDriversFromCsv({ drivers: parseDriverCsv(CANONICAL) });
  assert.equal(n, 1);
  assert.equal(window.state.drivers[0].pin, undefined);
  assert.equal(window.state.drivers[0].postalCode, "01010");
  assert.equal(window.state.drivers[0].eid, "EMP-001");
});

test("Dispatcher is denied driver CSV in both production and QA role checks", () => {
  assert.equal(isCompanyAdminRole("dispatcher"), false);
  assert.equal(isCompanyAdminRole("company-admin"), true);
  assert.equal(isCompanyAdminRole("company_admin"), true);
  const importer = readFileSync(join(root, "js/imports/package-import.js"), "utf8");
  assert.match(importer, /function isCompanyAdminRole/);
  assert.match(importer, /!isCompanyAdminRole\(\)/);
  assert.doesNotMatch(importer, /role !== "company-admin" && !USE_LOCAL_STATE/);
  assert.doesNotMatch(importer, /pin:\s*d\.pin/);
  assert.doesNotMatch(importer, /generateActivationOtp/);
});

test("CA canonical CSV still parses and OTP stays on the server import path", () => {
  const drivers = parseDriverCsv(CANONICAL);
  assert.equal(drivers.length, 1);
  const routes = readFileSync(join(root, "server/driver-routes.js"), "utf8");
  const start = routes.indexOf('"/api/staff/drivers/import"');
  const end = routes.indexOf('"/api/staff/drivers/:driverId/resend-activation"');
  const slice = routes.slice(start, end);
  assert.match(slice, /generateActivationOtp/);
  const adapter = readFileSync(join(root, "js/imports/driver-csv-import.js"), "utf8");
  assert.match(adapter, /driver-import-contract\.cjs/);
  assert.doesNotMatch(adapter, /generateActivationOtp/);
  assert.doesNotMatch(adapter, /licni_kod/);
});
