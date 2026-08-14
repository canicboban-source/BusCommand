// BusCommand ESM v9.5 — demo-only role toggle (never production)
import { saveState } from "../core/state.js";
import { persistUserSession } from "../auth/login-session.js";
import { showAppLayout } from "./shell.js";
import { USE_LOCAL_STATE } from "../core/runtime-config.js";
import { showToast } from "../core/utils.js";
import { t } from "../ui/i18n.js";

function toggleRoleDirectly() {
    if (!USE_LOCAL_STATE) {
        showToast(t("error_invalid_credentials") || "Role switch is disabled.", "error");
        return;
    }
    if (!window.currentUser) return;
    if (window.currentUser.role === "driver") {
        const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
        if (driver) {
            driver.active = false;
            driver.preTripDone = false;
            saveState();
        }
        sessionStorage.removeItem("buscommand_pretrip_done");
        window.currentUser.role = "dispatcher";
        window.currentUser.name = "disp_center";
        window.currentCalendarMonth = new Date().toISOString().slice(0, 7);
    } else {
        window.currentUser.role = "driver";
        window.currentUser.name = window.state.drivers[0].name;
        window.currentUser.bus = window.state.drivers[0].bus || window.state.buses[0].number;
        window.currentUser.routeId = window.state.routes[0].id;
        window.currentUser.currentStopIndex = 0;

        const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
        if (driver) {
            driver.active = true;
            driver.preTripDone = false;
            saveState();
        }
    }
    persistUserSession(window.currentUser);
    showAppLayout();
}
export {
    toggleRoleDirectly
};
