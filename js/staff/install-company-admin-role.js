/**
 * Company Admin production role graph — side-effect module + idempotent install.
 * Loaded only after authenticated company-admin role is confirmed.
 */
import "../admin/company-admin-settings.js";
import "../data/groups.js";
import "../data/drivers.js";
import "../data/buses-routes.js";
import "../data/bus-import.js";
import "../admin/company-admin.js";
import "../imports/package-import.js";
import "../features/onboarding.js";
import "../core/export-csv.js";
import { registerCompanyAdminSections } from "../surface/register-company-admin-sections.js";
import { registerCompanyAdminOnclickHandlers } from "../register-onclick-company-admin.js";

let installed = false;

export function isInstalled() {
    return installed;
}

export function install() {
    if (installed) return;
    installed = true;
    registerCompanyAdminSections();
    registerCompanyAdminOnclickHandlers();
}

install();
