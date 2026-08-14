/**
 * BusCommand — Driver PWA entry
 */
import { BusCommandConfig, USE_LOCAL_STATE, COMPANY_ID } from "./core/runtime-config.js";
import Auth from "./core/auth-client.js";
import ApiClient from "./core/api-client.js";
import "./core/store.js";
import { installDriverSurface } from "./install-driver.js";
import { registerOnclickHandlers } from "./register-onclick-driver.js";
import { bootstrapBusCommand } from "./bootstrap/init.js";
import { migrateLegacyStorage } from "./core/storage-keys.js";

window.__BUSCOMMAND_SURFACE__ = "driver";
window.BusCommandConfig = BusCommandConfig;
window.USE_LOCAL_STATE = USE_LOCAL_STATE;
window.COMPANY_ID = COMPANY_ID;
window.Auth = Auth;
window.ApiClient = ApiClient;

migrateLegacyStorage();
installDriverSurface();
registerOnclickHandlers();

function startBusCommand() {
    bootstrapBusCommand();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startBusCommand);
} else {
    startBusCommand();
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw-driver.js", { scope: "/driver.html" }).catch((err) => {
            console.warn("[PWA] SW register failed:", err.message);
        });
    });
}
