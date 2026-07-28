// BusCommand — resolve tenant for driver login (bootstrap only; never post-auth authority)
import { COMPANY_ID, IS_DEMO_MODE } from "../core/runtime-config.js";
import { STORAGE } from "../core/storage-keys.js";

const COMPANY_ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function normalizeCompanyId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized || normalized === "buscommand-preview") return null;
    if (!COMPANY_ID_RE.test(normalized)) return null;
    return normalized;
}

function readRememberedDriverCompany() {
    try {
        return normalizeCompanyId(localStorage.getItem(STORAGE.LAST_DRIVER_COMPANY));
    } catch {
        return null;
    }
}

function rememberDriverCompany(companyId) {
    const normalized = normalizeCompanyId(companyId);
    if (!normalized) return false;
    try {
        localStorage.setItem(STORAGE.LAST_DRIVER_COMPANY, normalized);
        return true;
    } catch {
        return false;
    }
}

/**
 * Login bootstrap only: typed field → URL ?company= → last successful company on this device.
 * Must not be used for authenticated API/state (claims / currentUser.companyId win after login).
 */
function resolveDriverLoginCompanyId(explicitValue) {
    if (IS_DEMO_MODE) return "demo";
    return normalizeCompanyId(explicitValue)
        || normalizeCompanyId(COMPANY_ID)
        || readRememberedDriverCompany();
}

function driverPortalUrl(companyId) {
    const normalized = normalizeCompanyId(companyId);
    if (!normalized) return "/driver.html";
    return `/driver.html?company=${encodeURIComponent(normalized)}`;
}

export {
    COMPANY_ID_RE,
    normalizeCompanyId,
    readRememberedDriverCompany,
    rememberDriverCompany,
    resolveDriverLoginCompanyId,
    driverPortalUrl
};
