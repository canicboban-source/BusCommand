// BusCommand ESM v9.5
import { saveState } from "../core/state.js";
import { persistUserSession } from "../auth/login-session.js";
import { showAppLayout } from "./shell.js";

function toggleRoleDirectly() {
    if (window.currentUser.role === "driver") {
        // Označi trenutnog vozača kao neaktivnog i resetuj proveru pre prelaska u dispečera
        const driver = window.state.drivers.find(d => d.name === window.currentUser.name);
        if (driver) {
            driver.active = false;
            driver.preTripDone = false;
            saveState();
        }
        sessionStorage.removeItem("buscommand_pretrip_done");
        window.currentUser.role = "dispatcher";
        window.currentUser.name = "disp_center";
        window.currentCalendarMonth = "2026-06"; // Resetuj kalendar na jun pri promeni uloge
    } else {
        window.currentUser.role = "driver";
        window.currentUser.name = window.state.drivers[0].name;
        window.currentUser.bus = window.state.drivers[0].bus || window.state.buses[0].number;
        window.currentUser.routeId = window.state.routes[0].id;
        window.currentUser.currentStopIndex = 0;
        
        // Označi ovog novog vozača kao aktivnog
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
