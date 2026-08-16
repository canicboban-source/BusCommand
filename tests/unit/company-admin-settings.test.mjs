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
    country: "RS", timezone: "Europe/Belgrade", defaultLanguage: "sr", contactEmail: "office@example.rs",
    taxId: "", billingEmail: "", smsSenderId: "", dispatchPhone: ""
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

test("company settings validate the new legal fields (taxId, billingEmail, smsSenderId)", () => {
  const valid = validateCompanySettingsDraft({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at",
    taxId: "ATU12345678", billingEmail: "billing@example.at", smsSenderId: "alpenbus"
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.value.smsSenderId, "ALPENBUS");

  const invalid = validateCompanySettingsDraft({
    country: "AT", defaultLanguage: "de", contactEmail: "office@example.at",
    taxId: "X".repeat(33), billingEmail: "not-an-email", smsSenderId: "bad id!"
  });
  assert.deepEqual(Object.keys(invalid.errors).sort(), ["billingEmail", "smsSenderId", "taxId"]);
});

test("settings equality also compares the new legal fields", () => {
  assert.equal(companySettingsEqual(
    { country: "AT", defaultLanguage: "de", contactEmail: "a@b.at", taxId: "ATU1", billingEmail: "b@b.at", smsSenderId: "x" },
    { country: "AT", defaultLanguage: "de", contactEmail: "a@b.at", taxId: "ATU1", billingEmail: "b@b.at", smsSenderId: "x" }
  ), true);
  assert.equal(companySettingsEqual(
    { country: "AT", defaultLanguage: "de", contactEmail: "a@b.at", taxId: "ATU1" },
    { country: "AT", defaultLanguage: "de", contactEmail: "a@b.at", taxId: "ATU2" }
  ), false);
});

test("dispatch phone is optional, normalized to E.164 and rejected when malformed", () => {
  const base = { country: "AT", defaultLanguage: "de", contactEmail: "office@example.at" };

  // Empty is the default: the driver call button simply stays hidden.
  assert.equal(validateCompanySettingsDraft(base).value.dispatchPhone, "");

  // Spaces, dashes and brackets are cosmetic and must not fail validation.
  const spaced = validateCompanySettingsDraft({ ...base, dispatchPhone: " +43 (699) 123-4567 " });
  assert.equal(spaced.valid, true);
  assert.equal(spaced.value.dispatchPhone, "+436991234567");

  for (const bad of ["0699123456", "+0699123456", "+43", "not-a-number", "+4369912345678901234"]) {
    const invalid = validateCompanySettingsDraft({ ...base, dispatchPhone: bad });
    assert.equal(invalid.valid, false, `expected ${bad} to be rejected`);
    assert.equal(invalid.errors.dispatchPhone, "dispatch_phone_invalid");
  }
});

test("settings equality treats a changed dispatch phone as a real change", () => {
  const base = { country: "AT", defaultLanguage: "de", contactEmail: "a@b.at" };
  assert.equal(companySettingsEqual(
    { ...base, dispatchPhone: "+43 699 1234567" },
    { ...base, dispatchPhone: "+436991234567" }
  ), true);
  assert.equal(companySettingsEqual(
    { ...base, dispatchPhone: "+436991234567" },
    { ...base, dispatchPhone: "+436991234568" }
  ), false);
});
