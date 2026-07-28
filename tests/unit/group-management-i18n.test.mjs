import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { URL } from "node:url";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(read("../../translations.js"), context);
const dictionaries = context.window.TRANSLATIONS;

test("group management has complete EN DE SR translations without raw keys", () => {
  const keys = [
    "hub_stat_buses", "hub_catalog_title", "hub_extra_plans_title", "hub_plan_drop_hint",
    "hub_secure_csv_hint", "plan_import_empty", "plan_import_file", "plan_import_driver",
    "plan_import_month", "plan_import_days", "plan_import_status", "plan_import_review",
    "plan_import_save_all", "plan_import_clear", "on_call_label"
  ];
  for (const lang of ["en", "de", "sr"]) {
    for (const key of keys) {
      assert.ok(dictionaries[lang][key], `${lang}.${key} missing`);
      assert.notEqual(dictionaries[lang][key], key);
    }
  }
});

test("group management terminology does not mix EN SR and DE", () => {
  const en = ["hub_stat_buses", "hub_catalog_title", "hub_extra_plans_title", "hub_plan_drop_hint", "plan_import_empty", "on_call_label"]
    .map((key) => dictionaries.en[key]).join(" ");
  assert.doesNotMatch(en, /\b(Ime|Autobusi|Dodatni planovi|Prevuci|Bereitschaft)\b/);
  assert.doesNotMatch(dictionaries.de.plan_import_empty, /Upload one|Otpremite/);
  assert.doesNotMatch(dictionaries.sr.plan_import_empty, /plan_import_empty|Upload one|Laden Sie/);
  assert.match(dictionaries.en.on_call_label, /on-call duty/);
  assert.match(dictionaries.de.on_call_label, /Bereitschaftsdienst/);
  assert.match(dictionaries.sr.on_call_label, /dežurstvo/);
});

test("production group management has no legacy manual PIN form and keeps secure CSV import", () => {
  const html = read("../../staff.html");
  const drivers = read("../../js/data/drivers.js");
  const api = read("../../js/core/api-client.js");
  const packageImport = read("../../js/imports/package-import.js");
  const server = read("../../server/driver-routes.js");
  assert.doesNotMatch(html, /id="(?:add-driver-form|new-driver-pin|bulk-drivers-input)"/);
  assert.match(drivers, /function addDriver[\s\S]*?if \(!IS_DEMO_MODE\) return/);
  assert.match(api, /\/api\/staff\/drivers\/import/);
  assert.match(packageImport, /ApiClient\.importDriversCsv/);
  assert.match(server, /const COST = 12/);
  assert.match(server, /crypto\.randomUUID\(\)/);
  assert.match(server, /activationCodeHash/);
  assert.match(server, /generateActivationOtp/);
});
