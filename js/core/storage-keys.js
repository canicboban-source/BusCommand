// BusCommand — centralizovani localStorage / sessionStorage ključevi

export const STORAGE = {
    DEVICE_ID: "buscommand_device_id",
    ACTIVE_SESSION: "buscommand_active_session",
    USER: "buscommand_user",
    TAB_SESSION: "buscommand_tab_session",
    FORCE_LOGIN: "buscommand_force_login",
    LANG: "buscommand_lang",
    THEME: "buscommand_theme",
    DEMO_STATE: "buscommand_demo_state_v2",
    SPOKEN_MESSAGES: "buscommand_spoken_messages",
    PRETRIP_DONE: "buscommand_pretrip_done"
};

const LEGACY = {
    DEVICE_ID: "buscommand_device_id",
    ACTIVE_SESSION: "buscommand_active_session",
    USER: "buscommand_user",
    TAB_SESSION: "buscommand_tab_session",
    FORCE_LOGIN: "buscommand_force_login",
    LANG: "buscommand_lang",
    THEME: "buscommand_theme",
    DEMO_STATE: "buscommand_demo_state_v2",
    SPOKEN_MESSAGES: "buscommand_spoken_messages",
    PRETRIP_DONE: "buscommand_pretrip_done"
};

function migrateKey(store, legacyKey, newKey) {
    if (store.getItem(newKey) != null) return;
    const legacy = store.getItem(legacyKey);
    if (legacy != null) {
        store.setItem(newKey, legacy);
    }
}

/** Jednom pri boot-u: prebaci BusCommand ključeve na BusCommand. */
export function migrateLegacyStorage() {
    try {
        for (const key of Object.keys(STORAGE)) {
            migrateKey(localStorage, LEGACY[key], STORAGE[key]);
            migrateKey(sessionStorage, LEGACY[key], STORAGE[key]);
        }
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("buscommand_state_")) {
                const nk = k.replace(/^buscommand_state_/, "buscommand_state_");
                migrateKey(localStorage, k, nk);
            }
        }
    } catch (e) {
        console.warn("Storage migration skipped:", e);
    }
}

export function stateStorageKey(companyId, isDemoMode) {
    if (isDemoMode) return STORAGE.DEMO_STATE;
    return "buscommand_state_" + (companyId || "demo");
}
