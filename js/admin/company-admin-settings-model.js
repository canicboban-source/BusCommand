const COMPANY_TIMEZONES = Object.freeze({
    AT: "Europe/Vienna",
    RS: "Europe/Belgrade"
});
const COMPANY_LANGUAGES = new Set(["de", "sr", "en"]);

function timezoneForCountry(country) {
    return COMPANY_TIMEZONES[String(country || "").trim().toUpperCase()] || "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const badEmail = (v) => v.length > 254 || !EMAIL_PATTERN.test(v);

function validateCompanySettingsDraft(input = {}) {
    const country = String(input.country || "").trim().toUpperCase();
    const timezone = timezoneForCountry(country);
    const defaultLanguage = String(input.defaultLanguage || "").trim().toLowerCase();
    const contactEmail = String(input.contactEmail || "").trim().toLowerCase();
    const taxId = String(input.taxId || "").trim();
    const billingEmail = String(input.billingEmail || "").trim().toLowerCase();
    const smsSenderId = String(input.smsSenderId || "").trim().toUpperCase();
    const errors = {};
    if (!timezone) errors.country = "country_invalid";
    if (!COMPANY_LANGUAGES.has(defaultLanguage)) errors.defaultLanguage = "language_invalid";
    if (badEmail(contactEmail)) errors.contactEmail = "email_invalid";
    if (taxId.length > 32) errors.taxId = "tax_id_invalid";
    if (billingEmail && badEmail(billingEmail)) errors.billingEmail = "billing_email_invalid";
    if (smsSenderId && !/^[A-Z0-9]{1,11}$/.test(smsSenderId)) errors.smsSenderId = "sms_sender_id_invalid";
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { country, timezone, defaultLanguage, contactEmail, taxId, billingEmail, smsSenderId }
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
    companySettingsEqual,
    timezoneForCountry,
    validateCompanySettingsDraft
};
