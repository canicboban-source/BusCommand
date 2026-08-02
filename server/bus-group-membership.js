/**
 * Company fleet pool — one bus number per company, membership in many groups.
 * Keep in sync with js/data/bus-group-membership.js (ESM mirror for browser).
 */
function normalizeGroupIds(bus) {
  const ids = [];
  const push = (raw) => {
    const s = String(raw || "").trim();
    if (s && !ids.includes(s)) ids.push(s);
  };
  if (Array.isArray(bus?.groupIds)) {
    for (const g of bus.groupIds) push(g);
  }
  push(bus?.groupId);
  push(bus?.lineId);
  return ids;
}

function busHasGroup(bus, groupId) {
  if (!groupId) return true;
  return normalizeGroupIds(bus).includes(String(groupId));
}

function withAttachedGroup(bus, groupId) {
  const gid = String(groupId || "").trim();
  const groupIds = normalizeGroupIds(bus);
  if (gid && !groupIds.includes(gid)) groupIds.push(gid);
  const primary = groupIds[0] || gid;
  return {
    ...bus,
    groupIds,
    groupId: bus?.groupId || primary,
    lineId: bus?.lineId || primary
  };
}

function buildNewBusGroups(groupId) {
  const gid = String(groupId || "").trim();
  return {
    groupIds: gid ? [gid] : [],
    groupId: gid || null,
    lineId: gid || null
  };
}

module.exports = {
  normalizeGroupIds,
  busHasGroup,
  withAttachedGroup,
  buildNewBusGroups
};
