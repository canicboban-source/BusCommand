/**

 * BusCommand — Vite ulazna tačka (ES module v9.5)

 */

// css/design-tokens.css + style.css se učitavaju preko <link> tagova u index.html

import { BusCommandConfig, IS_DEMO_MODE, COMPANY_ID } from "./core/runtime-config.js";

import Auth from "./core/auth-client.js";

import ApiClient from "./core/api-client.js";

import "./core/store.js";

import { installBusCommand } from "./install.js";

import { registerOnclickHandlers } from "./register-onclick.js";

import { bootstrapBusCommand } from "./bootstrap/init.js";
import { migrateLegacyStorage } from "./core/storage-keys.js";
import "./core/state-observer-setup.js";



window.BusCommandConfig = BusCommandConfig;

window.IS_DEMO_MODE = IS_DEMO_MODE;

window.COMPANY_ID = COMPANY_ID;

window.Auth = Auth;

window.ApiClient = ApiClient;



migrateLegacyStorage();

installBusCommand();

registerOnclickHandlers();



function startBusCommand() {

    bootstrapBusCommand();

}



if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", startBusCommand);

} else {

    startBusCommand();

}

