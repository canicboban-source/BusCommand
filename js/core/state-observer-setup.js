// Registracija posmatranih sekcija za state observer (stavka 11)
import { registerSectionRenderer } from "./state-observer.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDispatcherShifts } from "../dispatcher/shifts.js";
import { renderGroupHub } from "../dispatcher/group-hub.js";

registerSectionRenderer("dispatcher-dashboard", renderDispatcherDashboard);
registerSectionRenderer("dispatcher-shifts", renderDispatcherShifts);
registerSectionRenderer("dispatcher-group-hub", renderGroupHub);
