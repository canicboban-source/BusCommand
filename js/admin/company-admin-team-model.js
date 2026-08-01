const DISPATCHER_NAME_MIN = 2;
const DISPATCHER_NAME_MAX = 80;
const DISPATCHER_PASSWORD_MIN = 6;
const DISPATCHER_PASSWORD_MAX = 128;

function teamItemBelongsToCompany(item, companyId, isDemoMode = false) {
    if (!item || !companyId) return false;
    return item.companyId === companyId || (isDemoMode && !item.companyId);
}

function getCompanyTeamScope(state, currentUser, isDemoMode = false) {
    const companyId = currentUser?.companyId || null;
    const belongs = item => teamItemBelongsToCompany(item, companyId, isDemoMode);
    const groups = (state?.groups || []).filter(belongs);
    const dispatchers = (state?.dispatchers || []).filter(item =>
        belongs(item) && item.id !== "superadmin" && !item.isSuperAdmin && item.role !== "company_admin"
    );
    return { companyId, groups, dispatchers };
}

function normalizeDispatcherGroups(groups = [], allowedGroups = []) {
    const allowed = new Set(allowedGroups.map(group => String(group.id)));
    return [...new Set(groups.map(value => String(value).trim()).filter(value => allowed.has(value)))]
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
}

function validateCompanyDispatcherDraft(input = {}, allowedGroups = []) {
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const password = String(input.password || "");
    const groups = normalizeDispatcherGroups(input.groups || [], allowedGroups);
    const errors = {};

    if (name.length < DISPATCHER_NAME_MIN) errors.name = "name_short";
    else if (name.length > DISPATCHER_NAME_MAX) errors.name = "name_long";

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "email_invalid";

    if (password.length < DISPATCHER_PASSWORD_MIN) errors.password = "password_short";
    else if (password.length > DISPATCHER_PASSWORD_MAX) errors.password = "password_long";
    else if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = "password_weak";

    if (groups.length === 0) errors.groups = "groups_required";

    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { name, email, password, groups }
    };
}

function dispatcherReadiness(dispatcher, allowedGroups = []) {
    const assigned = normalizeDispatcherGroups(dispatcher?.groups || [], allowedGroups);
    const active = dispatcher?.active !== false;
    return {
        active,
        assigned,
        ready: active && assigned.length > 0,
        missingGroups: assigned.length === 0
    };
}

function sortCompanyDispatchers(dispatchers = []) {
    return [...dispatchers].sort((left, right) =>
        String(left.name || left.email || left.id).localeCompare(String(right.name || right.email || right.id), undefined, { sensitivity: "base" })
    );
}

function filterCompanyDispatchers(dispatchers = [], query = "", status = "all") {
    const needle = String(query || "").trim().toLowerCase();
    return sortCompanyDispatchers(dispatchers).filter(dispatcher => {
        const active = dispatcher.active !== false;
        if (status === "active" && !active) return false;
        if (status === "inactive" && active) return false;
        if (!needle) return true;
        return `${dispatcher.name || ""} ${dispatcher.email || ""}`.toLowerCase().includes(needle);
    });
}

export {
    DISPATCHER_NAME_MAX,
    DISPATCHER_NAME_MIN,
    DISPATCHER_PASSWORD_MAX,
    DISPATCHER_PASSWORD_MIN,
    dispatcherReadiness,
    filterCompanyDispatchers,
    getCompanyTeamScope,
    normalizeDispatcherGroups,
    sortCompanyDispatchers,
    teamItemBelongsToCompany,
    validateCompanyDispatcherDraft
};
