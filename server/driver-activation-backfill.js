"use strict";

/**
 * Classify and optionally backfill companies/{id}/drivers.codeActivated.
 * Dry-run by default. Never logs PIN, OTP, hashes, EID, or other credentials.
 */

const ACTIVATION_CLASS = Object.freeze({
  ACTIVATED: "activated",
  PENDING: "pending",
  REVIEW_REQUIRED: "review_required"
});

function hasSecretValue(value) {
  return value != null && value !== "";
}

function classifyDriverActivation(profile = {}, credentials = {}) {
  const current = profile?.codeActivated;
  const hasLoginHash = hasSecretValue(credentials?.loginCodeHash);
  const hasUsedAt = hasSecretValue(credentials?.activationUsedAt) || hasSecretValue(profile?.activationUsedAt);
  const hasOtpHash = hasSecretValue(credentials?.activationCodeHash);

  if (current === true) {
    return { class: ACTIVATION_CLASS.ACTIVATED, proposed: true, write: false, reason: "already_true" };
  }
  if (hasLoginHash && hasUsedAt) {
    return { class: ACTIVATION_CLASS.ACTIVATED, proposed: true, write: true, reason: "login_hash_and_used_at" };
  }
  if (hasOtpHash && !hasLoginHash && !hasUsedAt) {
    return { class: ACTIVATION_CLASS.PENDING, proposed: false, write: current !== false, reason: "pending_otp" };
  }
  if (current === false && !hasLoginHash) {
    return { class: ACTIVATION_CLASS.PENDING, proposed: false, write: false, reason: "already_false_pending" };
  }
  return { class: ACTIVATION_CLASS.REVIEW_REQUIRED, proposed: null, write: false, reason: "ambiguous" };
}

function safeLogEntry({ companyId, driverId, classification, dryRun }) {
  return {
    event: "driver_activation_backfill",
    companyId: String(companyId || ""),
    driverId: String(driverId || ""),
    class: classification.class,
    proposed: classification.proposed,
    write: classification.write === true,
    reason: classification.reason,
    dryRun: dryRun !== false
  };
}

const COMPANY_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const RESERVED_COMPANY_IDS = new Set(["all", "global", "*"]);

function countFlag(argv, flag) {
  return argv.filter((arg) => arg === flag).length;
}

function readFlagValue(argv, flag) {
  if (countFlag(argv, flag) > 1) {
    throw new Error("SAFETY ERROR: each identity flag must be specified exactly once.");
  }
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return null;
  const value = argv[idx + 1];
  if (typeof value !== "string" || value.startsWith("--")) return null;
  return value;
}

