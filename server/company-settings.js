"use strict";

const COMPANY_COUNTRY_TIMEZONE = Object.freeze({
  AT: "Europe/Vienna",
  RS: "Europe/Belgrade"
});

function timezoneForCompanyCountry(country) {
  const code = String(country || "").trim().toUpperCase();
  const timezone = COMPANY_COUNTRY_TIMEZONE[code];
  if (!timezone) {
    const error = new Error("Drzava sedista trenutno nije podrzana.");
    error.code = "country-not-supported";
    throw error;
  }
  return timezone;
}

function normalizeCompanyProfileSettings(input = {}) {
  const country = String(input.country || "").trim().toUpperCase();
  return {
    country,
    timezone: timezoneForCompanyCountry(country),
    defaultLanguage: String(input.defaultLanguage || "").trim().toLowerCase(),
    contactEmail: String(input.contactEmail || "").trim().toLowerCase(),
    taxId: String(input.taxId || "").trim(),
    billingEmail: String(input.billingEmail || "").trim().toLowerCase(),
    smsSenderId: String(input.smsSenderId || "").trim().toUpperCase(),
    // Official on-duty dispatch line. Readable by every driver of this tenant,
    // so it must be a company line — never a dispatcher's private mobile.
    dispatchPhone: String(input.dispatchPhone || "").replace(/[\s\-()]/g, "").trim()
  };
}

module.exports = {
  COMPANY_COUNTRY_TIMEZONE,
  normalizeCompanyProfileSettings,
  timezoneForCompanyCountry
};
