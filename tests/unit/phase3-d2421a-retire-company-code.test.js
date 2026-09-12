"use strict";

/**
 * D24.2.1-A final unit contracts: no companyCodeHash / bcryptCompare on import.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { parseDriverCsv } = require("../../server/driver-csv");

const root = path.join(__dirname, "..", "..");

test("D24.2.1-A: import path does not hash company_code or pass bcryptCompare", () => {
  const routes = fs.readFileSync(path.join(root, "server", "driver-routes.js"), "utf8");
  const start = routes.indexOf('"/api/staff/drivers/import"');
  const end = routes.indexOf('"/api/staff/drivers/:driverId/resend-activation"');
  const importSlice = routes.slice(start, end > start ? end : undefined);
  assert.doesNotMatch(importSlice, /companyCodeHash\s*=\s*driver\.company_code/);
  assert.doesNotMatch(importSlice, /hashSecret\(driver\.company_code/);
  assert.doesNotMatch(importSlice, /companyCodePlain/);
  assert.doesNotMatch(importSlice, /bcryptCompare/);
  assert.doesNotMatch(importSlice, /COMPANY_CODE_EXISTS/);
  assert.match(importSlice, /generateActivationOtp/);
  assert.doesNotMatch(importSlice, /legacyCompanyCodeIgnored/);
});

test("D24.2.1-A: guard commit has no company-code / bcrypt in tx contract", () => {
  const ops = fs.readFileSync(path.join(root, "server", "company-admin-driver-ops.js"), "utf8");
  const commit = ops.slice(ops.indexOf("commitImportedDriversWithIdentityGuard"));
  assert.doesNotMatch(commit, /bcryptCompare/);
  assert.doesNotMatch(commit, /findCompanyCodeConflict/);
  assert.doesNotMatch(commit, /companyCodePlain/);
  const guard = fs.readFileSync(path.join(root, "server", "driver-identity-guard.js"), "utf8");
  assert.doesNotMatch(guard, /findCompanyCodeConflict/);
  assert.doesNotMatch(guard, /bcryptCompare/);
});

test("D24.2.1-A: credential CSV columns are rejected fail-closed", () => {
  const csv = "eid,last_name,first_name,email,phone,postal_code,company_code\nE1,Ivic,Ana,a@x.invalid,+431,1010,SECRETCODE\n";
  assert.throws(
    () => parseDriverCsv(csv),
    (error) => {
      assert.equal(error.code, "CREDENTIAL_COLUMNS_FORBIDDEN");
      assert.doesNotMatch(error.message, /SECRETCODE/);
      return true;
    }
  );
});

test("D24.2.1-A: official CSV without company_code still parses", () => {
  const csv = "eid,last_name,first_name,email,phone,postal_code\nE2,Ivic,Bob,b@x.invalid,+43100000000,1010\n";
  const drivers = parseDriverCsv(csv);
  assert.equal(drivers[0].eid, "E2");
  assert.equal(drivers[0].postal_code, "1010");
});

test("D24.2.1-A: template has no company_code column", () => {
  const tpl = fs.readFileSync(
    path.join(root, "public", "templates", "BusCommand_Drivers_Import_v1.csv"),
    "utf8"
  );
  assert.match(tpl, /eid,last_name,first_name,email,phone,postal_code/);
  assert.doesNotMatch(tpl, /company_code|Initial_PIN/i);
});

test("D24.2.1-A: i18n legacy notice exists for de/en/sr", () => {
  const tr = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  assert.equal([...tr.matchAll(/ca_drivers_legacy_company_code_ignored:/g)].length, 3);
  assert.doesNotMatch(tr, /ca_drivers_company_code_exists:/);
});

test("D24.2.1-A: companyCodeHash remains on credential migration denylist", () => {
  const mig = fs.readFileSync(path.join(root, "server", "driver-credential-migration.js"), "utf8");
  assert.match(mig, /companyCodeHash/);
});
