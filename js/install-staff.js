// BusCommand — staff desktop surface module graph (login + shared shell only)
import { installSharedSurface } from "./install-shared.js";
import "./auth/superadmin.js";
import "./auth/login-dispatcher.js";
import "./layout/role-switch.js";
import "./admin/dispatcher-setup.js";

/**
 * Initial Staff graph: login, session boot, shared shell, role determination.
 * CA / Dispatcher production modules load via ensureStaffRoleGraph after auth.
 */
export function installStaffSurface() {
    installSharedSurface();
}
