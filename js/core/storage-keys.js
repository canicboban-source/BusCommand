// BusCommand — centralizovani localStorage / sessionStorage ključevi

export const STORAGE = {
    DEVICE_ID: "buscommand_device_id",
    ACTIVE_SESSION: "buscommand_active_session",
    USER: "buscommand_user",
    TAB_SESSION: "buscommand_tab_session",
    FORCE_LOGIN: "buscommand_force_login",
    LANG: "buscommand_lang",
    THEME: "buscommand_theme",
    /** @deprecated legacy demo key — purged on boot; do not write new data here */
    LEGACY_DEMO_STATE: "buscommand_demo_state_v3",
    SPOKEN_MESSAGES: "buscommand_spoken_messages",
    PRETRIP_DONE: "buscommand_pretrip_done",
    /** Device-local last successful driver tenant (login bootstrap only). */
    LAST_DRIVER_COMPANY: "buscommand_last_driver_company"
};

const LEGACY = {
    DEVICE_ID: "buscommand_device_id",
    ACTIVE_SESSION: "buscommand_active_session",
    USER: "buscommand_user",
    TAB_SESSION: "buscommand_tab_session",
    FORCE_LOGIN: "buscommand_force_login",
    LANG: "buscommand_lang",
    THEME: "buscommand_theme",
    LEGACY_DEMO_STATE: "buscommand_demo_state_v3",
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
            if (!LEGACY[key]) continue;
            migrateKey(localStorage, LEGACY[key], STORAGE[key]);
            migrateKey(sessionStorage, LEGACY[key], STORAGE[key]);
        }
    } catch (e) {
        console.warn("Storage migration skipped:", e);
    }
}

export function stateStorageKey(companyId, useLocalState) {
    void useLocalState;
    return "buscommand_state_" + (companyId || "qa-local");
}
