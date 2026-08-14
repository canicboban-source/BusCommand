import test from "node:test";
import assert from "node:assert/strict";
import {
  companySettingsEqual,
  timezoneForCountry,
  validateCompanySettingsDraft
} from "../../js/admin/company-admin-settings-model.js";

test("company settings derive headquarters timezone instead of trusting device input", () => {
  assert.equal(timezoneForCountry("AT"), "Europe/Vienna");
  assert.equal(timezoneForCountry("rs"), "Europe/Belgrade");
  assert.equal(timezoneForCountry("US"), "");
});

test("company settings validate country, pilot language and contact email", () => {
  const valid = validateCompanySettingsDraft({ country: " rs ", defaultLanguage: "SR", contactEmail: " OFFICE@EXAMPLE.RS " });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.value, {
    country: "RS", timezone: "Europe/Belgrade", defaultLanguage: "sr", contactEmail: "office@example.rs"
  });
  const invalid = validateCompanySettingsDraft({ country: "US", defaultLanguage: "fr", contactEmail: "bad" });
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["contactEmail", "country", "defaultLanguage"]);
});

test("settings equality compares normalized persisted business values", () => {
  assert.equal(companySettingsEqual(
    { country: "AT", defaultLanguage: "de", contactEmail: "Office@Example.at" },
    { country: "at", defaultLanguage: "DE", contactEmail: "office@example.at" }
  ), true);
});
