// BusCommand ESM v9.5
import { canWriteOperationalRoster, normalizeUiRole } from "./ui-permissions.js";

function isReadOnly() {
    return window.currentUser && window.currentUser.impersonated === true && window.currentUser.readOnly === true;
}

/** CA (and stealth inspect) must not mutate roster/buses/ops. */
function isOperationalReadOnly() {
    if (isReadOnly()) return true;
    const role = window.currentUser?.role;
    if (!role) return true;
    return !canWriteOperationalRoster(role);
}

// ── ROLE NORMALIZACIJA (Firebase claims → app roles) ───────
function normalizeRole(role) {
    return normalizeUiRole(role);
}
export {
    isReadOnly,
    isOperationalReadOnly,
    normalizeRole
};
