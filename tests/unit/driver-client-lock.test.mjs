import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("production driver profile writes are server-owned", async () => {
  const [firebase, rules, onboarding, drivers] = await Promise.all([
    read("../../js/core/firebase-service.js"),
    read("../../firestore.rules"),
    read("../../js/features/onboarding.js"),
    read("../../js/data/drivers.js")
  ]);

  assert.match(firebase, /item\.key === "drivers"/);
  assert.match(firebase, /Driver profiles\/credentials: import \+ status APIs only/);

  const driverRules = rules.match(/match \/companies\/\{companyId\}\/drivers\/\{driverId\}[\s\S]*?\n {4}}/)[0];
  assert.match(driverRules, /allow create, delete: if false/);
  assert.match(driverRules, /onlyUpdatingAllowedDriverFields\(\)/);
  assert.doesNotMatch(driverRules, /allow create: if isCompanyAdmin/);

  assert.match(onboarding, /USE_LOCAL_STATE/);
  assert.match(onboarding, /ca_drivers_admin_only/);
  assert.match(onboarding, /if \(!USE_LOCAL_STATE\)/);

  assert.match(drivers, /ApiClient\.setDriverActive/);
  assert.match(drivers, /if \(!USE_LOCAL_STATE\) return;/);
});
