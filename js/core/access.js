// BusCommand ESM v9.5

function isReadOnly() {
    return window.currentUser && window.currentUser.impersonated === true && window.currentUser.readOnly === true;
}

// ── ROLE NORMALIZACIJA (Firebase claims → app roles) ───────
function normalizeRole(role) {
    if (role === "company_admin") return "company-admin";
    return role;
}
export {
    isReadOnly,
    normalizeRole
};
