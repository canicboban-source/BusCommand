// Minimal plural helper — kept free of app bootstrap deps for unit tests.
function hasTranslationKey(key) {
    const lang = (typeof window !== "undefined" && window.state?.language) || "en";
    const translations = (typeof window !== "undefined" && window.TRANSLATIONS) || {};
    return Boolean(
        (translations[lang] && translations[lang][key])
        || (translations.en && translations.en[key])
    );
}

function resolvePluralKey(key, count) {
    const n = Number(count);
    const singularKey = `${key}_one`;
    if (Number.isFinite(n) && n === 1 && hasTranslationKey(singularKey)) return singularKey;
    return key;
}

function lookupTranslation(key) {
    const lang = (typeof window !== "undefined" && window.state?.language) || "en";
    const translations = (typeof window !== "undefined" && window.TRANSLATIONS) || {};
    return (translations[lang] && translations[lang][key])
        || (translations.en && translations.en[key])
        || key;
}

function applyReplacements(text, replacements = {}) {
    let out = String(text);
    Object.keys(replacements).forEach((placeholder) => {
        out = out.replace(`{${placeholder}}`, replacements[placeholder]);
    });
    return out;
}

/** Translate with optional `${key}_one` form when count === 1. */
function tp(key, count, replacements = {}) {
    const resolved = resolvePluralKey(key, count);
    return applyReplacements(lookupTranslation(resolved), { ...replacements, count });
}

export {
    applyReplacements,
    hasTranslationKey,
    resolvePluralKey,
    tp
};
