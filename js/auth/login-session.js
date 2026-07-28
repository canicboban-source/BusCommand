// BusCommand — sesija vezana za jedan uređaj i jedan aktivni tab

const DEVICE_ID_KEY = "buscommand_device_id";
const ACTIVE_SESSION_KEY = "buscommand_active_session";
const USER_KEY = "buscommand_user";
const TAB_SESSION_KEY = "buscommand_tab_session";

function newId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `bc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = newId();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

function readActiveSession() {
    try {
        return JSON.parse(localStorage.getItem(ACTIVE_SESSION_KEY) || "null");
    } catch {
        return null;
    }
}

function isSessionValid() {
    const tabSessionId = sessionStorage.getItem(TAB_SESSION_KEY);
    const userRaw = sessionStorage.getItem(USER_KEY);
    if (!tabSessionId || !userRaw) return false;

    const active = readActiveSession();
    if (!active) return false;

    return active.deviceId === getDeviceId() && active.tabSessionId === tabSessionId;
}

/** Nova prijava — poništava sesiju na drugim tabovima istog uređaja */
function persistUserSession(user) {
    const tabSessionId = newId();
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(TAB_SESSION_KEY, tabSessionId);
    localStorage.setItem(
        ACTIVE_SESSION_KEY,
        JSON.stringify({ deviceId: getDeviceId(), tabSessionId, at: Date.now() })
    );
}

/** Ažuriranje korisnika u istoj sesiji (npr. activeGroupId) */
function syncUserSession(user) {
    if (!user) return;
    if (!isSessionValid()) {
        persistUserSession(user);
        return;
    }
    sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

function restoreUserSession() {
    if (!isSessionValid()) {
        clearUserSession();
        return null;
    }
    try {
        return JSON.parse(sessionStorage.getItem(USER_KEY));
    } catch {
        clearUserSession();
        return null;
    }
}

function clearUserSession() {
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TAB_SESSION_KEY);
    sessionStorage.removeItem("buscommand_pretrip_done");
    localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function invalidateSession() {
    window.currentUser = null;
    clearUserSession();
}

function initLoginSessionGuards(onInvalid) {
    if (typeof onInvalid !== "function") return;

    const check = () => {
        if (!window.currentUser) return;
        if (!isSessionValid()) {
            onInvalid();
        }
    };

    window.addEventListener("storage", (event) => {
        if (event.key === ACTIVE_SESSION_KEY) check();
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
    });
}

export {
    persistUserSession,
    syncUserSession,
    restoreUserSession,
    clearUserSession,
    isSessionValid,
    invalidateSession,
    initLoginSessionGuards
};
