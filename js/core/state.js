// BusCommand ESM v9.5
import { isReadOnly } from "./access.js";
import { isFirebaseReady, saveStateToFirestore } from "./firebase-service.js";
import { scheduleRefreshObservedSections } from "./state-observer.js";

import { FRESH_STATE, DEMO_STATE } from "./constants.js";
import { migrateLegacyShiftCatalog } from "./line-shift-catalog.js";
import { IS_DEMO_MODE, COMPANY_ID } from "./runtime-config.js";

function getBaseState() {
    return IS_DEMO_MODE ? DEMO_STATE : FRESH_STATE;
}

function getStateStorageKey(companyId) {
    const cid = companyId || COMPANY_ID;
    return IS_DEMO_MODE ? "buscommand_demo_state_v2" : ("buscommand_state_" + cid);
}


// --- UČITAVANJE I ČUVANJE STANJA ---
function loadStateFromStorage(companyId) {
    const base = getBaseState();
    const key  = getStateStorageKey(companyId);
    const saved = IS_DEMO_MODE
        ? (sessionStorage.getItem(key) || localStorage.getItem(key))
        : localStorage.getItem(key);

    if (saved) {
        try {
            window.state = { ...base, ...JSON.parse(saved) };
            if (IS_DEMO_MODE) {
                window.state.drivers = window.state.drivers || [];
                window.state.dispatchers = (window.state.dispatchers || []).map(savedDisp => {
                    const def = DEMO_STATE.dispatchers.find(d => d.id === savedDisp.id);
                    return def ? { ...def, ...savedDisp, pin: def.pin } : savedDisp;
                });
            }
            if (window.state.branding && window.state.branding.logo === undefined) window.state.branding.logo = null;
            if (!window.state.shiftCatalogs) window.state.shiftCatalogs = {};
            migrateLegacyShiftCatalog();
            return;
        } catch (e) { /* fall through */ }
    }
    window.state = { ...base };
}

function saveState() {
    if (isReadOnly()) {
        console.log("[ReadOnly] State save blocked — Super Admin inspect mode");
        return;
    }
    const cid = (window.currentUser && window.currentUser.companyId) || COMPANY_ID;
    const key = getStateStorageKey(cid);
    const payload = JSON.stringify(window.state);

    if (IS_DEMO_MODE) {
        sessionStorage.setItem(key, payload);
        localStorage.setItem(key, payload);
    } else {
        localStorage.setItem(key, payload);
        if (true && true && isFirebaseReady()) {
            saveStateToFirestore(window.state, cid);
        }
    }
    scheduleRefreshObservedSections();
}
export {
    getBaseState,
    getStateStorageKey,
    loadStateFromStorage,
    saveState
};
