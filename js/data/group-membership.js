// BusCommand — pripadnost vozača liniji / grupi (310 + G1/G2/G3)
import { getGroupById } from "./groups.js";
import { getVisibleDrivers } from "../core/utils.js";
import { busHasGroup, normalizeGroupIds } from "./bus-group-membership.js";
import { driverKnowsGroup, normalizeKnownGroupIds } from "./driver-known-groups.js";

/**
 * Local roster membership helper (home / line / known lines).
 * Not a security boundary — Firestore Rules + server projection decide Dispo reads.
 */
function driverBelongsToLine(driver, lineOrGroupId) {
    if (!driver || !lineOrGroupId) return true;

    const target = String(lineOrGroupId);
    if (String(driver.groupId || "") === target) return true;
    if (String(driver.lineId || "") === target) return true;
    if (driverKnowsGroup(driver, target)) return true;

    const known = normalizeKnownGroupIds(driver);
    for (const gid of known) {
        const knownGroup = getGroupById(gid);
        if (!knownGroup) continue;
        if (String(knownGroup.lineId || "") === target) return true;
        if (String(knownGroup.id) === target) return true;
    }

    const lineGroup = getGroupById(lineOrGroupId);
    if (lineGroup && String(driver.groupId || "") === String(lineGroup.name || "")) return true;

    const driverGroup = getGroupById(driver.groupId);
    if (driverGroup) {
        if (String(driverGroup.lineId || "") === target) return true;
        if (String(driverGroup.id) === target) return true;
        if (lineGroup && String(driverGroup.name || "") === String(lineGroup.name || "")) return true;
    }

    return false;
}

function getDriversForLineGroup(lineOrGroupId) {
    if (!lineOrGroupId) return getVisibleDrivers();
    return getVisibleDrivers().filter(d => driverBelongsToLine(d, lineOrGroupId));
}

function assignDriverToLine(driver, lineId, subGroupName = "") {
    if (!driver || !lineId) return driver;
    driver.lineId = lineId;

    if (subGroupName) {
        driver.subGroup = subGroupName;
        const sub = (window.state.groups || []).find(
            g => g.lineId === lineId && g.name.toLowerCase() === String(subGroupName).toLowerCase()
        );
        if (sub) driver.groupId = sub.id;
        else driver.groupId = lineId;
    } else if (!driver.groupId || driver.groupId === "") {
        driver.groupId = lineId;
    }

    return driver;
}

/**
 * Soft-remove: clear line/group membership for a driver.
 * Does not deactivate or delete the company roster profile.
 */
function clearDriverLineMembership(driver) {
    if (!driver) return driver;
    driver.groupId = "";
    driver.lineId = "";
    driver.subGroup = "";
    if (Array.isArray(driver.groupIds)) driver.groupIds = [];
    if (Array.isArray(driver.knownGroupIds)) driver.knownGroupIds = [];
    return driver;
}

/** Group ids that count as “this line” for detach (line + subgroups). */
function lineDetachGroupIds(lineOrGroupId) {
    const root = String(lineOrGroupId || "").trim();
    const ids = new Set();
    if (!root) return ids;
    ids.add(root);
    for (const g of (window.state.groups || [])) {
        if (!g) continue;
        if (String(g.id) === root || String(g.lineId) === root) {
            ids.add(String(g.id));
        }
    }
    return ids;
}

function countDriversForLineGroup(lineOrGroupId) {
    return getDriversForLineGroup(lineOrGroupId).length;
}

function countPlansForLineGroup(lineOrGroupId) {
    const names = new Set(getDriversForLineGroup(lineOrGroupId).map(d => d.name));
    return (window.state.schedules || []).filter(s => s.parsedShifts && names.has(s.driverName)).length;
}

function busBelongsToLine(bus, lineOrGroupId) {
    if (!bus || !lineOrGroupId) return true;
    if (busHasGroup(bus, lineOrGroupId)) return true;

    const lineGroup = getGroupById(lineOrGroupId);
    if (lineGroup) {
        if (busHasGroup(bus, lineGroup.name) || busHasGroup(bus, lineGroup.id)) return true;
    }

    for (const gid of normalizeGroupIds(bus)) {
        const busGroup = getGroupById(gid);
        if (busGroup) {
            if (busGroup.lineId === lineOrGroupId) return true;
            if (busGroup.id === lineOrGroupId) return true;
            if (lineGroup && busGroup.name === lineGroup.name) return true;
        }
    }

    return false;
}

function getBusesForLineGroup(lineOrGroupId) {
    if (!lineOrGroupId) return window.state.buses || [];
    return (window.state.buses || []).filter(b => busBelongsToLine(b, lineOrGroupId));
}

function countBusesForLineGroup(lineOrGroupId) {
    return getBusesForLineGroup(lineOrGroupId).length;
}

function getSubgroupsForLine(lineId) {
    if (!lineId) return [];
    return (window.state.groups || []).filter(
        g => g.id !== lineId && (g.lineId === lineId || g.id.startsWith(`grp-`))
    ).filter(g => {
        if (g.lineId === lineId) return true;
        return (window.state.drivers || []).some(d =>
            d.groupId === g.id && (d.lineId === lineId || driverBelongsToLine(d, lineId))
        );
    });
}

export {
    driverBelongsToLine,
    busBelongsToLine,
    getDriversForLineGroup,
    getBusesForLineGroup,
    getSubgroupsForLine,
    assignDriverToLine,
    clearDriverLineMembership,
    lineDetachGroupIds,
    countDriversForLineGroup,
    countPlansForLineGroup,
    countBusesForLineGroup
};
