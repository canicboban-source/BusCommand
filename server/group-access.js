function normalizeGroupIds(groups) {
  if (!Array.isArray(groups)) return [];
  return [...new Set(groups.map((value) => String(value).trim()).filter(Boolean))].sort();
}

async function assertCompanyGroupsExist(companyRef, groupIds) {
  const snapshots = await Promise.all(groupIds.map((groupId) => companyRef.collection("groups").doc(groupId).get()));
  if (snapshots.some((snapshot) => !snapshot.exists)) {
    const error = new Error("Jedna ili više grupa ne postoje u ovoj firmi.");
    error.code = "group-not-found";
    throw error;
  }
}

module.exports = { normalizeGroupIds, assertCompanyGroupsExist };
