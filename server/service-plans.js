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

function sourceHashForPlan(plan) {
  return crypto.createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

function normalizeSourceMeta(source = {}) {
  const fileName = String(source.fileName || "").trim().slice(0, 255) || null;
  const contentType = String(source.contentType || "").trim().slice(0, 120) || null;
  const byteSize = Number(source.byteSize);
  return {
    fileName,
    contentType,
    byteSize: Number.isFinite(byteSize) && byteSize >= 0 && byteSize <= 20 * 1024 * 1024
      ? Math.floor(byteSize)
      : null
  };
}

async function validatePlanPayload(plan) {
  const { validateServicePlan } = await contractPromise;
  return validateServicePlan(plan);
}

async function previewServicePlan(plan) {
  return validatePlanPayload(plan);
}

/**
 * Stage an immutable catalog version (§6 steps 7). Does not flip the live
 * active pointer — call activateServicePlan for that.
 */
async function publishServicePlan({ db, admin, companyId, groupId, actorId, plan, source = {} }) {
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
    const error = new Error("Ova verzija plana je već sačuvana. Uvezite novu verziju umesto prepisivanja istorije.");
    error.code = "version-exists";
    throw error;
  }

  const batch = db.batch();
  const revisionId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const sourceHash = sourceHashForPlan(normalized);
  const sourceMeta = normalizeSourceMeta(source);

  batch.set(planRef, {
    id: planId,
    groupId: normalizedGroupId,
    templateVersion: normalized.templateVersion,
    planCode: normalized.planCode,
    planVersion: normalized.planVersion,
    validFrom: normalized.validFrom,
    timezone: normalized.timezone,
    status: "staged",
    revisionId,
    sourceHash,
    sourceFileName: sourceMeta.fileName,
    sourceContentType: sourceMeta.contentType,
    sourceByteSize: sourceMeta.byteSize,
    dutyCount: validation.summary.dutyCount,
    activityCount: validation.summary.activityCount,
    overnightDutyCount: validation.summary.overnightDutyCount,
    stagedAt: timestamp,
    stagedBy: actorId,
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
    sourceHash,
    status: "staged",
    plan: { ...normalized, groupId: normalizedGroupId },
    summary: validation.summary
  };
}

/**
 * Atomically point the group's live catalog at a staged or superseded version.
 * Previous active version becomes superseded (audited rollback when target was
 * previously superseded).
 */
async function activateServicePlan({ db, admin, companyId, groupId, actorId, planId }) {
  const normalizedGroupId = normalizeServicePlanGroupId(groupId);
  const normalizedPlanId = normalizeServicePlanId(planId);
  const companyRef = db.collection("companies").doc(companyId);
  await assertCompanyGroupsExist(companyRef, [normalizedGroupId]);
  const plansRef = companyRef.collection("service_plans");
  const planRef = plansRef.doc(normalizedPlanId);
  const planSnap = await planRef.get();
  if (!planSnap.exists || planSnap.data().groupId !== normalizedGroupId) {
    const error = new Error("Verzija kataloga nije pronađena.");
    error.code = "plan-not-found";
    throw error;
  }
  const target = planSnap.data();
  if (target.status === "active") {
    return {
      planId: normalizedPlanId,
      status: "active",
      alreadyActive: true,
      previousActivePlanId: null,
      plan: target
    };
  }
  if (!["staged", "superseded"].includes(target.status)) {
    const error = new Error("Samo sačuvane ili arhivirane verzije mogu da se aktiviraju.");
    error.code = "invalid-status";
    throw error;
  }

  const activeSnapshot = await plansRef.where("status", "==", "active").get();
  const batch = db.batch();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  let previousActivePlanId = null;

  activeSnapshot.docs.forEach(doc => {
    const current = doc.data();
    if (doc.id !== normalizedPlanId && current.groupId === normalizedGroupId) {
      previousActivePlanId = doc.id;
      batch.set(doc.ref, {
        status: "superseded",
        supersededAt: timestamp,
        supersededBy: normalizedPlanId
      }, { merge: true });
    }
  });

  batch.set(planRef, {
    status: "active",
    activatedAt: timestamp,
    activatedBy: actorId,
    supersededAt: null,
    supersededBy: null,
    rolledBackFrom: previousActivePlanId
  }, { merge: true });

  await batch.commit();
  return {
    planId: normalizedPlanId,
    status: "active",
    alreadyActive: false,
    previousActivePlanId,
    plan: {
      ...target,
      status: "active",
      rolledBackFrom: previousActivePlanId
    }
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
        sourceHash: data.sourceHash || null,
        dutyCount: data.dutyCount,
        activityCount: data.activityCount,
        overnightDutyCount: data.overnightDutyCount,
        publishedAt: timestampToIso(data.publishedAt || data.stagedAt),
        publishedBy: data.publishedBy || data.stagedBy || null,
        activatedAt: timestampToIso(data.activatedAt),
        activatedBy: data.activatedBy || null,
        supersededAt: timestampToIso(data.supersededAt),
        supersededBy: data.supersededBy || null,
        rolledBackFrom: data.rolledBackFrom || null
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
    publishedAt: timestampToIso(metadata.publishedAt || metadata.stagedAt),
    activatedAt: timestampToIso(metadata.activatedAt),
    supersededAt: timestampToIso(metadata.supersededAt),
    duties
  };
}

module.exports = {
  activateServicePlan,
  getActiveServicePlan,
  getServicePlanVersion,
  listServicePlanHistory,
  normalizeServicePlanGroupId,
  normalizeServicePlanId,
  previewServicePlan,
  publishServicePlan,
  servicePlanId,
  sourceHashForPlan,
  validatePlanPayload
};
