// BusCommand — which browser surface is running (driver PWA vs staff desktop)
const SURFACES = new Set(["driver", "staff"]);

function readSurfaceFromDom() {
    const raw = document.documentElement?.dataset?.appSurface
        || document.body?.dataset?.appSurface
        || "";
    return String(raw).trim().toLowerCase();
}

function readSurfaceFromPath() {
    const path = String(window.location?.pathname || "").toLowerCase();
    if (path.includes("driver")) return "driver";
    if (path.includes("staff")) return "staff";
    return "";
}

/** @returns {"driver"|"staff"} */
export function getAppSurface() {
    if (typeof window !== "undefined" && window.__BUSCOMMAND_SURFACE__) {
        const forced = String(window.__BUSCOMMAND_SURFACE__).toLowerCase();
        if (SURFACES.has(forced)) return forced;
    }
    const fromDom = readSurfaceFromDom();
    if (SURFACES.has(fromDom)) return fromDom;
    const fromPath = readSurfaceFromPath();
    if (SURFACES.has(fromPath)) return fromPath;
    return "staff";
}

export function isDriverSurface() {
    return getAppSurface() === "driver";
}

export function isStaffSurface() {
    return getAppSurface() === "staff";
}

export function normalizeSurfaceRole(role) {
    if (role === "company_admin") return "company-admin";
    return role;
}

/** Staff surfaces accept only dispatcher / company-admin / superadmin. */
export function isStaffRole(role) {
    const normalized = normalizeSurfaceRole(role);
    return normalized === "dispatcher"
        || normalized === "company-admin"
        || normalized === "superadmin";
}

export function assertSurfaceRole(role) {
    const surface = getAppSurface();
    const normalized = normalizeSurfaceRole(role);
    if (!normalized) return false;
    if (surface === "driver") return normalized === "driver";
    return isStaffRole(normalized);
}
