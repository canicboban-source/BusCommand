// Map stable API error codes to i18n keys (never show raw server locale strings).
const FALLBACK = "js_invalid_pin";

function lookupTranslation(key) {
    const lang = (typeof window !== "undefined" && window.state?.language) || "en";
    const translations = (typeof window !== "undefined" && window.TRANSLATIONS) || {};
    return (translations[lang] && translations[lang][key])
        || (translations.en && translations.en[key])
        || key;
}

function translateApiError(payload, fallbackKey = FALLBACK) {
    const code = String(payload?.code || payload?.errorCode || "").trim();
    if (code) {
        const key = `api_error_${code}`;
        const translated = lookupTranslation(key);
        if (translated && translated !== key) return translated;
    }
    const fallback = lookupTranslation(fallbackKey);
    return fallback && fallback !== fallbackKey ? fallback : lookupTranslation(FALLBACK);
}

export {
    translateApiError,
    FALLBACK as API_ERROR_FALLBACK_KEY
};