function assertCompanyScope(companyId) {
  if (typeof companyId !== "string") {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
  if (companyId !== companyId.trim() || companyId === "" || /\s/.test(companyId)) {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
  if (
    /[\\/]/.test(companyId)
    || companyId.includes("..")
    || companyId.includes(",")
    || companyId.includes(";")
  ) {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
  if (RESERVED_COMPANY_IDS.has(companyId.toLowerCase())) {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
  if (!COMPANY_ID_PATTERN.test(companyId)) {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
}

function extractProjectIdFromObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = value.project_id || value.projectId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function resolveCredentialProjectId(env = {}, { readFile } = {}) {
  const rawJson = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson != null && String(rawJson).trim() !== "") {
    let parsed;
    try {
      parsed = JSON.parse(String(rawJson));
    } catch {
      throw new Error("SAFETY ERROR: credential project could not be resolved.");
    }
    const id = extractProjectIdFromObject(parsed);
    if (!id) throw new Error("SAFETY ERROR: credential project could not be resolved.");
    return id;
  }

  const keyPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath != null && String(keyPath).trim() !== "") {
    let text;
    try {
      const reader = typeof readFile === "function" ? readFile : require("fs").readFileSync;
      text = reader(String(keyPath), "utf8");
    } catch {
      throw new Error("SAFETY ERROR: credential project could not be resolved.");
    }
    let parsed;
    try {
      parsed = JSON.parse(String(text));
    } catch {
      throw new Error("SAFETY ERROR: credential project could not be resolved.");
    }
    const id = extractProjectIdFromObject(parsed);
    if (!id) throw new Error("SAFETY ERROR: credential project could not be resolved.");
    return id;
  }

  const firebaseConfig = env.FIREBASE_CONFIG;
  if (firebaseConfig != null && String(firebaseConfig).trim() !== "") {
    let parsed;
    try {
      parsed = JSON.parse(String(firebaseConfig));
    } catch {
      throw new Error("SAFETY ERROR: credential project could not be resolved.");
    }
    const id = extractProjectIdFromObject(parsed);
    if (!id) throw new Error("SAFETY ERROR: credential project could not be resolved.");
    return id;
  }

  const gcloud = env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT;
  if (gcloud != null && String(gcloud).trim() !== "") {
    return String(gcloud).trim();
  }

  throw new Error("SAFETY ERROR: credential project could not be resolved.");
}

function assertProjectIdentity({ project, confirmProject, credentialProjectId }) {
  if (!project || !confirmProject || project !== confirmProject) {
    throw new Error("SAFETY ERROR: --project and --confirm-project do not match.");
  }
  if (!credentialProjectId || credentialProjectId !== confirmProject) {
    throw new Error("SAFETY ERROR: credential project does not match --confirm-project.");
  }
}

function prepareActivationBackfillRun({ argv = [], env = {}, readFile } = {}) {
  const parsed = parseActivationBackfillArgs(argv);
  const credentialProjectId = resolveCredentialProjectId(env, { readFile });
  assertProjectIdentity({
    project: parsed.project,
    confirmProject: parsed.confirmProject,
    credentialProjectId
  });
  return { ...parsed, credentialProjectId };
}

async function migrateCompanyDriverActivation({
  db,
  companyId,
  dryRun = true,
  logger = () => {}
} = {}) {
  assertCompanyScope(companyId);
  const companyRef = db.collection("companies").doc(companyId);
  const driversSnap = await companyRef.collection("drivers").get();
  const results = [];
  let written = 0;
  let reviewRequired = 0;
  for (const profileDoc of driversSnap.docs) {
    const credSnap = await companyRef.collection("driver_credentials").doc(profileDoc.id).get();
    const credentials = credSnap.exists ? (credSnap.data() || {}) : {};
    const classification = classifyDriverActivation(profileDoc.data() || {}, credentials);
    const entry = safeLogEntry({
      companyId,
      driverId: profileDoc.id,
      classification,
      dryRun
    });
    logger(entry);
    results.push(entry);
    if (classification.class === ACTIVATION_CLASS.REVIEW_REQUIRED) reviewRequired += 1;
    const mayWrite = dryRun !== true
      && classification.write === true
      && classification.class !== ACTIVATION_CLASS.REVIEW_REQUIRED
      && (classification.proposed === true || classification.proposed === false);
    if (!mayWrite) continue;
    await profileDoc.ref.update({ codeActivated: classification.proposed });
    written += 1;
  }
  const summary = {
    event: "driver_activation_backfill_summary",
    companyId,
    dryRun: dryRun !== false,
    scanned: driversSnap.docs.length,
    written,
    reviewRequired
  };
  logger(summary);
  return { ...summary, results };
}

function parseActivationBackfillArgs(argv = []) {
  if (countFlag(argv, "--company") > 1) {
    throw new Error("SAFETY ERROR: --company must name exactly one tenant.");
  }
  const companyId = readFlagValue(argv, "--company");
  const project = readFlagValue(argv, "--project");
  const confirmProject = readFlagValue(argv, "--confirm-project");
  const apply = argv.includes("--apply");
  assertCompanyScope(companyId);
  if (!project || !confirmProject) {
    throw new Error("SAFETY ERROR: --project and --confirm-project are required.");
  }
  if (project !== confirmProject) {
    throw new Error("SAFETY ERROR: --project and --confirm-project do not match.");
  }
  return {
    companyId,
    project,
    confirmProject,
    apply,
    dryRun: !apply
  };
}

module.exports = {
  ACTIVATION_CLASS,
  classifyDriverActivation,
  safeLogEntry,
  migrateCompanyDriverActivation,
  parseActivationBackfillArgs,
  prepareActivationBackfillRun,
  resolveCredentialProjectId,
  assertProjectIdentity,
  assertCompanyScope
};
