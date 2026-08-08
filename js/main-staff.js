/**
 * BusCommand — Staff desktop entry (SA / CA / dispatcher)
 */
import { BusCommandConfig, USE_LOCAL_STATE, COMPANY_ID } from "./core/runtime-config.js";
import Auth from "./core/auth-client.js";
import ApiClient from "./core/api-client.js";
import "./core/store.js";
import { installStaffSurface } from "./install-staff.js";
import { registerOnclickHandlers } from "./register-onclick-staff.js";
import { installOperationsHealthConsistency } from "./dispatcher/operations-health-consistency.js";
import { bootstrapBusCommand } from "./bootstrap/init.js";
import { migrateLegacyStorage } from "./core/storage-keys.js";
import "./core/state-observer-setup-staff.js";

window.__BUSCOMMAND_SURFACE__ = "staff";
window.BusCommandConfig = BusCommandConfig;
window.USE_LOCAL_STATE = USE_LOCAL_STATE;
window.COMPANY_ID = COMPANY_ID;
window.Auth = Auth;
window.ApiClient = ApiClient;

migrateLegacyStorage();
installStaffSurface();
registerOnclickHandlers();
installOperationsHealthConsistency();

function startBusCommand() {
    bootstrapBusCommand();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startBusCommand);
} else {
    startBusCommand();
}
