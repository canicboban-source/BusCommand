/**
 * Countries the platform can host a tenant in, mapped to their canonical IANA zone.
 * The timezone is DERIVED here and never read from the operator's device: the
 * confirmation scheduler, DST handling and the daily plan all depend on the tenant
 * zone being a real IANA id. That is why the country stays a closed list instead of
 * free text — a typed country name yields no zone.
 * Countries spanning several zones (RU) are intentionally absent; PT/ES map to the
 * mainland zone, so island branches need an explicit decision before onboarding.
 */
const COMPANY_TIMEZONES = Object.freeze({
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
const COMPANY_LANGUAGES = new Set(["de", "sr", "en"]);

function timezoneForCountry(country) {
    return COMPANY_TIMEZONES[String(country || "").trim().toUpperCase()] || "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const badEmail = (v) => v.length > 254 || !EMAIL_PATTERN.test(v);
/** Official on-duty dispatch line (E.164) that drivers may call. Never a private mobile. */
const DISPATCH_PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;
const normalizeDispatchPhone = (v) => String(v || "").replace(/[\s\-()]/g, "").trim();

function validateCompanySettingsDraft(input = {}) {
    const country = String(input.country || "").trim().toUpperCase();
    const timezone = timezoneForCountry(country);
    const defaultLanguage = String(input.defaultLanguage || "").trim().toLowerCase();
    const contactEmail = String(input.contactEmail || "").trim().toLowerCase();
    const taxId = String(input.taxId || "").trim();
    const billingEmail = String(input.billingEmail || "").trim().toLowerCase();
    const smsSenderId = String(input.smsSenderId || "").trim().toUpperCase();
    const dispatchPhone = normalizeDispatchPhone(input.dispatchPhone);
    const errors = {};
    if (!timezone) errors.country = "country_invalid";
    if (!COMPANY_LANGUAGES.has(defaultLanguage)) errors.defaultLanguage = "language_invalid";
    if (badEmail(contactEmail)) errors.contactEmail = "email_invalid";
    if (taxId.length > 32) errors.taxId = "tax_id_invalid";
    if (billingEmail && badEmail(billingEmail)) errors.billingEmail = "billing_email_invalid";
    if (smsSenderId && !/^[A-Z0-9]{1,11}$/.test(smsSenderId)) errors.smsSenderId = "sms_sender_id_invalid";
    if (dispatchPhone && !DISPATCH_PHONE_PATTERN.test(dispatchPhone)) errors.dispatchPhone = "dispatch_phone_invalid";
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { country, timezone, defaultLanguage, contactEmail, taxId, billingEmail, smsSenderId, dispatchPhone }
    };
}

function companySettingsEqual(left = {}, right = {}) {
    const a = validateCompanySettingsDraft(left).value;
    const b = validateCompanySettingsDraft(right).value;
    return Object.keys(a).every((key) => a[key] === b[key]);
}

export {
    COMPANY_LANGUAGES,
    COMPANY_TIMEZONES,
    DISPATCH_PHONE_PATTERN,
    companySettingsEqual,
    normalizeDispatchPhone,
    timezoneForCountry,
    validateCompanySettingsDraft
};
