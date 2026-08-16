const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeCompanyProfileSettings, timezoneForCompanyCountry } = require("../../server/company-settings");

test("server derives the same headquarters timezone and normalizes profile settings", () => {
  assert.equal(timezoneForCompanyCountry("AT"), "Europe/Vienna");
  assert.equal(timezoneForCompanyCountry("rs"), "Europe/Belgrade");
  assert.deepEqual(normalizeCompanyProfileSettings({
    country: " rs ", defaultLanguage: "SR", contactEmail: " OFFICE@EXAMPLE.RS "
  }), {
    country: "RS", timezone: "Europe/Belgrade", defaultLanguage: "sr", contactEmail: "office@example.rs",
    taxId: "", billingEmail: "", smsSenderId: "", dispatchPhone: ""
  });
  assert.throws(() => timezoneForCompanyCountry("US"), error => error.code === "country-not-supported");
});

test("normalizeCompanyProfileSettings trims and normalizes the new legal fields", () => {
  const result = normalizeCompanyProfileSettings({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at",
    taxId: " ATU12345678 ",
    billingEmail: " BILLING@EXAMPLE.AT ",
    smsSenderId: " alpenbus "
  });
  assert.equal(result.taxId, "ATU12345678");
  assert.equal(result.billingEmail, "billing@example.at");
  assert.equal(result.smsSenderId, "ALPENBUS");
});

test("normalizeCompanyProfileSettings defaults new legal fields to empty string when absent", () => {
  const result = normalizeCompanyProfileSettings({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at"
  });
  assert.equal(result.taxId, "");
  assert.equal(result.billingEmail, "");
  assert.equal(result.smsSenderId, "");
});

test("normalizeCompanyProfileSettings strips cosmetic separators from the dispatch phone", () => {
  const result = normalizeCompanyProfileSettings({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at",
    dispatchPhone: " +43 (699) 123-4567 "
  });
  assert.equal(result.dispatchPhone, "+436991234567");
  assert.equal(normalizeCompanyProfileSettings({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at"
  }).dispatchPhone, "");
});
