// BusCommand — staff desktop surface module graph
import { installSharedSurface } from "./install-shared.js";
import "./features/print-calendar.js";
import "./features/onboarding.js";
import "./dispatcher/dispatchers.js";
import "./core/export-csv.js";
import "./auth/superadmin.js";
import "./auth/login-dispatcher.js";
import "./layout/role-switch.js";
import "./dispatcher/shift-utils.js";
import "./dispatcher/shift-grid.js";
import "./dispatcher/shifts.js";
import "./dispatcher/msg-compose.js";
import "./dispatcher/dashboard.js";
import "./dispatcher/sent-messages.js";
import "./dispatcher/quick-view.js";
import "./dispatcher/reports.js";
import "./dispatcher/lost-items.js";
import "./dispatcher/vacations.js";
import "./admin/company-admin-settings.js";
import "./data/groups.js";
import "./data/drivers.js";
import "./data/buses-routes.js";
import "./data/bus-import.js";
import "./maps/helpers.js";
import "./maps/map-data.js";
import "./maps/live-map-core.js";
import "./maps/damage-photo.js";
import "./maps/route-stops.js";
import "./maps/schedule-parse.js";
import "./maps/schedule-upload.js";
import "./maps/schedule-viewer.js";
import "./maps/schedule-auto-detect.js";
import "./admin/superadmin.js";
import "./admin/company-admin-onboarding.js";
import "./admin/company-admin.js";
import "./admin/dispatcher-setup.js";
import "./data/schedules.js";
import "./dispatcher/monthly-plans.js";
import "./dispatcher/daily-plan.js";
import "./dispatcher/group-hub.js";
import "./imports/package-import.js";
import "./core/firestore-sync.js";
import { registerStaffSections } from "./surface/register-staff-sections.js";

export function installStaffSurface() {
    installSharedSurface();
    registerStaffSections();
}
