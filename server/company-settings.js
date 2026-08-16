"use strict";

/**
 * Countries the platform can host a tenant in, mapped to their canonical IANA zone.
 * The timezone is DERIVED here and never read from the operator's device: the
 * confirmation scheduler, DST handling and the daily plan all depend on the tenant
 * zone being a real IANA id. That is why the country stays a closed list instead of
 * free text — a typed country name yields no zone.
 * Countries spanning several zones (RU) are intentionally absent; PT/ES map to the
 * mainland zone, so island branches need an explicit decision before onboarding.
 */
const COMPANY_COUNTRY_TIMEZONE = Object.freeze({
  AD: "Europe/Andorra",
  AL: "Europe/Tirane",
  AT: "Europe/Vienna",
  BA: "Europe/Sarajevo",
  BE: "Europe/Brussels",
  BG: "Europe/Sofia",
  BY: "Europe/Minsk",
  CH: "Europe/Zurich",
  CY: "Asia/Nicosia",
  CZ: "Europe/Prague",
  DE: "Europe/Berlin",
  DK: "Europe/Copenhagen",
  EE: "Europe/Tallinn",
  ES: "Europe/Madrid",
  FI: "Europe/Helsinki",
  FR: "Europe/Paris",
  GB: "Europe/London",
  GR: "Europe/Athens",
  HR: "Europe/Zagreb",
  HU: "Europe/Budapest",
  IE: "Europe/Dublin",
  IS: "Atlantic/Reykjavik",
  IT: "Europe/Rome",
  LI: "Europe/Vaduz",
  LT: "Europe/Vilnius",
  LU: "Europe/Luxembourg",
  LV: "Europe/Riga",
  MC: "Europe/Monaco",
  MD: "Europe/Chisinau",
  ME: "Europe/Podgorica",
  MK: "Europe/Skopje",
  MT: "Europe/Malta",
  NL: "Europe/Amsterdam",
  NO: "Europe/Oslo",
  PL: "Europe/Warsaw",
  PT: "Europe/Lisbon",
  RO: "Europe/Bucharest",
  RS: "Europe/Belgrade",
  SE: "Europe/Stockholm",
  SI: "Europe/Ljubljana",
  SK: "Europe/Bratislava",
  SM: "Europe/San_Marino",
  TR: "Europe/Istanbul",
  UA: "Europe/Kyiv",
  VA: "Europe/Vatican",
  XK: "Europe/Belgrade"
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
