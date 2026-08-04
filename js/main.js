/**
 * BusCommand — legacy combined entry (prefer /driver.html or /staff.html)
 * Kept for local smoke; production should use surface HTML files.
 */
import { BusCommandConfig, IS_DEMO_MODE, COMPANY_ID } from "./core/runtime-config.js";
import Auth from "./core/auth-client.js";
import ApiClient from "./core/api-client.js";
import "./core/store.js";
import { installStaffSurface } from "./install-staff.js";
import { registerDriverSections } from "./surface/register-driver-sections.js";
import { registerOnclickHandlers } from "./register-onclick.js";
import { bootstrapBusCommand } from "./bootstrap/init.js";
import { migrateLegacyStorage } from "./core/storage-keys.js";
import "./core/state-observer-setup-staff.js";

window.__BUSCOMMAND_SURFACE__ = window.__BUSCOMMAND_SURFACE__ || "staff";
window.BusCommandConfig = BusCommandConfig;
window.IS_DEMO_MODE = IS_DEMO_MODE;
window.COMPANY_ID = COMPANY_ID;
window.Auth = Auth;
window.ApiClient = ApiClient;

migrateLegacyStorage();
installStaffSurface();
registerDriverSections();
registerOnclickHandlers();

function startBusCommand() {
    bootstrapBusCommand();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startBusCommand);
} else {
    startBusCommand();
}
