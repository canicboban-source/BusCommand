const DEFAULT_GROUP_COLOR = "#0EA5E9";

function groupItemBelongsToCompany(item, companyId, isDemoMode = false) {
    if (!item || !companyId) return false;
    return item.companyId === companyId || (isDemoMode && !item.companyId);
}

function groupRecordMatches(record, groupId) {
    const id = String(groupId);
    return String(record?.groupId || "") === id || String(record?.lineId || "") === id;
}

function getCompanyGroupsScope(state, currentUser, isDemoMode = false) {
    const companyId = currentUser?.companyId || null;
    const belongs = item => groupItemBelongsToCompany(item, companyId, isDemoMode);
    const groups = (state?.groups || []).filter(belongs);
    const groupIds = new Set(groups.map(group => String(group.id)));
    const scoped = list => (list || []).filter(belongs);
    return {
        companyId,
        groups,
        drivers: scoped(state?.drivers),
        buses: scoped(state?.buses),
        dispatchers: scoped(state?.dispatchers).filter(item => item.id !== "superadmin" && !item.isSuperAdmin),
        shifts: scoped(state?.shifts),
        schedules: scoped(state?.schedules),
        routes: scoped(state?.routes),
        servicePlans: (state?.servicePlans || []).filter(plan =>
            groupIds.has(String(plan.groupId)) && (!plan.companyId || plan.companyId === companyId)
        )
    };
}

function safeGroupColor(value) {
    const color = String(value || "").trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_GROUP_COLOR;
}

function validateCompanyGroupDraft(input = {}) {
    const id = String(input.id || "").trim();
    const name = String(input.name || "").trim();
    const description = String(input.description || "").trim();
    const color = String(input.color || "").trim().toUpperCase();
    const errors = {};
    if (!/^\d{1,6}$/.test(id)) errors.id = "id_invalid";
    if (name.length < 2) errors.name = "name_short";
    else if (name.length > 80) errors.name = "name_long";
    if (description.length > 200) errors.description = "description_long";
    if (!/^#[0-9A-F]{6}$/.test(color)) errors.color = "color_invalid";
    return {
        valid: Object.keys(errors).length === 0,
        errors,
        value: { id, lineId: id, name, description, color: safeGroupColor(color), active: true }
    };
}

function getCompanyGroupDependencies(groupId, scope) {
    const id = String(groupId);
    const dispatcherReferences = scope.dispatchers.filter(item => (item.groups || []).map(String).includes(id));
    const counts = {
        drivers: scope.drivers.filter(item => groupRecordMatches(item, id)).length,
        buses: scope.buses.filter(item => groupRecordMatches(item, id)).length,
        dispatchers: dispatcherReferences.filter(item => item.active !== false).length,
        plans: scope.servicePlans.filter(item => String(item.groupId) === id).length,
        shifts: scope.shifts.filter(item => groupRecordMatches(item, id)).length,
        schedules: scope.schedules.filter(item => groupRecordMatches(item, id)).length,
        routes: scope.routes.filter(item => groupRecordMatches(item, id)).length
    };
    const references = Object.entries(counts).filter(([, count]) => count > 0).map(([key]) => key);
    if (dispatcherReferences.length > 0 && !references.includes("dispatchers")) references.push("dispatchers");
    return { counts, references, canDelete: references.length === 0 };
}

function groupReadiness(dependencies) {
    const missing = [];
    if (dependencies.counts.drivers === 0) missing.push("drivers");
    if (dependencies.counts.buses === 0) missing.push("buses");
    if (dependencies.counts.plans === 0) missing.push("plans");
    if (dependencies.counts.dispatchers === 0) missing.push("dispatchers");
    return { ready: missing.length === 0, missing };
}

function sortCompanyGroups(groups = []) {
    return [...groups].sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
}

function filterCompanyGroups(groups = [], query = "", status = "all", scope) {
    const needle = String(query || "").trim().toLowerCase();
    return sortCompanyGroups(groups).filter(group => {
        const deps = getCompanyGroupDependencies(group.id, scope);
        const readiness = groupReadiness(deps);
        if (status === "ready" && !readiness.ready) return false;
        if (status === "incomplete" && readiness.ready) return false;
        if (!needle) return true;
        return `${group.id} ${group.name || ""} ${group.description || ""}`.toLowerCase().includes(needle);
    });
}

export {
    DEFAULT_GROUP_COLOR,
    filterCompanyGroups,
    getCompanyGroupDependencies,
    getCompanyGroupsScope,
    groupItemBelongsToCompany,
    groupReadiness,
    safeGroupColor,
    sortCompanyGroups,
    validateCompanyGroupDraft
};
