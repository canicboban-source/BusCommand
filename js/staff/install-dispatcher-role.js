/**
 * Dispatcher production role graph — side-effect module + idempotent install.
 * Loaded only after authenticated dispatcher role is confirmed.
 */
import "../features/print-calendar.js";
import "../dispatcher/dispatchers.js";
import "../core/export-csv.js";
import "../dispatcher/shift-utils.js";
import "../dispatcher/shift-grid.js";
import "../dispatcher/shifts.js";
import "../dispatcher/dashboard.js";
import "../dispatcher/quick-view.js";
import "../dispatcher/reports.js";
import "../dispatcher/lost-items.js";
import "../dispatcher/vacations.js";
import "../data/groups.js";
import "../data/drivers.js";
import "../data/buses-routes.js";
import "../data/bus-import.js";
import "../maps/helpers.js";
import "../maps/map-data.js";
import "../maps/live-map-core.js";
import "../maps/damage-photo.js";
import "../maps/route-stops.js";
import "../maps/schedule-parse.js";
import "../maps/schedule-upload.js";
import "../maps/schedule-viewer.js";
import "../maps/schedule-auto-detect.js";
import "../data/schedules.js";
import "../dispatcher/monthly-plans.js";
import "../dispatcher/daily-plan.js";
import "../dispatcher/group-hub.js";
import { registerDispatcherSections } from "../surface/register-dispatcher-sections.js";
import { registerDispatcherOnclickHandlers } from "../register-onclick-dispatcher.js";
import { installOperationsHealthConsistency } from "../dispatcher/operations-health-consistency.js";
import { registerSectionRenderer } from "../core/state-observer.js";
import { renderDispatcherDashboard } from "../dispatcher/dashboard.js";
import { renderDispatcherShifts } from "../dispatcher/shifts.js";
import { renderGroupHub } from "../dispatcher/group-hub.js";

let installed = false;

export function isInstalled() {
    return installed;
}

export function install() {
    if (installed) return;
    installed = true;
    registerDispatcherSections();
    registerDispatcherOnclickHandlers();
    installOperationsHealthConsistency();
    registerSectionRenderer("dispatcher-dashboard", renderDispatcherDashboard);
    registerSectionRenderer("dispatcher-shifts", renderDispatcherShifts);
    registerSectionRenderer("dispatcher-group-hub", renderGroupHub);
}

install();
