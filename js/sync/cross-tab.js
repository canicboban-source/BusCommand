// BusCommand ESM v9.5
import { scheduleRefreshObservedSections } from "../core/state-observer.js";
import { getBaseState, getStateStorageKey } from "../core/state.js";
import { isSessionValid } from "../auth/login-session.js";
import { showLoginScreen } from "../auth/login-ui.js";
import { checkSOSStatus } from "../driver/dashboard.js";
import { renderDriverMessages } from "../driver/messages-inbox.js";

// --- CROSS-TAB SINHRONIZACIJA (SOS I PORUKE) ---
// Kada se window.state promeni u drugoj kartici (npr. vozač pošalje SOS),
// dispečerska kartica automatski prima obaveštenje i ažurira se.
window.addEventListener("storage", (event) => {
    const key = getStateStorageKey(COMPANY_ID);
    if (event.key === "buscommand_active_session" && window.currentUser && !isSessionValid()) {
        window.currentUser = null;
        showLoginScreen(true);
        return;
    }
    if (event.key === key && event.newValue) {
        try {
            const newState = JSON.parse(event.newValue);
            window.state = { ...getBaseState(), ...newState };
            
            if (window.currentUser) {
                checkSOSStatus();
                if (window.currentUser.role === "dispatcher") {
                    scheduleRefreshObservedSections({ topics: ["all"] });
                }
                if (window.currentUser.role === "driver") {
                    renderDriverMessages();
                }
            }
        } catch(e) {
            console.error("State sync error:", e);
        }
    }
});

setInterval(() => {
    if (!window.currentUser) return;
    const key = getStateStorageKey(COMPANY_ID);
    const saved = localStorage.getItem(key);
    if (!saved) return;
    try {
        const freshState = JSON.parse(saved);
        if (freshState.sosActive !== window.state.sosActive ||
            freshState.sosDriver !== window.state.sosDriver) {
            window.state.sosActive = freshState.sosActive;
            window.state.sosDriver = freshState.sosDriver;
            window.state.sosBus = freshState.sosBus;
            checkSOSStatus();
        }
        // Ažuriraj poruke na dashboardu vozača u realnom vremenu
        if (window.currentUser.role === "driver" && freshState.messages) {
            const prevCount = window.state.messages ? window.state.messages.length : 0;
            if (freshState.messages.length !== prevCount) {
                window.state.messages = freshState.messages;
                renderDriverMessages();
            }
        }
    } catch(_e) {}
}, 1500);