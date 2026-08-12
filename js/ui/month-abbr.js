/**
 * Localized three-letter month labels for UI display (sr / en / de).
 * Canonical storage remains YYYY-MM. No silent English label fallback for sr/de.
 */
const MONTH_ABBR = Object.freeze({
    sr: Object.freeze(["jan", "feb", "mar", "apr", "maj", "jun", "jul", "avg", "sep", "okt", "nov", "dec"]),
    en: Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]),
    de: Object.freeze(["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"])
});

const SUPPORTED_LANGS = Object.freeze(["sr", "en", "de"]);

function normalizeMonthLang(lang) {
    const normalized = String(lang || "").trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(MONTH_ABBR, normalized)) {
        throw new Error(`Unsupported UI language for month abbr: ${lang || "(empty)"}`);
    }
    return normalized;
}

function monthAbbrFor(lang, monthIndex1to12) {
    const key = normalizeMonthLang(lang);
    const index = Number(monthIndex1to12);
    if (!Number.isInteger(index) || index < 1 || index > 12) {
        throw new Error(`Invalid month index: ${monthIndex1to12}`);
    }
    return MONTH_ABBR[key][index - 1];
}

function listMonthAbbr(lang) {
    return MONTH_ABBR[normalizeMonthLang(lang)].slice();
}

function parseYearMonth(yearMonth) {
    const match = String(yearMonth || "").trim().match(/^(\d{4})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
    return { year, month, value: `${match[1]}-${match[2]}` };
}

function formatYearMonthDisplay(yearMonth, lang) {
    const parsed = parseYearMonth(yearMonth);
    if (!parsed) return "";
    return `${monthAbbrFor(lang, parsed.month)} ${parsed.year}`;
}

function padMonth(month) {
    return String(month).padStart(2, "0");
}

function buildYearMonthSelectOptions(selectedYm, lang, { yearsBefore = 2, yearsAfter = 2 } = {}) {
    normalizeMonthLang(lang);
    const selected = parseYearMonth(selectedYm);
    const now = new Date();
    const centerYear = selected?.year || now.getFullYear();
    const startYear = centerYear - Math.max(0, Number(yearsBefore) || 0);
    const endYear = centerYear + Math.max(0, Number(yearsAfter) || 0);
    const values = [];
    for (let year = startYear; year <= endYear; year += 1) {
        for (let month = 1; month <= 12; month += 1) {
            values.push(`${year}-${padMonth(month)}`);
        }
    }
    if (selected && !values.includes(selected.value)) {
        values.push(selected.value);
        values.sort();
    }
    return values.map((value) => ({
        value,
        label: formatYearMonthDisplay(value, lang)
    }));
}

export {
    MONTH_ABBR,
    SUPPORTED_LANGS,
    normalizeMonthLang,
    monthAbbrFor,
    listMonthAbbr,
    parseYearMonth,
    formatYearMonthDisplay,
    buildYearMonthSelectOptions
};
