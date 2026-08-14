// BusCommand — driver surface section handlers
import { registerSectionHandlers } from "../layout/section-registry.js";
import { renderDriverCalendar, renderTomorrowShiftForDriver } from "../driver/calendar.js";
import { renderDriverDashboard } from "../driver/dashboard.js";
import { renderDriverVacationHistory } from "../driver/reports.js";

export function registerDriverSections() {
    registerSectionHandlers({
        "driver-dashboard": () => {
            renderDriverDashboard();
            renderTomorrowShiftForDriver();
        },
        "driver-calendar": () => {
            renderDriverCalendar();
        },
        "driver-reports": () => {},
        "driver-vacation": () => {
            renderDriverVacationHistory();
        }
    });
}
