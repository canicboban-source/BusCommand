/**
 * Operational line knowledge for drivers (not credentials).
 * Primary home group is always included in the effective set.
 */

function normalizeKnownGroupIds(driver, primaryGroupId = "") {
    const primary = String(primaryGroupId || driver?.groupId || driver?.lineId || "").trim();
    const raw = Array.isArray(driver?.knownGroupIds) ? driver.knownGroupIds : [];
    const ids = [];
    for (const value of raw) {
        const id = String(value || "").trim();
        if (!id || id === primary || ids.includes(id)) continue;
        ids.push(id);
    }
    if (primary) ids.unshift(primary);
    return ids;
}

function driverKnowsGroup(driver, groupId) {
    const target = String(groupId || "").trim();
    if (!target) return false;
    return normalizeKnownGroupIds(driver).includes(target);
}

function readKnownGroupIdsFromDom(container) {
    if (!container) return [];
    return [...container.querySelectorAll('input[type="checkbox"][data-known-group]:checked')]
        .map((input) => String(input.value || "").trim())
        .filter(Boolean);
}

export {
    normalizeKnownGroupIds,
    driverKnowsGroup,
    readKnownGroupIdsFromDom
};
