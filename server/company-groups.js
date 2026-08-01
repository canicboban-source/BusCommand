"use strict";

function normalizeCompanyGroupId(value) {
  const groupId = String(value || "").trim();
  if (!/^\d{1,6}$/.test(groupId)) {
    const error = new Error("ID linije mora imati od 1 do 6 cifara.");
    error.code = "invalid-group";
    throw error;
  }
  return groupId;
}

async function queryHasDocument(collection, field, operator, value) {
  const snapshot = await collection.where(field, operator, value).limit(1).get();
  return !snapshot.empty;
}

async function findCompanyGroupReferences(companyRef, groupId) {
  const id = normalizeCompanyGroupId(groupId);
  const checks = [
    ["drivers", "drivers", "groupId", "=="],
    ["drivers", "drivers", "lineId", "=="],
    ["buses", "buses", "groupId", "=="],
    ["buses", "buses", "lineId", "=="],
    ["dispatchers", "users", "groups", "array-contains"],
    ["plans", "service_plans", "groupId", "=="],
    ["shifts", "shifts", "groupId", "=="],
    ["shifts", "shifts", "lineId", "=="],
    ["schedules", "schedules", "groupId", "=="],
    ["schedules", "schedules", "lineId", "=="],
    ["routes", "routes", "groupId", "=="],
    ["routes", "routes", "lineId", "=="]
  ];
  const found = await Promise.all(checks.map(async ([key, collectionName, field, operator]) => ({
    key,
    exists: await queryHasDocument(companyRef.collection(collectionName), field, operator, id)
  })));
  return [...new Set(found.filter(item => item.exists).map(item => item.key))];
}

module.exports = { findCompanyGroupReferences, normalizeCompanyGroupId };
