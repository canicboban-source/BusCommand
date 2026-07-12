// BusCommand ESM v9.5
import Auth from "../core/auth-client.js";
import { initFirebase } from "../core/firebase-service.js";
import { isCompanyAccessBlocked } from "../core/license.js";
import { saveState } from "../core/state.js";
import { showToast } from "../core/utils.js";
import { showAppLayout } from "../layout/shell.js";
import { t } from "../ui/i18n.js";
import { persistUserSession } from "./login-session.js";
import { clearAllPasswordFields } from "./password-fields.js";

function loginAsDriver() {
    const name = document.getElementById("login-driver-select").value;
    const pin = document.getElementById("login-driver-pin").value.trim();
    
    if (!name) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    
    const driver = window.state.drivers.find(d => d.name === name);
    if (!driver) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }

    if (IS_DEMO_MODE) {
        _loginDriverDemo(driver, name, pin);
    } else {
        _loginDriverProduction(driver, name, pin);
    }
}

function _loginDriverDemo(driver, name, pin) {
    if (isCompanyAccessBlocked()) {
        showToast("Pristup firmi je suspendovan.", "error");
        return;
    }
    if (driver.pin && pin !== driver.pin) {
        clearAllPasswordFields();
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    if (!driver.pin && !pin) {
        clearAllPasswordFields();
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    driver.active = true;
    saveState();
    const route = window.state.routes.find(r => r.groupId === driver.groupId) || window.state.routes[0];
    window.currentUser = {
        role: "driver", name, id: driver.id,
        bus: driver.bus || "91022",
        routeId: route ? route.id : null,
        currentStopIndex: 0, companyId: COMPANY_ID, isDemo: true
    };
    persistUserSession(window.currentUser);
    clearAllPasswordFields();
    showAppLayout();
}

async function _loginDriverProduction(driver, name, pin) {
    if (isCompanyAccessBlocked()) {
        showToast("Pristup firmi je suspendovan.", "error");
        return;
    }
    if (!pin) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    const btn = document.querySelector("#driver-login-form .btn-primary");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }

    const result = await Auth.loginWithPin(COMPANY_ID, driver.id, pin);

    if (btn) { btn.disabled = false; btn.style.opacity = ""; }

    if (!result.success) {
        clearAllPasswordFields();
        showToast(result.error || t("js_invalid_pin"), "error");
        return;
    }

    driver.active = true;
    saveState();
    const route = window.state.routes.find(r => r.groupId === driver.groupId) || window.state.routes[0];
    window.currentUser = {
        role: "driver",
        name: result.user.name || name,
        id: driver.id,
        bus: result.user.bus || driver.bus || "91022",
        routeId: route ? route.id : null,
        currentStopIndex: 0,
        companyId: COMPANY_ID
    };
    persistUserSession(window.currentUser);
    clearAllPasswordFields();
    await initFirebase(COMPANY_ID);
    showAppLayout();
}


// Pomoćna funkcija: prikaži grešku na dispečer login formi
export {
    loginAsDriver,
    _loginDriverDemo,
    _loginDriverProduction
};
