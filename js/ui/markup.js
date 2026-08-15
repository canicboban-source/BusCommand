// BusCommand ESM v9.5 — shared HTML fragment builders.
//
// D17 dedup: these four shapes were re-typed verbatim in hundreds of template
// literals across js/admin/ and js/data/. Emitting them from one place keeps the
// markup identical while removing the repeated string payload from the bundle.
import { escapeHtml } from "../core/utils.js";
import { t } from "./i18n.js";

/** Escaped translation — replaces the `${escapeHtml(t("key"))}` pair. */
function tx(key, vars) {
    return escapeHtml(vars ? t(key, vars) : t(key));
}

/** Lucide icon placeholder. Needs a refreshIcons() after the innerHTML write. */
function icon(name) {
    return `<i data-lucide="${name}"></i>`;
}

/**
 * Standard action button. `attrs` is normally an actionAttr(...) result;
 * `extra` carries per-site attributes such as `disabled` or an id.
 */
function btnSecondary(attrs, inner, extra) {
    return `<button type="button" class="btn-secondary" ${attrs}${extra ? ` ${extra}` : ""}>${inner}</button>`;
}

function btnPrimary(attrs, inner, extra) {
    return `<button type="button" class="btn-primary" ${attrs}${extra ? ` ${extra}` : ""}>${inner}</button>`;
}

/** `<div><span>label</span><strong>value</strong></div>` — preview/summary strip cell. */
function statCell(labelKey, value) {
    return `<div><span>${tx(labelKey)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

export { tx, icon, btnSecondary, btnPrimary, statCell };
