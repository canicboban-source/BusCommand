// BusCommand ESM v9.5
import { isReadOnly } from "./access.js";
import { isFirebaseReady, saveStateToFirestore } from "./firebase-service.js";
import { scheduleRefreshObservedSections } from "./state-observer.js";

import { FRESH_STATE } from "./constants.js";
import { migrateLegacyShiftCatalog } from "./line-shift-catalog.js";
import { USE_LOCAL_STATE } from "./runtime-config.js";

const TENANT_STATE_PREFIX = "buscommand_state_";
/** D23 — product UI languages only. */
const PILOT_UI_LANGS = new Set(["de", "en", "sr"]);

function getBaseState() {
    // Product and QA local-state both start from the same empty shell.
    // Ephemeral QA entities are injected only by tests/e2e factories.
    return FRESH_STATE;
}

/**
 * UI locale source of truth: buscommand_lang (survives tenant reset).
 * Never trust FRESH_STATE.language ("en") over the user's language select.
 */
function resolveUiLanguage(preferred) {
    const normalize = (value) => {
        const lang = String(value || "").trim().toLowerCase();
        if (!lang) return null;
        if (typeof window !== "undefined" && window.TRANSLATIONS) {
            return window.TRANSLATIONS[lang] ? lang : null;
        }
        return PILOT_UI_LANGS.has(lang) ? lang : null;
    };
    let stored = null;
    try {
        stored = typeof localStorage !== "undefined" ? localStorage.getItem("buscommand_lang") : null;
    } catch {
        stored = null;
    }
    return normalize(preferred)
        || normalize(stored)
        || normalize(typeof window !== "undefined" ? window.state?.language : null)
        || "en";
}

/** Re-apply UI language after any window.state = { ...getBaseState(), ... } merge. */
function applyUiLanguagePreference(preferred) {
    const lang = resolveUiLanguage(preferred);
    if (!window.state) {
        window.state = { ...getBaseState(), language: lang };
    } else {
        window.state.language = lang;
    }
    try {
        if (typeof localStorage !== "undefined" && localStorage.getItem("buscommand_lang") !== lang) {
            localStorage.setItem("buscommand_lang", lang);
        }
    } catch { /* ignore quota / private mode */ }
    if (typeof document !== "undefined") {
        document.documentElement.lang = lang;
        const loginSel = document.getElementById("login-lang-select");
        const headerSel = document.getElementById("header-lang-select");
        if (loginSel) loginSel.value = lang;
        if (headerSel) headerSel.value = lang;
        // D28: driver PWA uses one-tap buttons instead of a select — mark the active one.
        document.querySelectorAll(".driver-pwa-lang").forEach((btn) => {
            const active = btn.getAttribute("data-lang") === lang;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }
    return lang;
}

function getStateStorageKey(companyId) {
    const cid = companyId || (USE_LOCAL_STATE ? "qa-local" : null);
    if (!cid) return null;
    return TENANT_STATE_PREFIX + cid;
}

function resolveAuthenticatedCompanyId() {
    return window.currentUser?.companyId || (USE_LOCAL_STATE ? "qa-local" : null);
}

/** Remove one tenant's offline cache (logout / SA delete). */
function clearTenantStateCache(companyId) {
    if (!companyId || companyId === "buscommand-preview") return false;
    const key = getStateStorageKey(companyId);
    if (!key) return false;
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return true;
}

/** Remove all buscommand_state_* keys, optionally keeping the active tenant. */
function clearAllTenantStateCaches({ keepCompanyId = null } = {}) {
    const removed = [];
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(TENANT_STATE_PREFIX)) continue;
        const companyId = key.slice(TENANT_STATE_PREFIX.length);
        if (keepCompanyId && companyId === keepCompanyId) continue;
        localStorage.removeItem(key);
        removed.push(companyId);
    }
    return removed;
}

function resetInMemoryTenantState(language) {
    window.state = { ...getBaseState(), language: resolveUiLanguage(language) };
    window._licenseInfo = null;
}

// --- UČITAVANJE I ČUVANJE STANJA ---
function loadStateFromStorage(companyId) {
    const base = getBaseState();
    const key  = getStateStorageKey(companyId);
    if (!key) {
        window.state = { ...base };
        applyUiLanguagePreference();
        return;
    }
    const saved = USE_LOCAL_STATE
        ? (sessionStorage.getItem(key) || localStorage.getItem(key))
        : localStorage.getItem(key);

    if (saved) {
        try {
            window.state = { ...base, ...JSON.parse(saved) };
            if (USE_LOCAL_STATE) window.state.drivers = window.state.drivers || [];
            if (window.state.branding && window.state.branding.logo === undefined) window.state.branding.logo = null;
            if (!window.state.shiftCatalogs) window.state.shiftCatalogs = {};
            migrateLegacyShiftCatalog();
            applyUiLanguagePreference();
            return;
        } catch { /* fall through */ }
    }
    window.state = { ...base };
    applyUiLanguagePreference();
}

function saveState() {
    if (isReadOnly()) {
        console.log("[ReadOnly] State save blocked — Super Admin inspect mode");
        return;
    }
    // Production must never fall back to URL ?company= — that leaked stale tenants (live-review 7A.2).
    const cid = resolveAuthenticatedCompanyId();
    if (!cid) return;
    const key = getStateStorageKey(cid);
    if (!key) return;
    const payload = JSON.stringify(window.state);

    if (USE_LOCAL_STATE) {
        sessionStorage.setItem(key, payload);
        localStorage.setItem(key, payload);
    } else {
        localStorage.setItem(key, payload);
        if (isFirebaseReady()) {
            saveStateToFirestore(window.state, cid);
        }
    }
    scheduleRefreshObservedSections();
}
export {
    getBaseState,
    getStateStorageKey,
    resolveAuthenticatedCompanyId,
    resolveUiLanguage,
    applyUiLanguagePreference,
    clearTenantStateCache,
    clearAllTenantStateCaches,
    resetInMemoryTenantState,
    loadStateFromStorage,
    saveState
};
