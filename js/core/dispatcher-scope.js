function normalizeGroupIds(groups) {
    if (!Array.isArray(groups)) return [];
    return [...new Set(groups.map(value => String(value).trim()).filter(Boolean))].sort();
}

function resolveDispatcherGroupIds({ profileExists, profileGroups, claimGroups }) {
    return profileExists ? normalizeGroupIds(profileGroups) : normalizeGroupIds(claimGroups);
}

function filterAssignedGroups(groups, assignedIds, companyId) {
    const allowed = new Set(normalizeGroupIds(assignedIds));
    return (groups || []).filter(group =>
        allowed.has(String(group.id)) && group.companyId === companyId
    );
}

/**
 * Defense-in-depth: drop active/hub IDs that are not in the assigned set.
 * Returns the sanitized IDs plus whether anything was rejected.
 */
function sanitizeDispatcherActiveGroups({ assignedIds, activeGroupId = null, activeGroupHubId = null }) {
    const assigned = normalizeGroupIds(assignedIds);
    const allowed = new Set(assigned);
    const fallback = assigned[0] || null;
    const active = String(activeGroupId || "").trim();
    const hub = String(activeGroupHubId || "").trim();
    const activeOk = Boolean(active && allowed.has(active));
    const hubOk = Boolean(hub && allowed.has(hub));
    return {
        assignedIds: assigned,
        activeGroupId: activeOk ? active : fallback,
        activeGroupHubId: hubOk ? hub : (activeOk ? active : fallback),
        rejected: Boolean((active && !activeOk) || (hub && !hubOk)),
        fallback
    };
}

function isDispatcherAssignedGroupId(assignedIds, groupId) {
    const id = String(groupId || "").trim();
    if (!id) return false;
    return normalizeGroupIds(assignedIds).includes(id);
}

export {
    normalizeGroupIds,
    resolveDispatcherGroupIds,
    filterAssignedGroups,
    sanitizeDispatcherActiveGroups,
    isDispatcherAssignedGroupId
};
