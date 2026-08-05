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
import { openDriverActivation } from "./driver-activation.js";
import { prepareDriverWorkSession } from "../driver/work-session.js";
import { isStaffSurface } from "../core/app-surface.js";
import { IS_DEMO_MODE } from "../core/runtime-config.js";
import { translateApiError } from "./api-error-i18n.js";
import {
    normalizeCompanyId,
    rememberDriverCompany,
    resolveDriverLoginCompanyId
} from "./driver-company.js";

function readDriverCompanyField() {
    return document.getElementById("login-driver-company")?.value || "";
}

async function loginAsDriver() {
    if (isStaffSurface()) {
        window.location.href = "/driver.html" + window.location.search;
        return;
    }
    const eid = document.getElementById("login-driver-eid")?.value.trim() || "";
    const pin = document.getElementById("login-driver-pin").value.trim();
    const companyId = resolveDriverLoginCompanyId(readDriverCompanyField());

    if (IS_DEMO_MODE) {
        const driverId = document.getElementById("login-driver-select")?.value || "";
        const driver = window.state.drivers.find(d => d.id === driverId || d.name === driverId);
        if (!driver) {
            showToast(t("js_invalid_pin"), "error");
            return;
        }
        _loginDriverDemo(driver, driver.name, pin, companyId);
        return;
    }

    if (!companyId) {
        showToast(t("login_company_required_toast"), "error");
        document.getElementById("login-driver-company")?.focus();
        return;
    }
    if (!eid) {
        showToast(t("login_eid_required_toast"), "error");
        document.getElementById("login-driver-eid")?.focus();
        return;
    }
    await _loginDriverProduction({ eid, pin, companyId });
}

function _loginDriverDemo(driver, name, pin, companyId = "demo") {
    if (isCompanyAccessBlocked()) {
        showToast(t("company_access_blocked"), "error");
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
        bus: driver.bus || "",
        routeId: route ? route.id : null,
        currentStopIndex: 0, companyId: companyId || "demo", isDemo: true
    };
    persistUserSession(window.currentUser);
    clearAllPasswordFields();
    showAppLayout();
}

async function _loginDriverProduction({ eid, pin, companyId }) {
    if (isCompanyAccessBlocked()) {
        showToast(t("company_access_blocked"), "error");
        return;
    }
    if (!pin) {
        showToast(t("js_invalid_pin"), "error");
        return;
    }
    const tenantId = normalizeCompanyId(companyId);
    if (!tenantId) {
        showToast(t("login_company_required_toast"), "error");
        return;
    }
    const btn = document.querySelector("#driver-login-form .btn-primary");
    if (btn) { btn.disabled = true; btn.style.opacity = "0.6"; }

    const result = await Auth.loginWithDriverCode({ companyId: tenantId, eid, loginCode: pin });

    if (btn) { btn.disabled = false; btn.style.opacity = ""; }

    if (!result.success) {
        clearAllPasswordFields();
        showToast(translateApiError(result), "error");
        return;
    }

    if (result.requiresActivation) {
        clearAllPasswordFields();
        rememberDriverCompany(tenantId);
        openDriverActivation();
        return;
    }

    await _completeDriverProductionLogin({ id: result.user.id }, result.user.name, result.user, tenantId);
}

async function _completeDriverProductionLogin(driver, name, authenticatedUser, bootstrapCompanyId) {
    // Prefer claim/session company from auth — never invent from URL after login.
    const companyId = normalizeCompanyId(authenticatedUser?.companyId)
        || normalizeCompanyId(bootstrapCompanyId);
    if (!companyId) {
        showToast(t("login_company_required_toast") || t("company_id_label"), "error");
        return;
    }
    rememberDriverCompany(companyId);
    driver.active = true;
    saveState();
    const route = window.state.routes.find(r => r.groupId === driver.groupId) || window.state.routes[0];
    window.currentUser = {
        role: "driver",
        name: authenticatedUser?.name || name,
        id: driver.id,
        bus: authenticatedUser?.bus || driver.bus || "",
        routeId: route ? route.id : null,
        currentStopIndex: 0,
        companyId
    };
    persistUserSession(window.currentUser);
    clearAllPasswordFields();
    if (!(await prepareDriverWorkSession())) return;
    await initFirebase(companyId);
    showAppLayout();
}


// Pomoćna funkcija: prikaži grešku na dispečer login formi
export {
    loginAsDriver,
    _loginDriverDemo,
    _loginDriverProduction,
    _completeDriverProductionLogin
};
