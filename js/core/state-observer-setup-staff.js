// Staff-only section renderers for the state observer (§27 / Ch17).
// Kept off the driver entry graph so /driver.html does not preload dispatcher chunks.
import { registerSectionRenderer } from "./state-observer.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDispatcherShifts } from "../dispatcher/shifts.js";
import { renderGroupHub } from "../dispatcher/group-hub.js";

registerSectionRenderer("dispatcher-dashboard", renderDispatcherDashboard);
registerSectionRenderer("dispatcher-shifts", renderDispatcherShifts);
registerSectionRenderer("dispatcher-group-hub", renderGroupHub);
