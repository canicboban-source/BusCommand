// BusCommand ESM v9.5
import { isReadOnly } from "./access.js";
import { isFirebaseReady, saveStateToFirestore } from "./firebase-service.js";
import { scheduleRefreshObservedSections } from "./state-observer.js";

import { FRESH_STATE, DEMO_STATE } from "./constants.js";
import { migrateLegacyShiftCatalog } from "./line-shift-catalog.js";
import { IS_DEMO_MODE } from "./runtime-config.js";

const TENANT_STATE_PREFIX = "buscommand_state_";
const PILOT_UI_LANGS = new Set(["de", "en", "sr", "hr"]);

function getBaseState() {
    return IS_DEMO_MODE ? DEMO_STATE : FRESH_STATE;
}

/**
 * Demo-only platform SA account for local QA (not a tenant / company).
 * Credentials match tests/e2e/helpers.js — never used in production builds' auth path.
 */
function ensureDemoPlatformAdmin(state) {
    if (!IS_DEMO_MODE || !state) return state;
    if (!Array.isArray(state.dispatchers)) state.dispatchers = [];
    const hasSa = state.dispatchers.some(
        (d) => d && (d.id === "superadmin" || d.isSuperAdmin === true)
    );
    if (hasSa) return state;
    state.dispatchers = [
        {
            id: "superadmin",
            name: "Super Admin",
            email: "sa@demo.local",
            password: "sa-demo-ok",
            isSuperAdmin: true
        },
        ...state.dispatchers
    ];
    return state;
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
    }
    return lang;
}

function getStateStorageKey(companyId) {
    const cid = companyId || (IS_DEMO_MODE ? "demo" : null);
    if (!cid) return null;
    return IS_DEMO_MODE ? "buscommand_demo_state_v3" : (TENANT_STATE_PREFIX + cid);
}

function resolveAuthenticatedCompanyId() {
    return window.currentUser?.companyId || (IS_DEMO_MODE ? "demo" : null);
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
    ensureDemoPlatformAdmin(window.state);
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
    const saved = IS_DEMO_MODE
        ? (sessionStorage.getItem(key) || localStorage.getItem(key))
        : localStorage.getItem(key);

    if (saved) {
        try {
            window.state = { ...base, ...JSON.parse(saved) };
            if (IS_DEMO_MODE) window.state.drivers = window.state.drivers || [];
            if (window.state.branding && window.state.branding.logo === undefined) window.state.branding.logo = null;
            if (!window.state.shiftCatalogs) window.state.shiftCatalogs = {};
            migrateLegacyShiftCatalog();
            ensureDemoPlatformAdmin(window.state);
            applyUiLanguagePreference();
            return;
        } catch { /* fall through */ }
    }
    window.state = { ...base };
    ensureDemoPlatformAdmin(window.state);
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

    if (IS_DEMO_MODE) {
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
    ensureDemoPlatformAdmin,
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
