import test from "node:test";
import assert from "node:assert/strict";
import {
  stripDriverSecrets,
  viewCompanyDrivers,
  findCompanyDriverRecord
} from "../../js/admin/company-admin-driver-records.js";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

function storeFixture() {
  return [
    {
      id: "drv-e2e",
      name: "E2E Driver",
      companyId: "qa-local",
      active: false,
      pin: "13579",
      company_code: "24680",
      companyCode: "24680",
      activationOtp: "482913",
      loginCode: "11111",
      password: "secret",
      loginCodeHash: "$2a$12$not-a-real-hash",
      activationCodeHash: "$2a$12$also-not-real"
    },
    {
      id: "drv-other",
      name: "Other Tenant",
      companyId: "beta",
      active: true,
      pin: "99999"
    }
  ];
}

test("view layer is a sanitized copy; mutations hit the original tenant record", () => {
  const store = storeFixture();
  const original = store[0];
  const views = viewCompanyDrivers(store, "qa-local");
  assert.equal(views.length, 1);
  assert.notEqual(views[0], original);
  assert.equal(views[0].name, "E2E Driver");
  assert.equal(views[0].pin, undefined);
  assert.equal(views[0].company_code, undefined);
  assert.equal(views[0].companyCode, undefined);
  assert.equal(views[0].activationOtp, undefined);
  assert.equal(views[0].loginCode, undefined);
  assert.equal(views[0].password, undefined);
  assert.equal(views[0].loginCodeHash, undefined);
  assert.equal(views[0].activationCodeHash, undefined);
  assert.equal(original.pin, "13579");

  const record = findCompanyDriverRecord(store, "qa-local", "drv-e2e");
  assert.equal(record, original);
  record.active = true;
  assert.equal(store[0].active, true);
  assert.equal(views[0].active, false);

  assert.equal(findCompanyDriverRecord(store, "qa-local", "drv-other"), null);
  assert.equal(findCompanyDriverRecord(store, "beta", "drv-e2e"), null);
  assert.equal(findCompanyDriverRecord(store, "qa-local", ""), null);
});

test("stripDriverSecrets never returns credential fields", () => {
  const stripped = stripDriverSecrets(storeFixture()[0]);
  assert.equal(stripped.pin, undefined);
  assert.equal(stripped.otp, undefined);
  assert.equal(stripped.loginCodeHash, undefined);
  assert.equal(stripped.name, "E2E Driver");
  assert.equal(storeFixture()[0].pin, "13579");
});

test("CA driver mutations use the mutable record helper, not the view find", async () => {
  const source = await readFile(new URL("../../js/admin/company-admin-drivers.js", import.meta.url), "utf8");
  assert.match(source, /function toggleCompanyDriverStatus\(driverId\) \{\r?\n {4}const driver = findMutableCompanyDriver\(driverId\);/);
  assert.match(source, /requestCompanyDriverActivationReset[\s\S]*?findMutableCompanyDriver\(driverId\)/);
  assert.match(source, /saveCompanyDriverEdit[\s\S]*?findMutableCompanyDriver\(driverId\)/);
  assert.match(source, /function companyDrivers\(\) \{\r?\n {4}return viewCompanyDrivers/);
  assert.equal([...source.matchAll(/companyDrivers\(\)\.find/g)].length, 2);
});
