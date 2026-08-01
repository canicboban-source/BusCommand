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

export { normalizeGroupIds, resolveDispatcherGroupIds, filterAssignedGroups };
