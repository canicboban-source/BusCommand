// BusCommand — shared message display helper (driver + staff)
import { t } from "../ui/i18n.js";

/**
 * Tekst poruke za prikaz (template + detalj), na datom jeziku.
 * @param {{ template?: string, text?: string, detail?: string }} msg
 * @param {string} [lang]
 */
export function msgText(msg, lang) {
    if (!msg) return "";
    const dict = lang ? (window.TRANSLATIONS?.[lang] || window.TRANSLATIONS?.en) : null;
    const translated = dict
        ? (dict[msg.template] || window.TRANSLATIONS?.en?.[msg.template])
        : t(msg.template);
    const base = translated || msg.text || msg.template || "";
    return msg.detail ? `${base} — ${msg.detail}` : base;
}
