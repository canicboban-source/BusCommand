// BusCommand — driver surface section handlers
import { registerSectionHandlers } from "../layout/section-registry.js";
import { renderDriverCalendar, renderTomorrowShiftForDriver } from "../driver/calendar.js";
import { renderDriverDashboard } from "../driver/dashboard.js";
import { renderDriverMessages } from "../driver/messages-inbox.js";
import { renderDriverVacationHistory } from "../driver/reports.js";
import { registerRemoteRenderCallbacks } from "../core/remote-render-registry.js";

export function registerDriverSections() {
    registerRemoteRenderCallbacks({
        renderDriverDashboard,
        renderDriverMessages
    });
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
