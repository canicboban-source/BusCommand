const COMPANY_TIMEZONES = Object.freeze({
    AT: "Europe/Vienna",
    RS: "Europe/Belgrade"
});
const COMPANY_LANGUAGES = new Set(["de", "sr", "en"]);

function timezoneForCountry(country) {
    return COMPANY_TIMEZONES[String(country || "").trim().toUpperCase()] || "";
}

function validateCompanySettingsDraft(input = {}) {
    const country = String(input.country || "").trim().toUpperCase();
    const timezone = timezoneForCountry(country);
    const defaultLanguage = String(input.defaultLanguage || "").trim().toLowerCase();
    const contactEmail = String(input.contactEmail || "").trim().toLowerCase();
    const errors = {};
    if (!timezone) errors.country = "country_invalid";
    if (!COMPANY_LANGUAGES.has(defaultLanguage)) errors.defaultLanguage = "language_invalid";
    if (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) errors.contactEmail = "email_invalid";
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { country, timezone, defaultLanguage, contactEmail }
    };
}

function companySettingsEqual(left = {}, right = {}) {
    const a = validateCompanySettingsDraft(left).value;
    const b = validateCompanySettingsDraft(right).value;
    return a.country === b.country && a.timezone === b.timezone
        && a.defaultLanguage === b.defaultLanguage && a.contactEmail === b.contactEmail;
}

export {
    COMPANY_LANGUAGES,
    COMPANY_TIMEZONES,
    companySettingsEqual,
    timezoneForCountry,
    validateCompanySettingsDraft
};
