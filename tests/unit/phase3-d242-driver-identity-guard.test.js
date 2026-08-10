"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");

test("D24.2 decisions document fixed guard path and field constraints", () => {
  const decisions = fs.readFileSync(path.join(root, "docs", "decisions.md"), "utf8");
  assert.match(decisions, /companies\/\{companyId\}\/ops\/driver_identity_guard/);
  assert.match(decisions, /D24\.2/);
  assert.match(decisions, /D24\.2\.1-A/);
  assert.match(decisions, /revision/);
  assert.match(
    decisions.slice(decisions.indexOf("### D24.2")),
    /ne sme[\s\S]*rezervacija/i
  );
});

test("D24.2 guard module exports path constants and no identity payload helpers", () => {
  const mod = require("../../server/driver-identity-guard");
  assert.equal(mod.GUARD_COLLECTION, "ops");
  assert.equal(mod.GUARD_DOC_ID, "driver_identity_guard");
  assert.equal(typeof mod.readDriverIdentityGuardInTx, "function");
  assert.equal(typeof mod.writeDriverIdentityGuardBumpInTx, "function");
  assert.equal(mod.findCompanyCodeConflict, undefined);
  const src = fs.readFileSync(path.join(root, "server", "driver-identity-guard.js"), "utf8");
  assert.doesNotMatch(src, /loginCodeHash/);
  assert.doesNotMatch(src, /companyCodeHash:\s/);
  assert.doesNotMatch(src, /bcryptCompare/);
});

test("D24.2 create + import both bump identity guard in the same contract", () => {
  const ops = fs.readFileSync(path.join(root, "server", "company-admin-driver-ops.js"), "utf8");
  assert.match(ops, /readDriverIdentityGuardInTx/);
  assert.match(ops, /writeDriverIdentityGuardBumpInTx/);
  assert.match(ops, /commitImportedDriversWithIdentityGuard/);
  assert.match(ops, /assertLicenseAllowsDriverCreate/);
  const routes = fs.readFileSync(path.join(root, "server", "driver-routes.js"), "utf8");
  assert.match(routes, /commitImportedDriversWithIdentityGuard/);
  assert.match(routes, /EID_EXISTS/);
  assert.doesNotMatch(
    routes.slice(routes.indexOf('"/api/staff/drivers/import"'), routes.indexOf('"/api/staff/drivers/:driverId/resend-activation"')),
    /COMPANY_CODE_EXISTS/
  );
});

test("D24.2 CSV max rows is 249 under Firestore tx write budget", () => {
  const csv = fs.readFileSync(path.join(root, "server", "driver-csv.js"), "utf8");
  assert.match(csv, /MAX_IMPORT_ROWS = 249/);
  const client = fs.readFileSync(path.join(root, "js", "admin", "company-admin-drivers.js"), "utf8");
  assert.match(client, /MAX_IMPORT_ROWS = 249/);
});

test("D24.2 / D24.2.1-A i18n keys exist for de/en/sr without echoing values", () => {
  const tr = fs.readFileSync(path.join(root, "translations.js"), "utf8");
  for (const key of [
    "ca_drivers_eid_exists",
    "ca_drivers_import_conflict",
    "ca_drivers_legacy_company_code_ignored"
  ]) {
    const re = new RegExp(`${key}:`, "g");
    assert.equal([...tr.matchAll(re)].length, 3, `${key} must exist in de/en/sr`);
  }
  assert.doesNotMatch(tr, /ca_drivers_company_code_exists:/);
});
