const crypto = require("crypto");
const { assertCompanyGroupsExist } = require("./group-access");

const contractPromise = import("../shared/service-plan-contract.mjs");

function normalizeServicePlanGroupId(groupId) {
  const value = String(groupId || "").trim();
  if (!value || value.length > 120 || value.includes("/") || value === "." || value === "..") {
    const error = new Error("Izaberite važeću grupu za vozni plan.");
    error.code = "invalid-group";
    throw error;
  }
  return value;
}

function servicePlanId(groupId, plan) {
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const base = `${normalizedGroupId}-${plan.planCode}-${plan.planVersion}-${plan.validFrom}`
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return base || crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex").slice(0, 24);
}

function normalizeServicePlanId(planId) {
  const value = String(planId || "").trim();
  if (!value || value.length > 120 || !/^[a-z0-9_-]+$/i.test(value)) {
    const error = new Error("Nevažeća verzija voznog plana.");
    error.code = "invalid-plan-id";
    throw error;
  }
  return value;
}

function timestampToIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value === "string") return value;
  const seconds = Number(value.seconds ?? value._seconds);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000).toISOString();
  return null;
}

function serializeDuty(duty, revisionId) {
  return {
    ...duty,
    revisionId,
    activityCount: duty.activities.length
  };
}

async function validatePlanPayload(plan) {
  const { validateServicePlan } = await contractPromise;
  return validateServicePlan(plan);
}

async function previewServicePlan(plan) {
  return validatePlanPayload(plan);
}

async function publishServicePlan({ db, admin, companyId, groupId, actorId, plan }) {
  const validation = await validatePlanPayload(plan);
  if (!validation.valid) {
    const error = new Error("Vozni plan nije validan.");
    error.code = "validation-failed";
    error.details = validation.errors;
    throw error;
  }

  const normalized = validation.plan;
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const companyRef = db.collection("companies").doc(companyId);
  await assertCompanyGroupsExist(companyRef, [normalizedGroupId]);
  const planId = servicePlanId(normalizedGroupId, normalized);
  const plansRef = companyRef.collection("service_plans");
  const planRef = plansRef.doc(planId);
  const existingPlan = await planRef.get();
  if (existingPlan.exists) {
    const error = new Error("Ova verzija plana je već objavljena. Uvezite novu verziju umesto prepisivanja istorije.");
    error.code = "version-exists";
    throw error;
  }
  const activeSnapshot = await plansRef.where("status", "==", "active").get();
  const batch = db.batch();
  const revisionId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  activeSnapshot.docs.forEach(doc => {
    const current = doc.data();
    if (doc.id !== planId && current.groupId === normalizedGroupId) {
      batch.set(doc.ref, {
        status: "superseded",
        supersededAt: timestamp,
        supersededBy: planId
      }, { merge: true });
    }
  });

  batch.set(planRef, {
    id: planId,
    groupId: normalizedGroupId,
    templateVersion: normalized.templateVersion,
    planCode: normalized.planCode,
    planVersion: normalized.planVersion,
    validFrom: normalized.validFrom,
    timezone: normalized.timezone,
    status: "active",
    revisionId,
    dutyCount: validation.summary.dutyCount,
    activityCount: validation.summary.activityCount,
    overnightDutyCount: validation.summary.overnightDutyCount,
    publishedAt: timestamp,
    publishedBy: actorId
  }, { merge: true });

  normalized.duties.forEach(duty => {
    batch.set(
      planRef.collection("duties").doc(encodeURIComponent(duty.code)),
      serializeDuty(duty, revisionId)
    );
  });

  await batch.commit();
  return {
    planId,
    revisionId,
    plan: { ...normalized, groupId: normalizedGroupId },
    summary: validation.summary
  };
}

async function getActiveServicePlan({ db, companyId, groupId }) {
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const plansRef = db.collection("companies").doc(companyId).collection("service_plans");
  const snapshot = await plansRef.where("status", "==", "active").get();
  const candidates = snapshot.docs
    .map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter(plan => plan.groupId === normalizedGroupId)
    .sort((a, b) => String(b.validFrom).localeCompare(String(a.validFrom)));
  const metadata = candidates[0];
  if (!metadata) return null;

  const dutiesSnapshot = await metadata.ref.collection("duties")
    .where("revisionId", "==", metadata.revisionId)
    .get();
  const duties = dutiesSnapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  const plainMetadata = { ...metadata };
  delete plainMetadata.ref;
  return { ...plainMetadata, duties };
}

async function listServicePlanHistory({ db, companyId, groupId, limit = 25 }) {
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const boundedLimit = Math.max(1, Math.min(50, Number(limit) || 25));
  const snapshot = await db.collection("companies").doc(companyId).collection("service_plans")
    .where("groupId", "==", normalizedGroupId).get();
  return snapshot.docs
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        groupId: data.groupId,
        planCode: data.planCode,
        planVersion: data.planVersion,
        validFrom: data.validFrom,
        timezone: data.timezone,
        status: data.status,
        revisionId: data.revisionId,
        dutyCount: data.dutyCount,
        activityCount: data.activityCount,
        overnightDutyCount: data.overnightDutyCount,
        publishedAt: timestampToIso(data.publishedAt),
        publishedBy: data.publishedBy || null,
        supersededAt: timestampToIso(data.supersededAt),
        supersededBy: data.supersededBy || null
      };
    })
    .sort((left, right) => String(right.publishedAt || right.validFrom).localeCompare(String(left.publishedAt || left.validFrom)))
    .slice(0, boundedLimit);
}

async function getServicePlanVersion({ db, companyId, groupId, planId }) {
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const normalizedPlanId = normalizeServicePlanId(planId);
  const planRef = db.collection("companies").doc(companyId).collection("service_plans").doc(normalizedPlanId);
  const snapshot = await planRef.get();
  if (!snapshot.exists || snapshot.data().groupId !== normalizedGroupId) return null;
  const metadata = snapshot.data();
  const dutiesSnapshot = await planRef.collection("duties").where("revisionId", "==", metadata.revisionId).get();
  const duties = dutiesSnapshot.docs
    .map(doc => ({ ...doc.data(), id: doc.id }))
    .sort((left, right) => left.code.localeCompare(right.code, undefined, { numeric: true }));
  return {
    id: normalizedPlanId,
    ...metadata,
    publishedAt: timestampToIso(metadata.publishedAt),
    supersededAt: timestampToIso(metadata.supersededAt),
    duties
  };
}

module.exports = {
  getActiveServicePlan,
  getServicePlanVersion,
  listServicePlanHistory,
  normalizeServicePlanGroupId,
  normalizeServicePlanId,
  previewServicePlan,
  publishServicePlan,
  servicePlanId,
  validatePlanPayload
};
