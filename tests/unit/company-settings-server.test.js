const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCompanyProfileSettings, timezoneForCompanyCountry } = require("../../server/company-settings");

test("server derives the same headquarters timezone and normalizes profile settings", () => {
  assert.equal(timezoneForCompanyCountry("AT"), "Europe/Vienna");
  assert.equal(timezoneForCompanyCountry("rs"), "Europe/Belgrade");
  assert.deepEqual(normalizeCompanyProfileSettings({
    country: " rs ", defaultLanguage: "SR", contactEmail: " OFFICE@EXAMPLE.RS "
  }), {
    country: "RS", timezone: "Europe/Belgrade", defaultLanguage: "sr", contactEmail: "office@example.rs"
  });
  assert.throws(() => timezoneForCompanyCountry("US"), error => error.code === "country-not-supported");
});
