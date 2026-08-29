const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { parseDriverCsv } = require("./driver-csv");
const {
  evaluateDriverWorkPolicy,
  fingerprintShift,
  validTimezone,
  localDateString,
  addDays
} = require("./driver-work-policy");
const { dispatcherCanAccessGroup, isActiveReportStatus, isResolvedReportStatus } = require("./report-lifecycle");
const { normalizeGroupIds, assertCompanyGroupsExist } = require("./group-access");
const {
  buildProblemCreateFields,
  simulateProblemTransition,
  currentProblemRevision,
  isOpsActivityAction,
  normalizedProblemStatus
} = require("./problem-resolution");
const {
  generateActivationOtp,
  activationExpiresAt,
  hashSecret,
  verifyActivationOtp,
  isValidPersonalLoginCode,
  PERSONAL_CODE_RE
} = require("./driver-activation-otp");
const { createSmsProvider } = require("./sms-provider");
const {
  shiftDocumentId,
  scheduleMonthFromDate,
  scheduleDayNumber,
  scheduleDocumentId,
  currentRevision,
  assertExpectedRevision,
  buildAssignedShift,
  buildScheduleDayEntry,
  capturePriorSnapshot,
  buildClearedShift,
  simulateUndoWrite
} = require("./shift-assignment");
const {
  isActiveDutyType,
  evaluateBusResource,
  findOverlappingBusAssignments,
  evaluateDutyAgainstCatalog,
  assignmentResourceErrorMessage
} = require("./assignment-resource-guard");
const { getActiveServicePlan, getActiveServicePlanInTx } = require("./service-plans");
const {
  canonicalDutyGuardKey,
  dutyGuardRef,
  evaluateDutyGuardClaim,
  writeDutyGuardClaimInTx,
  writeDutyGuardReleaseInTx,
  writeDutyGuardTransferInTx,
  isPassiveDutyType
} = require("./duty-instance-guard");
const { commitImportedDriversWithIdentityGuard } = require("./company-admin-driver-ops");

/** Test-only barrier inside assignment mutation (after reads, before writes). */
let _assignmentMutationHookForTests = null;
function setAssignmentMutationHookForTests(fn) {
  _assignmentMutationHookForTests = typeof fn === "function" ? fn : null;
}
const {
  PlanImportValidationError,
  buildPlanImportPreview
} = require("./plan-import-preview");
const {
  assertNoActiveGroupMonthlyImport,
  GroupMonthlyImportError,
  readMonthlyImportLockInTx
} = require("./group-monthly-plan-import");
const {
  prepareStaffMonthlyImport,
  commitStaffMonthlyImport
} = require("./staff-monthly-plan-import");
const {
  staffMessageSchema,
  messageTypeForTemplate,
  resolveStaffMessageTargets,
  buildStaffMessageDoc,
  newMessageId
} = require("./staff-messages");
const {
  planMessageRead,
  planMessageAck,
  shouldRequireAck
} = require("./message-lifecycle");
const {
  summarizeOutboxStatuses,
  classifyOutboxForOps,
  isStaleConfirmation
} = require("./confirmation-outbox");
const {
  isLiveGpsEnabled,
  sanitizeLocationPayload,
  shouldAcceptLocationSample,
  publicLastLocation
} = require("./driver-location");
const { normalizeIdempotencyKey } = require("./driver-report-idempotency");
const {
  DRIVER_CREATE_STATUSES,
  normalizeLostItemStatus,
  canTransitionLostItemStatus,
  buildFoundAtFields,
  validateLostItemPhoto,
  publicLostItemPhoto
} = require("./lost-item-lifecycle");
const { createStaffAuth } = require("./staff-auth");

const COST = 12;
const smsProvider = createSmsProvider();
const SENSITIVE_DRIVER_FIELDS = Object.freeze([
  "eid", "company_code", "companyCode", "companyCodeHash", "loginCodeHash",
  "temporaryCodeHash", "temporaryHash", "activationCodeHash", "activationExpiresAt",
  "activationUsedAt", "pin", "password", "passwordHash"
]);
const companySchema = z.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
// The driver signs in with the employee id printed on their roster. `driverId`
// stays accepted so a browser still running a cached bundle keeps working, but
// no client needs to resolve the id up front any more.
const loginSchema = z.object({
  companyId: companySchema,
  eid: z.string().trim().min(1).max(128).optional(),
  driverId: z.string().uuid().optional(),
  loginCode: z.string().trim().regex(/^\d{5,12}$/)
}).refine((value) => Boolean(value.eid || value.driverId), {
  message: "Potreban je EID ili identifikator vozača."
});
const MAX_FAILED_LOGIN_ATTEMPTS = 10;
const LOGIN_LOCK_MS = 15 * 60_000;
const activateSchema = z.object({
  personalLoginCode: z.string().trim().regex(PERSONAL_CODE_RE)
});
const groupIdSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const importSchema = z.object({ companyId: companySchema, groupId: groupIdSchema, csv: z.string().min(1).max(1_000_000) });
const driverIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const driverStatusSchema = z.object({ active: z.boolean() });
const busIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const busOpsStatusSchema = z.enum(["active", "breakdown", "reserve", "other_line"]);
const busGarageSchema = z.string().trim().max(40).optional().default("");
const busPlateSchema = z.string().trim().max(20).regex(/^[A-Za-z0-9 -]*$/).optional().default("");
// Informational only — which line an "other_line" bus is currently reported at.
// Never touches real group membership (bus.groupIds); ignored unless opsStatus is other_line.
const busOtherLineIdSchema = z.string().trim().max(64).regex(/^[A-Za-z0-9_-]*$/).optional().default("");
const busCreateSchema = z.object({
  number: z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N} ._/-]+$/u),
  groupId: groupIdSchema,
  plate: busPlateSchema,
  garage: busGarageSchema,
  opsStatus: busOpsStatusSchema.optional().default("active")
});
const busStatusSchema = z.object({
  active: z.boolean(),
  expectedRevision: z.number().int().min(0),
  reason: z.string().trim().max(40).optional(),
  note: z.string().trim().max(120).optional()
});
const busProfileSchema = z.object({
  plate: busPlateSchema,
  garage: busGarageSchema,
  opsStatus: busOpsStatusSchema,
  otherLineId: busOtherLineIdSchema,
  expectedRevision: z.number().int().min(0)
});
const changeReasonSchema = z.string().trim().max(40).optional();
const changeNoteSchema = z.string().trim().max(120).optional();
const lineDetachSchema = z.object({
  groupId: groupIdSchema,
  action: z.literal("detach"),
  reason: changeReasonSchema,
  note: changeNoteSchema
});
/** Dispatcher-callable, full-company access (Streckenkenntnis) — never touches eid/pin/companyCode. */
const knownGroupsUpdateSchema = z.object({
  knownGroupIds: z.array(groupIdSchema).max(40)
});
const busGroupDetachSchema = z.object({
  groupId: groupIdSchema,
  action: z.literal("detach"),
  expectedRevision: z.number().int().min(0),
  reason: changeReasonSchema,
  note: changeNoteSchema
});
const busGroupSwitchSchema = z.object({
  toGroupId: groupIdSchema,
  expectedRevision: z.number().int().min(0)
});

function busRevisionOf(data = {}) {
  const revision = Number(data.revision);
  return Number.isInteger(revision) && revision >= 0 ? revision : 0;
}

function publicBusPayload(id, data = {}) {
  const { normalizeGroupIds } = require("./bus-group-membership");
  return {
    id,
    number: data.number || "",
    groupId: data.groupId || null,
    lineId: data.lineId || data.groupId || null,
    groupIds: normalizeGroupIds(data),
    active: data.active !== false,
    plate: String(data.plate || "").trim().slice(0, 20),
    garage: String(data.garage || "").trim().slice(0, 40),
    opsStatus: busOpsStatusSchema.options.includes(String(data.opsStatus || ""))
      ? String(data.opsStatus)
      : "active",
    otherLineId: String(data.otherLineId || "").trim().slice(0, 64) || null,
    revision: busRevisionOf(data),
    createdAt: null
  };
}
const idempotencyKeySchema = z.string().trim().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/).optional();
const quickReportSchema = z.object({
  type: z.enum([
    "delay:5", "delay:10", "delay:15", "delay:20", "delay:30",
    "breakdown:bd_engine", "breakdown:bd_brakes", "breakdown:bd_tyre",
    "breakdown:bd_doors", "breakdown:bd_ac", "breakdown:bd_other"
  ]),
  reason: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  severity: z.enum(["sev_low", "sev_medium", "sev_critical"]),
  bus: z.string().trim().max(32).optional().default(""),
  idempotencyKey: idempotencyKeySchema,
  clientCreatedAt: z.string().trim().min(10).max(40).optional()
});
const sosSchema = z.object({ bus: z.string().trim().max(32).optional().default("") });
/** Dispatcher resolution note is OPTIONAL — an operator clearing a live alarm must
 *  never be blocked by a form field. An empty note falls back to a default so the
 *  append-only audit still records a reason (master prompt §8). */
const sosResolveSchema = z.object({ note: z.string().trim().max(500).optional().default("") });
const SOS_DEFAULT_RESOLUTION_NOTE = "Reseno od strane dispecera";
const messageIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemStatusSchema = z.object({
  status: z.enum(["in_depot", "stays_on_bus", "returned"])
});
const lostItemPhotoSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png"]),
  dataBase64: z.string().min(32).max(500_000)
}).optional().nullable();
const lostItemSchema = z.object({
  type: z.enum(["lost_tech", "lost_wallet", "lost_keys", "lost_bag", "lost_clothes", "lost_other"]),
  location: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(1000),
  bus: z.string().trim().max(32).optional().default(""),
  status: z.enum(["in_depot", "stays_on_bus"]).optional().default("in_depot"),
  foundAt: z.string().trim().min(10).max(40).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  photo: lostItemPhotoSchema,
  idempotencyKey: idempotencyKeySchema,
  clientCreatedAt: z.string().trim().min(10).max(40).optional()
});
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const operationalIncidentSchema = z.object({
  type: z.string().trim().min(1).max(64).optional().default("coverage:disruption"),
  affectedEntity: z.enum(["driver", "vehicle"]).optional().default("driver"),
  driverId: driverIdSchema.optional(),
  date: isoDateSchema,
  reason: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  bus: z.string().trim().max(32).optional().default(""),
  shiftType: z.string().trim().max(64).optional().default(""),
  shiftName: z.string().trim().max(120).optional().default(""),
  scopeKind: z.enum(["day", "assignment"]).optional(),
  scopeId: z.string().trim().max(128).optional()
}).superRefine((data, ctx) => {
  const entity = data.affectedEntity || "driver";
  if (entity === "driver" && !data.driverId) {
    ctx.addIssue({ code: "custom", path: ["driverId"], message: "required" });
  }
  if (entity === "vehicle" && !String(data.bus || "").trim()) {
    ctx.addIssue({ code: "custom", path: ["bus"], message: "required" });
  }
});
function buildCanonicalIncidentIdentity({
  version = "v1",
  incidentType = "coverage:disruption",
  affectedEntity = "driver",
  driverId = null,
  bus = null,
  date,
  groupId,
  scopeKind = "day",
  scopeId = "day"
}) {
  const normVersion = String(version || "v1").trim().toLowerCase();
  const normType = String(incidentType || "coverage:disruption").trim();
  const normEntity = String(affectedEntity || "driver").trim().toLowerCase();
  const normDriver = driverId ? String(driverId).trim() : null;
  const normBus = bus ? String(bus).trim() : null;
  const normResource = normEntity === "driver" ? normDriver : normBus;
  const normDate = String(date || "").trim();
  const normGroup = String(groupId || "").trim();
  const normScopeKind = String(scopeKind || "day").trim().toLowerCase();
  const normScopeId = String(scopeId || "day").trim();

  if (!normType || !normEntity || !normResource || !normDate || !normGroup || normGroup === "all" || !normScopeKind || !normScopeId) {
    return { ok: false, error: "invalid_identity" };
  }

  const payload = {
    v: normVersion,
    t: normType,
    e: normEntity,
    r: normResource,
    d: normDate,
    g: normGroup,
    sk: normScopeKind,
    sid: normScopeId
  };

  const serialized = JSON.stringify(payload);
  const hash = crypto.createHash("sha256").update(serialized, "utf8").digest("hex");
  const guardKey = `${normVersion}_${hash}`;

  return {
    ok: true,
    guardKey,
    identity: {
      version: normVersion,
      incidentType: normType,
      affectedEntity: normEntity,
      driverId: normDriver,
      bus: normBus,
      resourceId: normResource,
      date: normDate,
      groupId: normGroup,
      scopeKind: normScopeKind,
      scopeId: normScopeId,
      guardKey
    }
  };
}
const problemTransitionSchema = z.object({
  toStatus: z.enum(["acknowledged", "solution_proposed", "applying", "cancelled"]),
  expectedRevision: z.number().int().min(0),
  assigneeId: z.string().trim().min(1).max(128).optional(),
  proposedSolution: z.string().trim().max(1000).optional()
});
const coverageResolutionSchema = z.object({
  type: z.enum(["replacement", "available_again", "restored", "cancelled", "no_replacement"]).optional().default("replacement"),
  resolutionType: z.enum(["replacement", "available_again", "restored", "cancelled", "no_replacement"]).optional(),
  replacementDriverId: driverIdSchema.optional(),
  replacementBus: z.string().trim().max(32).optional(),
  expectedOriginalRevision: z.number().int().min(0).optional(),
  expectedReplacementRevision: z.number().int().min(0).optional(),
  expectedProblemRevision: z.number().int().min(0).optional(),
  note: z.string().trim().max(1000).optional()
}).superRefine((data, ctx) => {
  const effectiveType = data.resolutionType || data.type || "replacement";
  if (effectiveType === "replacement") {
    if (!data.replacementDriverId) {
      ctx.addIssue({ code: "custom", path: ["replacementDriverId"], message: "required" });
    }
    if (!data.replacementBus || !data.replacementBus.trim()) {
      ctx.addIssue({ code: "custom", path: ["replacementBus"], message: "required" });
    }
  }
});
const vacationSchema = z.object({
  type: z.enum(["lt_vacation", "lt_paid", "lt_days"]),
  start: isoDateSchema,
  end: isoDateSchema,
  reason: z.string().trim().max(1000).optional().default("")
});
const vacationIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const vacationStatusSchema = z.object({ status: z.enum(["approved", "rejected"]) });
const reportIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const reportResolutionSchema = z.object({
  type: z.enum(["replacement", "restored", "cancelled"]),
  summary: z.string().trim().min(3).max(1000),
  replacementDriverId: driverIdSchema.optional(),
  replacementBus: z.string().trim().min(1).max(32).optional()
});
const shiftAssignmentSchema = z.object({
  driverId: driverIdSchema,
  date: isoDateSchema,
  type: z.enum(["morning", "afternoon", "night", "bereitschaft", "off", "vacation", "sick", "clear"]),
  name: z.string().trim().max(120).optional().default(""),
  bus: z.string().trim().max(32).optional().default(""),
  routeCode: z.string().trim().max(64).optional().default(""),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(),
  expectedRevision: z.number().int().min(0)
});
const shiftUndoSchema = z.object({
  driverId: driverIdSchema,
  date: isoDateSchema,
  expectedRevision: z.number().int().min(0)
});
const monthlyPlanImportPreviewSchema = z.object({
  groupId: groupIdSchema,
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  sourceName: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(3).max(200),
  rows: z.array(shiftAssignmentSchema).min(1).max(1000)
});
const monthlyPlanImportCommitSchema = z.object({
  importId: z.string().trim().min(8).max(80),
  fingerprint: z.string().trim().regex(/^[a-f0-9]{64}$/)
});
const shiftConfirmationSchema = z.object({
  dates: z.array(isoDateSchema).min(1).max(4).transform((dates) => [...new Set(dates)])
});

function inclusiveDays(start, end) {
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function vacationOverlaps(candidate, existing) {
  return candidate.start <= existing.end && candidate.end >= existing.start;
}

function safeDriver(doc) {
  const data = doc.data ? doc.data() : doc;
  return { id: doc.id || data.id, name: `${data.firstName || ""} ${data.lastName || ""}`.trim() };
}

function safeProfilePayload(driver, groupId, companyId, createdAt) {
  const home = String(groupId || "").trim();
  return {
    firstName: driver.first_name,
    lastName: driver.last_name,
    phone: driver.phone,
    email: driver.email,
    groupId: home,
    lineId: home,
    // knownGroupIds = CA metadata (D18); home always included. Not a Dispo Firestore directory grant.
    knownGroupIds: home ? [home] : [],
    companyId,
    active: true,
    codeActivated: false,
    createdAt
  };
}

/** Dispatcher-scoped driver docs: home groupId only (knownGroupIds is CA metadata, not a directory). */
async function loadDriverDocsForGroups(companyRef, groupIds) {
  const ids = [...new Set((groupIds || []).map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 40);
  if (!ids.length) return [];
  const snaps = await Promise.all(
    ids.map((groupId) => companyRef.collection("drivers").where("groupId", "==", groupId).get())
  );
  const unique = new Map();
  snaps.flatMap((snap) => snap.docs).forEach((doc) => unique.set(doc.id, doc));
  return [...unique.values()];
}

function credentialPayload(driver, { companyCodeHash, activationCodeHash, activationExpiresAt: expiresAt, createdAt }) {
  return {
    eid: driver.eid,
    ...(companyCodeHash ? { companyCodeHash } : {}),
    activationCodeHash,
    activationExpiresAt: expiresAt,
    activationUsedAt: null,
    createdAt
  };
}

async function verifyDriverLogin(profile, credentials, loginCode, now = new Date()) {
  if (!profile || profile.active === false || !credentials) return false;
  if (!profile.codeActivated) {
    return verifyActivationOtp(credentials, loginCode, now);
  }
  if (!credentials.loginCodeHash) return false;
  return bcrypt.compare(loginCode, credentials.loginCodeHash);
}

async function resolveDriverIdByEid(companyRef, eid) {
  if (!eid) return null;
  const snapshot = await companyRef.collection("driver_credentials")
    .where("eid", "==", eid).limit(1).get();
  return snapshot.empty ? null : snapshot.docs[0].id;
}

function toDateOrNull(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The per-IP limiter does not stop a distributed guess at a five digit code, so
 * failures are also counted on the credential document itself. The counter is
 * updated inside the login transaction, which makes it exact under concurrent
 * attempts.
 */
function loginLockState(credentials, now) {
  const lockedUntil = toDateOrNull(credentials?.lockedUntil);
  if (!lockedUntil || lockedUntil <= now) return { locked: false, lockedUntil: null };
  return { locked: true, lockedUntil };
}

function nextFailureState(credentials, now) {
  const attempts = Number(credentials?.failedLoginAttempts);
  const failedLoginAttempts = (Number.isFinite(attempts) && attempts > 0 ? attempts : 0) + 1;
  if (failedLoginAttempts < MAX_FAILED_LOGIN_ATTEMPTS) {
    return { failedLoginAttempts, lockedUntil: null };
  }
  return { failedLoginAttempts: 0, lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS) };
}

async function verifyCompanyCode(credentials, companyCode) {
  return Boolean(credentials?.companyCodeHash) && bcrypt.compare(companyCode, credentials.companyCodeHash);
}

function createRequireActivatedDriver({ admin, hasFirebase }) {
  return async function requireActivatedDriver(req, res, next) {
    if (!hasFirebase()) return res.status(503).json({ success: false, code: "FIREBASE_UNAVAILABLE", error: "Firebase nije konfigurisan." });
    try {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!token) return res.status(401).json({ success: false, code: "INVALID_TOKEN", error: "Nevažeći token." });
      // checkRevoked: deactivating a driver revokes refresh tokens, and without
      // this flag an already issued ID token would keep working until it expires.
      const decoded = await admin().auth().verifyIdToken(token, true);
      if (decoded.role !== "driver" || decoded.mustChangeLoginCode !== false || !decoded.companyId) {
        return res.status(403).json({ success: false, code: "ACTIVATION_REQUIRED", error: "Aktivacija naloga je obavezna." });
      }
      req.driver = decoded;
      return next();
    } catch {
      return res.status(401).json({ success: false, code: "INVALID_TOKEN", error: "Nevažeći token." });
    }
  };
}

function registerDriverRoutes(app, deps) {
  const {
    admin, db, hasFirebase, rateLimit, clearRateLimit, getClientIp, logAudit,
    confirmationScheduler = null, staffAuth = null
  } = deps;
  const now = typeof deps.now === "function" ? deps.now : () => new Date();
  app.use("/api/driver", createRequireActivatedDriver({ admin, hasFirebase }));

  async function loadDriverWorkPolicy(driverClaims) {
    const companyRef = db().collection("companies").doc(driverClaims.companyId);
    const [profileSnap, companyProfileSnap, shiftsSnap, schedulesSnap] = await Promise.all([
      companyRef.collection("drivers").doc(driverClaims.uid).get(),
      companyRef.collection("profile").doc("main").get(),
      companyRef.collection("shifts").where("driverId", "==", driverClaims.uid).get(),
      companyRef.collection("schedules").where("driverId", "==", driverClaims.uid).get()
    ]);
    if (!profileSnap.exists || profileSnap.data().active === false) {
      return { status: "blocked", reason: "driver_inactive", timezone: null, companyRef };
    }
    const timezone = companyProfileSnap.exists ? companyProfileSnap.data().timezone : null;
    const policy = evaluateDriverWorkPolicy({
      now: now(), timezone,
      shifts: shiftsSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      schedules: schedulesSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
    });
    return { ...policy, companyRef };
  }

  async function decorateConfirmationStatus(policy, driverId) {
    if (policy.status !== "active" || !policy.confirmationTargets.length) return policy;
    const snapshot = await policy.companyRef.collection("shift_confirmations")
      .where("driverId", "==", driverId).get();
    const confirmations = new Map(snapshot.docs.map((doc) => {
      const data = doc.data();
      return [data.date, data];
    }));
    return {
      ...policy,
      confirmationTargets: policy.confirmationTargets.map((target) => ({
        ...target,
        confirmed: confirmations.get(target.date)?.shiftFingerprint === target.fingerprint
      }))
    };
  }

  app.get("/api/driver/work-session", rateLimit(20, 60_000), async (req, res) => {
    try {
      let policy = await loadDriverWorkPolicy(req.driver);
      const companyRef = policy.companyRef;
      const sessionRef = companyRef.collection("driver_sessions").doc(req.driver.uid);
      const settingsSnap = await companyRef.collection("settings").doc("main").get();
      const settingsMain = settingsSnap.exists ? settingsSnap.data() : {};
      const liveGps = isLiveGpsEnabled(settingsMain);

      if (policy.status === "active" || policy.status === "grace") {
        await sessionRef.set({
          driverId: req.driver.uid,
          status: policy.status,
          shiftDate: policy.shift.date,
          timezone: policy.timezone,
          notificationsUntil: admin().firestore.Timestamp.fromDate(new Date(policy.notificationsUntil)),
          sessionEndsAt: admin().firestore.Timestamp.fromDate(new Date(policy.sessionEndsAt)),
          liveGps,
          checkedAt: admin().firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        await sessionRef.delete().catch(() => {});
        // Clear current point when off-duty — no GPS trail is retained (O2 open).
        await companyRef.collection("drivers").doc(req.driver.uid).set({
          lastLocation: admin().firestore.FieldValue.delete(),
          lastLocationClearedAt: admin().firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
      policy = await decorateConfirmationStatus(policy, req.driver.uid);
      if (confirmationScheduler && policy.status === "active") {
        await confirmationScheduler.enqueueFromPolicy({
          companyId: req.driver.companyId,
          driverId: req.driver.uid,
          policy
        }).catch((error) => {
          req.log?.warn?.({ err: error }, "Confirmation outbox enqueue failed");
        });
      }
      const safePolicy = {
        ...policy,
        features: {
          liveGps,
          liveMap: settingsMain?.features?.liveMap !== false
        }
      };
      delete safePolicy.companyRef;
      return res.json({ success: true, policy: safePolicy });
    } catch (error) {
      req.log?.error?.({ err: error }, "Provera radne sesije voza\u010da nije uspela");
      return res.status(500).json({ success: false, error: "Radna sesija nije mogla biti proverena." });
    }
  });

  // 24/7 driver access: schedule, confirmations, SOS, reports, vacations and
  // messages stay reachable whenever the driver authenticates. The ONLY
  // shift-bound surface is the live GPS trail (GDPR: telemetry is tied to
  // an active driving window, nothing else).
  app.use("/api/driver/location", async (req, res, next) => {
    try {
      const policy = await loadDriverWorkPolicy(req.driver);
      if (policy.status !== "active") {
        return res.status(403).json({
          success: false,
          code: policy.status === "grace" ? "DRIVER_SHIFT_ENDED" : "DRIVER_OFF_DUTY",
          error: "GPS telemetrija je dostupna samo tokom aktivne smene."
        });
      }
      req.driverWorkPolicy = policy;
      return next();
    } catch (error) {
      req.log?.error?.({ err: error }, "Provera radnog vremena voza\u010da nije uspela");
      return res.status(500).json({ success: false, error: "Radno vreme nije moglo biti provereno." });
    }
  });

  app.post("/api/driver/location", rateLimit(30, 60_000), async (req, res) => {
    try {
      const companyRef = req.driverWorkPolicy.companyRef;
      const settingsSnap = await companyRef.collection("settings").doc("main").get();
      if (!isLiveGpsEnabled(settingsSnap.exists ? settingsSnap.data() : {})) {
        return res.status(403).json({
          success: false,
          code: "LIVE_GPS_DISABLED",
          error: "Praćenje lokacije nije uključeno za ovu firmu."
        });
      }
      const parsed = sanitizeLocationPayload(req.body || {});
      if (!parsed.ok) {
        return res.status(400).json({ success: false, code: "INVALID_LOCATION", error: "Nevažeća lokacija." });
      }
      const driverRef = companyRef.collection("drivers").doc(req.driver.uid);
      const driverSnap = await driverRef.get();
      const previous = driverSnap.exists ? driverSnap.data()?.lastLocation : null;
      if (!shouldAcceptLocationSample(previous)) {
        return res.json({ success: true, throttled: true });
      }
      const nowIso = new Date().toISOString();
      await driverRef.set({
        lastLocation: {
          ...parsed.location,
          updatedAt: nowIso
        },
        lastSeen: admin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res.json({
        success: true,
        location: publicLastLocation({ ...parsed.location, updatedAt: nowIso })
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Upis lokacije vozača nije uspeo");
      return res.status(500).json({ success: false, error: "Lokacija nije mogla biti sačuvana." });
    }
  });

  // Staff authorization lives in one place (server/staff-auth.js): revoked-token
  // check, tenant profile lookup, role drift and superseded sessions. This used
  // to be a second, weaker copy that accepted a token whose role no longer
  // matched the profile. The alias keeps `req.staff` for the routes below.
  const gate = staffAuth || createStaffAuth({ hasFirebase, admin, db });
  function requireStaff(req, res, next) {
    return gate.requireCompanyStaff(req, res, () => {
      req.staff = req.staffUser;
      return next();
    });
  }

  // Unauthenticated roster dump removed (privacy / G5). Login resolves identity via EID identify.
  app.get("/api/public/companies/:companyId/drivers", rateLimit(20, 60_000), async (req, res) => {
    const parsed = companySchema.safeParse(req.params.companyId);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća firma." });
    return res.status(410).json({
      success: false,
      code: "PUBLIC_DRIVER_DIRECTORY_DISABLED",
      error: "Javna lista vozača nije dostupna. Prijavite se preko EID."
    });
  });

  // Removed: this answered an unauthenticated caller with a driver's full name
  // for any guessed company/EID pair, and the 404 told them which employee ids
  // exist. Login now resolves the EID itself and never distinguishes an unknown
  // id from a wrong code.
  app.post("/api/public/drivers/identify", rateLimit(8, 5 * 60_000), async (_req, res) => {
    return res.status(410).json({
      success: false,
      code: "DRIVER_IDENTIFY_DISABLED",
      error: "Prijava se obavlja u jednom koraku: firma, EID i kod."
    });
  });

  app.post("/api/auth/driver-login", rateLimit(10, 5 * 60_000), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, code: "INVALID_LOGIN_PAYLOAD", error: "Nevažeći podaci za prijavu." });
    }
    const { companyId, loginCode } = parsed.data;
    if (!hasFirebase()) {
      return res.status(503).json({
        success: false,
        code: "FIREBASE_UNAVAILABLE",
        error: "Firebase nije konfigurisan."
      });
    }
    const companyRef = db().collection("companies").doc(companyId);
    const settingsSnap = await companyRef.collection("settings").doc("main").get();
    if (settingsSnap.exists && settingsSnap.data().status === "suspended") {
      return res.status(403).json({
        success: false,
        code: "COMPANY_SUSPENDED",
        error: "Pristup firmi je suspendovan. Obratite se podršci."
      });
    }

    const driverId = parsed.data.driverId || await resolveDriverIdByEid(companyRef, parsed.data.eid);
    if (!driverId) {
      await logAudit(companyId, "unknown", "driver_login_failed", { ip: getClientIp(req), reason: "unknown_identifier" });
      return res.status(401).json({
        success: false,
        code: "INVALID_LOGIN",
        error: "Pogrešan kod ili vozač nije pronađen."
      });
    }

    const profileRef = companyRef.collection("drivers").doc(driverId);
    const credentialRef = companyRef.collection("driver_credentials").doc(driverId);
    let mustChangeLoginCode = false;
    let userPayload = null;
    let outcome = "granted";
    let lockedUntil = null;
    try {
      await db().runTransaction(async (tx) => {
        const attemptedAt = now();
        const [profileSnap, credentialSnap] = await Promise.all([tx.get(profileRef), tx.get(credentialRef)]);
        const profile = profileSnap.exists ? profileSnap.data() : null;
        const credentials = credentialSnap.exists ? credentialSnap.data() : null;
        const lock = loginLockState(credentials, attemptedAt);
        if (lock.locked) {
          outcome = "locked";
          lockedUntil = lock.lockedUntil;
          return;
        }
        const activationReplayed = Boolean(profile && !profile.codeActivated && credentials?.activationUsedAt);
        const valid = profileSnap.exists
          && !activationReplayed
          && await verifyDriverLogin(profile, credentials, loginCode, attemptedAt);
        if (!valid) {
          outcome = "invalid";
          if (credentialSnap.exists) {
            const failure = nextFailureState(credentials, attemptedAt);
            lockedUntil = failure.lockedUntil;
            tx.update(credentialRef, failure);
          }
          return;
        }
        mustChangeLoginCode = !profile.codeActivated;
        tx.update(credentialRef, {
          failedLoginAttempts: 0,
          lockedUntil: null,
          ...(mustChangeLoginCode
            ? { activationUsedAt: admin().firestore.FieldValue.serverTimestamp() }
            : {})
        });
        userPayload = safeDriver(profileSnap);
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Driver login failed");
      return res.status(500).json({ success: false, code: "LOGIN_FAILED", error: "Prijava nije uspela." });
    }

    if (outcome === "locked") {
      await logAudit(companyId, driverId, "driver_login_locked_out", { ip: getClientIp(req) });
      return res.status(429).json({
        success: false,
        code: "ACCOUNT_LOCKED",
        retryAfterSeconds: Math.max(1, Math.ceil((lockedUntil.getTime() - now().getTime()) / 1000)),
        error: "Nalog je privremeno zaključan zbog previše pokušaja. Pokušajte kasnije."
      });
    }
    if (outcome === "invalid") {
      await logAudit(companyId, driverId, "driver_login_failed", {
        ip: getClientIp(req),
        ...(lockedUntil ? { lockedOut: true } : {})
      });
      if (lockedUntil) {
        return res.status(429).json({
          success: false,
          code: "ACCOUNT_LOCKED",
          retryAfterSeconds: Math.ceil(LOGIN_LOCK_MS / 1000),
          error: "Nalog je privremeno zaključan zbog previše pokušaja. Pokušajte kasnije."
        });
      }
      return res.status(401).json({
        success: false,
        code: "INVALID_LOGIN",
        error: "Pogrešan kod ili vozač nije pronađen."
      });
    }
    const token = await admin().auth().createCustomToken(driverId, {
      role: "driver",
      companyId,
      driverId,
      name: userPayload.name,
      mustChangeLoginCode
    });
    await logAudit(companyId, driverId, "driver_login_success", { mustChangeLoginCode, viaActivationOtp: mustChangeLoginCode });
    clearRateLimit(req);
    return res.json({ success: true, token, mustChangeLoginCode, user: userPayload });
  });

  app.post("/api/auth/driver/activate-personal-code", rateLimit(8, 10 * 60_000), async (req, res) => {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success || !hasFirebase()) return res.status(hasFirebase() ? 400 : 503).json({ success: false, error: "Aktivacija nije dostupna." });
    try {
      const decoded = await admin().auth().verifyIdToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), true);
      if (decoded.role !== "driver" || decoded.mustChangeLoginCode !== true) return res.status(403).json({ success: false, error: "Aktivacija nije dozvoljena." });
      const companyRef = db().collection("companies").doc(decoded.companyId);
      const profileRef = companyRef.collection("drivers").doc(decoded.uid);
      const credentialRef = companyRef.collection("driver_credentials").doc(decoded.uid);
      const [profileSnap, credentialSnap] = await Promise.all([profileRef.get(), credentialRef.get()]);
      const credentials = credentialSnap.exists ? credentialSnap.data() : null;
      if (!profileSnap.exists || !credentials || profileSnap.data().codeActivated) {
        await logAudit(decoded.companyId, decoded.uid, "driver_personal_code_activation_failed", { ip: getClientIp(req) });
        return res.status(401).json({ success: false, error: "Aktivacija nije dozvoljena." });
      }
      if (!isValidPersonalLoginCode(parsed.data.personalLoginCode)) {
        return res.status(400).json({ success: false, error: "Lični kod mora imati 5–12 cifara." });
      }
      const loginCodeHash = await hashSecret(parsed.data.personalLoginCode, COST);
      const activatedAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      batch.update(credentialRef, {
        loginCodeHash,
        activationCodeHash: admin().firestore.FieldValue.delete(),
        activationUsedAt: credentials.activationUsedAt || activatedAt,
        activatedAt
      });
      batch.update(profileRef, { codeActivated: true });
      await batch.commit();
      const token = await admin().auth().createCustomToken(decoded.uid, { role: "driver", companyId: decoded.companyId, driverId: decoded.uid, name: safeDriver(profileSnap).name, mustChangeLoginCode: false });
      await logAudit(decoded.companyId, decoded.uid, "driver_personal_code_activated", {});
      return res.json({ success: true, token, mustChangeLoginCode: false, user: safeDriver(profileSnap) });
    } catch { return res.status(401).json({ success: false, code: "INVALID_TOKEN", error: "Nevažeći token." }); }
  });

  // Legacy path — shared company-code activation is permanently removed.
  app.post("/api/auth/driver/activate-company-code", rateLimit(8, 10 * 60_000), async (_req, res) => {
    return res.status(410).json({
      success: false,
      code: "COMPANY_CODE_ACTIVATION_REMOVED",
      error: "Aktivacija firmnim kodom je uklonjena. Prijavite se jednokratnim SMS kodom, zatim postavite lični kod (5–12 cifara)."
    });
  });

  app.post("/api/driver/reports", rateLimit(20, 60_000), async (req, res) => {
    const parsed = quickReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća prijava." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const profileSnap = await companyRef.collection("drivers").doc(req.driver.uid).get();
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      const idempotencyKey = normalizeIdempotencyKey(parsed.data.idempotencyKey);
      const reportsRef = companyRef.collection("reports");
      const reportId = idempotencyKey
        ? `idem_${req.driver.uid}_${idempotencyKey}`
        : crypto.randomUUID();
      if (idempotencyKey) {
        const existingSnap = await reportsRef.doc(reportId).get();
        if (existingSnap.exists) {
          const existing = existingSnap.data() || {};
          if (existing.driverId && existing.driverId !== req.driver.uid) {
            return res.status(409).json({ success: false, error: "Konflikt idempotency ključa." });
          }
          return res.status(200).json({
            success: true,
            deduped: true,
            report: { ...existing, id: reportId, createdAt: null }
          });
        }
      }
      const { idempotencyKey: _ignored, clientCreatedAt, ...reportFields } = parsed.data;
      const report = {
        ...reportFields,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        status: "active",
        idempotencyKey: idempotencyKey || null,
        clientCreatedAt: clientCreatedAt || null,
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await reportsRef.doc(reportId).set(report);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_quick_report_created", {
        reportId, type: report.type, severity: report.severity, idempotencyKey: idempotencyKey || null
      });
      return res.status(201).json({ success: true, report: { ...report, id: reportId, createdAt: null } });
    } catch (error) {
      req.log?.error?.({ err: error }, "Čuvanje prijave vozača nije uspelo");
      return res.status(500).json({ success: false, error: "Prijava nije mogla biti poslata." });
    }
  });

  app.post("/api/driver/sos", rateLimit(5, 60_000), async (req, res) => {
    const parsed = sosSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeći SOS zahtev." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const profileSnap = await companyRef.collection("drivers").doc(req.driver.uid).get();
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      const sosId = crypto.randomUUID();
      const driverName = safeDriver(profileSnap).name;
      const groupId = profileSnap.data().groupId || profileSnap.data().lineId || null;
      const activatedAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      batch.set(companyRef.collection("sos").doc(sosId), {
        driverId: req.driver.uid, driver: driverName, bus: parsed.data.bus,
        groupId: groupId || null,
        status: "active", activatedAt
      });
      batch.set(companyRef.collection("settings").doc("sos"), {
        sosActive: true, sosDriverId: req.driver.uid, sosDriver: driverName,
        sosBus: parsed.data.bus, sosId, groupId: groupId || null, activatedAt
      });
      await batch.commit();
      await logAudit(req.driver.companyId, req.driver.uid, "driver_sos_created", {
        sosId, groupId: groupId || null
      });
      return res.status(201).json({ success: true, sos: { id: sosId, driver: driverName, bus: parsed.data.bus } });
    } catch (error) {
      req.log?.error?.({ err: error }, "Slanje SOS alarma nije uspelo");
      return res.status(500).json({ success: false, error: "SOS alarm nije mogao biti poslat." });
    }
  });

  app.post("/api/driver/lost-items", rateLimit(10, 60_000), async (req, res) => {
    const parsed = lostItemSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća prijava predmeta." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const profileSnap = await companyRef.collection("drivers").doc(req.driver.uid).get();
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      const idempotencyKey = normalizeIdempotencyKey(parsed.data.idempotencyKey);
      const itemsRef = companyRef.collection("lost_items");
      const itemId = idempotencyKey
        ? `idem_${req.driver.uid}_${idempotencyKey}`
        : crypto.randomUUID();
      if (idempotencyKey) {
        const existingSnap = await itemsRef.doc(itemId).get();
        if (existingSnap.exists) {
          const existing = existingSnap.data() || {};
          if (existing.driverId && existing.driverId !== req.driver.uid) {
            return res.status(409).json({ success: false, error: "Konflikt idempotency ključa." });
          }
          return res.status(200).json({
            success: true,
            deduped: true,
            item: {
              ...existing,
              id: itemId,
              createdAt: null,
              photo: publicLostItemPhoto(existing.photo)
            }
          });
        }
      }
      const photoCheck = validateLostItemPhoto(parsed.data.photo || null);
      if (!photoCheck.ok) {
        return res.status(400).json({
          success: false,
          code: "LOST_ITEM_PHOTO_INVALID",
          error: "Fotografija nije prihvaćena (tip, veličina ili EXIF).",
          reason: photoCheck.reason
        });
      }
      const status = DRIVER_CREATE_STATUSES.includes(parsed.data.status)
        ? parsed.data.status
        : "in_depot";
      const found = buildFoundAtFields({
        clientCreatedAt: parsed.data.foundAt || parsed.data.clientCreatedAt || null,
        date: parsed.data.date || null,
        time: parsed.data.time || null
      });
      const { idempotencyKey: _ignored, clientCreatedAt, photo: _photo, foundAt: _fa, ...itemFields } = parsed.data;
      const item = {
        ...itemFields,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        status,
        ...found,
        photo: photoCheck.photo,
        idempotencyKey: idempotencyKey || null,
        clientCreatedAt: clientCreatedAt || null,
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await itemsRef.doc(itemId).set(item);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_lost_item_created", {
        itemId, type: item.type, status: item.status, hasPhoto: !!photoCheck.photo,
        idempotencyKey: idempotencyKey || null
      });
      return res.status(201).json({
        success: true,
        item: {
          ...item,
          id: itemId,
          createdAt: null,
          photo: publicLostItemPhoto(item.photo)
        }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Prijava pronađenog predmeta nije uspela");
      return res.status(500).json({ success: false, error: "Predmet nije mogao biti prijavljen." });
    }
  });

  app.post("/api/driver/vacations", rateLimit(10, 60_000), async (req, res) => {
    const parsed = vacationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Neva\u017ee\u0107i zahtev za odmor." });
    const days = inclusiveDays(parsed.data.start, parsed.data.end);
    if (days < 1 || days > 366) {
      return res.status(400).json({ success: false, error: "Period odmora mora biti izme\u0111u 1 i 366 dana." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const [profileSnap, existingSnap] = await Promise.all([
        companyRef.collection("drivers").doc(req.driver.uid).get(),
        companyRef.collection("vacations").where("driverId", "==", req.driver.uid).get()
      ]);
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog voza\u010da nije aktivan." });
      }
      const overlap = existingSnap.docs.some((doc) => {
        const vacation = doc.data();
        return ["pending", "approved", "Na \u010dekanju", "Odobreno"].includes(vacation.status)
          && vacationOverlaps(parsed.data, vacation);
      });
      if (overlap) return res.status(409).json({ success: false, error: "Ve\u0107 postoji zahtev koji se preklapa sa izabranim periodom." });

      const vacationId = crypto.randomUUID();
      const vacation = {
        ...parsed.data,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        days,
        status: "pending",
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await companyRef.collection("vacations").doc(vacationId).set(vacation);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_vacation_requested", {
        vacationId, start: vacation.start, end: vacation.end, type: vacation.type
      });
      return res.status(201).json({ success: true, vacation: { ...vacation, id: vacationId, createdAt: null } });
    } catch (error) {
      req.log?.error?.({ err: error }, "\u010cuvanje zahteva za odmor nije uspelo");
      return res.status(500).json({ success: false, error: "Zahtev za odmor nije mogao biti poslat." });
    }
  });

  app.put("/api/driver/messages/:messageId/read", async (req, res) => {
    const parsed = messageIdSchema.safeParse(req.params.messageId);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća poruka." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const [profileSnap, snapshot] = await Promise.all([
        companyRef.collection("drivers").doc(req.driver.uid).get(),
        companyRef.collection("messages").doc(parsed.data).get()
      ]);
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Poruka nije pronađena." });
      const messageRef = snapshot.ref;
      const message = snapshot.data();
      if (message.broadcast !== true && message.recipientDriverId !== req.driver.uid) {
        return res.status(403).json({ success: false, error: "Pristup poruci nije dozvoljen." });
      }
      const update = {
        readBy: admin().firestore.FieldValue.arrayUnion(req.driver.uid),
        readAt: admin().firestore.FieldValue.serverTimestamp()
      };
      const plan = planMessageRead(message, req.driver.uid);
      if (plan.ok && plan.patch) {
        if (plan.patch.status) update.status = plan.patch.status;
        if (message.broadcast !== true) update.read = true;
      } else if (message.broadcast !== true) {
        update.read = true;
      }
      await messageRef.update(update);
      await logAudit(req.driver.companyId, req.driver.uid, "message_read", {
        messageId: parsed.data,
        requiresAck: message.requiresAck === true
      }).catch(() => {});
      return res.json({ success: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Potvrda poruke nije uspela");
      return res.status(500).json({ success: false, error: "Poruka nije mogla biti potvrđena." });
    }
  });

  app.put("/api/driver/messages/:messageId/archive", async (req, res) => {
    const parsed = messageIdSchema.safeParse(req.params.messageId);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća poruka." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const [profileSnap, snapshot] = await Promise.all([
        companyRef.collection("drivers").doc(req.driver.uid).get(),
        companyRef.collection("messages").doc(parsed.data).get()
      ]);
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Poruka nije pronađena." });
      const message = snapshot.data();
      if (message.broadcast !== true && message.recipientDriverId !== req.driver.uid) {
        return res.status(403).json({ success: false, error: "Pristup poruci nije dozvoljen." });
      }
      if (message.requiresAck === true && !message.ackedAt) {
        return res.status(409).json({
          success: false,
          code: "ACK_REQUIRED",
          error: "Kritična poruka zahteva potvrdu čitanja pre arhiviranja."
        });
      }
      await snapshot.ref.update({
        archivedByIds: admin().firestore.FieldValue.arrayUnion(req.driver.uid),
        archivedAt: admin().firestore.FieldValue.serverTimestamp()
      });
      return res.json({ success: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Arhiviranje poruke nije uspelo");
      return res.status(500).json({ success: false, error: "Poruka nije mogla biti arhivirana." });
    }
  });

  app.put("/api/driver/messages/:messageId/ack", rateLimit(30, 60_000), async (req, res) => {
    const parsed = messageIdSchema.safeParse(req.params.messageId);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća poruka." });
    try {
      const companyRef = db().collection("companies").doc(req.driver.companyId);
      const [profileSnap, snapshot] = await Promise.all([
        companyRef.collection("drivers").doc(req.driver.uid).get(),
        companyRef.collection("messages").doc(parsed.data).get()
      ]);
      if (!profileSnap.exists || profileSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog vozača nije aktivan." });
      }
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Poruka nije pronađena." });
      const message = snapshot.data();
      if (message.broadcast !== true && message.recipientDriverId !== req.driver.uid) {
        return res.status(403).json({ success: false, error: "Pristup poruci nije dozvoljen." });
      }
      const plan = planMessageAck(message, req.driver.uid);
      if (!plan.ok) {
        if (plan.reason === "ack_not_required") {
          return res.status(400).json({
            success: false,
            code: "ACK_NOT_REQUIRED",
            error: "Poruka ne zahteva potvrdu čitanja."
          });
        }
        return res.status(400).json({ success: false, error: "Potvrda nije moguća." });
      }
      if (plan.already) {
        return res.json({ success: true, already: true });
      }
      await snapshot.ref.update({
        status: "read",
        read: message.broadcast !== true,
        ackedBy: req.driver.uid,
        ackedAt: admin().firestore.FieldValue.serverTimestamp(),
        readAt: admin().firestore.FieldValue.serverTimestamp(),
        readBy: admin().firestore.FieldValue.arrayUnion(req.driver.uid)
      });
      await logAudit(req.driver.companyId, req.driver.uid, "message_ack", {
        messageId: parsed.data
      });
      return res.json({ success: true, already: false });
    } catch (error) {
      req.log?.error?.({ err: error }, "Potvrda čitanja poruke nije uspela");
      return res.status(500).json({ success: false, error: "Potvrda čitanja nije uspela." });
    }
  });

  app.post("/api/driver/shift-confirmations", rateLimit(10, 60_000), async (req, res) => {
    const parsed = shiftConfirmationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća potvrda smene." });
    try {
      const policy = req.driverWorkPolicy || await loadDriverWorkPolicy(req.driver);
      const confirmationTargets = policy?.confirmationTargets || [];
      const allowed = new Map(confirmationTargets.map((target) => [target.date, target]));
      if (parsed.data.dates.some((date) => !allowed.has(date))) {
        return res.status(403).json({ success: false, error: "Potvrditi se mogu samo ponuđene naredne smene." });
      }
      const companyRef = policy?.companyRef || db().collection("companies").doc(req.driver.companyId);
      const sourceShiftDate = policy?.shift?.date || null;
      const confirmedAt = admin().firestore.FieldValue.serverTimestamp();
      const boundRevisions = await db().runTransaction(async (tx) => {
        const dates = parsed.data.dates;
        // 1) All live shift reads first.
        const shiftRefs = dates.map((date) =>
          companyRef.collection("shifts").doc(shiftDocumentId(req.driver.uid, date))
        );
        const shiftSnaps = typeof tx.getAll === "function"
          ? await tx.getAll(...shiftRefs)
          : await Promise.all(shiftRefs.map((ref) => tx.get(ref)));

        // 2) Unique group/month lock scopes from live shifts.
        const lockScopes = new Map();
        for (let i = 0; i < dates.length; i += 1) {
          const live = shiftSnaps[i].exists ? shiftSnaps[i].data() : null;
          const groupId = live?.groupId
            || policy?.shift?.groupId
            || req.driver?.groupId
            || null;
          const month = scheduleMonthFromDate(dates[i]);
          if (groupId && month) lockScopes.set(`${groupId}|${month}`, { groupId, month });
        }

        // 3) Read all locks (+ jobs) before any write.
        const gates = [];
        for (const scope of lockScopes.values()) {
          gates.push(await readMonthlyImportLockInTx(tx, companyRef, scope.groupId, scope.month));
        }

        // 4) Validate every import gate — still no writes.
        for (const gate of gates) {
          if (!gate.decision.ok) {
            const error = new Error(gate.decision.code);
            error.code = gate.decision.code;
            error.recoveryRequired = gate.decision.recoveryRequired === true;
            error.retryable = gate.decision.retryable === true;
            throw error;
          }
        }

        // 5) Validate every confirmation target against LIVE canonical fingerprint.
        const revisions = {};
        const pending = [];
        for (let i = 0; i < dates.length; i += 1) {
          const date = dates[i];
          const target = allowed.get(date);
          const snap = shiftSnaps[i];
          if (!snap.exists) {
            const error = new Error("no_live_shift");
            error.code = "SHIFT_MISSING";
            throw error;
          }
          const live = snap.data() || {};
          // Canonical writers set shiftFingerprint=null — compute from LIVE fields.
          const liveFingerprint = fingerprintShift({
            date: live.date || date,
            type: live.type,
            start: live.start,
            end: live.end,
            routeCode: live.routeCode,
            bus: live.bus,
            name: live.name
          });
          if (target?.fingerprint && liveFingerprint !== target.fingerprint) {
            const error = new Error("confirmation_stale");
            error.code = "CONFIRMATION_STALE";
            throw error;
          }
          if (target?.revision != null
            && Number(target.revision) !== currentRevision(live)) {
            const error = new Error("confirmation_stale");
            error.code = "CONFIRMATION_STALE";
            throw error;
          }
          const boundRevision = currentRevision(live);
          revisions[date] = boundRevision;
          pending.push({ date, snap, target, boundRevision });
        }

        // 6) All writes after all reads and gate decisions.
        for (const gate of gates) {
          if (gate.decision.clearLock) tx.delete(gate.lockRef);
        }
        for (const item of pending) {
          tx.set(companyRef.collection("shift_confirmations").doc(`${req.driver.uid}_${item.date}`), {
            driverId: req.driver.uid,
            date: item.date,
            shiftFingerprint: item.target.fingerprint,
            confirmationBoundRevision: item.boundRevision,
            confirmedAt,
            confirmationSourceShiftDate: sourceShiftDate
          }, { merge: true });
          // Update existing shift only — never merge-create a phantom assignment.
          tx.set(item.snap.ref, {
            confirmedByDriver: true,
            confirmedAt,
            shiftFingerprint: item.target.fingerprint,
            confirmationBoundRevision: item.boundRevision,
            confirmationSourceShiftDate: sourceShiftDate,
            updatedAt: confirmedAt
          }, { merge: true });
        }
        return revisions;
      });

      if (confirmationScheduler) {
        const fingerprints = Object.fromEntries(
          parsed.data.dates.map((date) => [date, allowed.get(date)?.fingerprint || null])
        );
        await confirmationScheduler.markConfirmed({
          companyId: req.driver.companyId,
          driverId: req.driver.uid,
          dates: parsed.data.dates,
          fingerprints
        }).catch(() => {});
      }
      await logAudit(req.driver.companyId, req.driver.uid, "driver_shifts_confirmed", {
        dates: parsed.data.dates,
        sourceShiftDate,
        boundRevisions
      });
      return res.json({ success: true, confirmedDates: parsed.data.dates });
    } catch (error) {
      if (error.code === "CONFIRMATION_STALE") {
        return res.status(409).json({
          success: false,
          code: "CONFIRMATION_STALE",
          error: "Plan smene je izmenjen. Osvežite potvrdu i pokušajte ponovo."
        });
      }
      if (error.code === "SHIFT_MISSING") {
        return res.status(409).json({
          success: false,
          code: "SHIFT_MISSING",
          error: "Smena nije dostupna za potvrdu."
        });
      }
      if (error.code === "MONTHLY_IMPORT_IN_PROGRESS" || error.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED") {
        return res.status(409).json({
          success: false,
          code: error.code,
          retryable: error.retryable === true,
          recoveryRequired: error.recoveryRequired === true,
          error: "Uvoz mesečnog plana je u toku ili zahteva proveru. Pokušajte kasnije."
        });
      }
      req.log?.error?.({ err: error }, "Potvrda smena nije uspela");
      return res.status(500).json({ success: false, error: "Smene nisu mogle biti potvr\u0111ene." });
    }
  });

  app.post("/api/staff/drivers/import", rateLimit(5, 60_000), requireStaff, async (req, res) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeći CSV zahtev." });
    if (req.staff.companyId !== parsed.data.companyId) return res.status(403).json({ success: false, error: "Pristup drugoj firmi nije dozvoljen." });
    if (req.staff.role !== "company_admin") return res.status(403).json({ success: false, error: "Samo administrator firme može uvoziti vozačke naloge." });
    try {
      const drivers = parseDriverCsv(parsed.data.csv);
      const legacyCompanyCodeIgnored = drivers.legacyCompanyCodeIgnored === true;
      const FieldValue = admin().firestore.FieldValue;
      // OTP hashes prepared outside the tx; EID uniqueness + writes use D24.2 guard.
      // D24.2.1-A: CSV company_code is ignored — never hashed or written.
      const preparedRows = await Promise.all(drivers.map(async (driver) => {
        const otp = generateActivationOtp();
        const driverId = crypto.randomUUID();
        const createdAt = FieldValue.serverTimestamp();
        return {
          driverId,
          driver,
          otp,
          profile: safeProfilePayload(driver, parsed.data.groupId, parsed.data.companyId, createdAt),
          credentials: credentialPayload(driver, {
            companyCodeHash: null,
            activationCodeHash: await hashSecret(otp, COST),
            activationExpiresAt: activationExpiresAt().toISOString(),
            createdAt
          })
        };
      }));

      try {
        await commitImportedDriversWithIdentityGuard({
          db: db(),
          FieldValue,
          companyId: parsed.data.companyId,
          groupId: parsed.data.groupId,
          prepared: preparedRows.map((row) => ({
            driverId: row.driverId,
            profile: row.profile,
            credentials: row.credentials
          }))
        });
      } catch (err) {
        if (err?.code === "group-not-found") {
          return res.status(404).json({ success: false, error: "Izabrana grupa nije pronađena." });
        }
        if (err?.code === "license-suspended") {
          return res.status(403).json({ success: false, code: "license-suspended", error: "Licenca firme je suspendovana." });
        }
        if (err?.code === "license-unavailable") {
          return res.status(403).json({ success: false, code: "license-unavailable", error: "Licenca firme nije aktivna." });
        }
        if (err?.code === "EID_EXISTS") {
          return res.status(409).json({
            success: false,
            code: "EID_EXISTS",
            error: "Vozač sa ovim EID-om već postoji."
          });
        }
        if (err?.code === "DRIVER_LIMIT_REACHED") {
          return res.status(409).json({
            success: false,
            code: "DRIVER_LIMIT_REACHED",
            error: `Licenca dozvoljava najviše ${err.maxDrivers} vozača.`,
            maxDrivers: err.maxDrivers,
            licenseType: err.licenseType,
            packageLabel: err.packageLabel
          });
        }
        if (err?.code === "import-too-large") {
          return res.status(400).json({ success: false, error: err.message });
        }
        throw err;
      }

      const smsResults = [];
      for (const item of preparedRows) {
        const sms = await smsProvider.sendActivationSms({
          phone: item.driver.phone,
          companyId: parsed.data.companyId,
          driverId: item.driverId,
          portalUrl: `/driver.html?company=${encodeURIComponent(parsed.data.companyId)}`,
          otp: item.otp
        });
        // Plaintext OTP is never written to audit or response.
        smsResults.push({
          driverId: item.driverId,
          status: sms.status,
          reason: sms.reason || null,
          providerMessageId: sms.providerMessageId
        });
        item.otp = null;
      }
      await logAudit(parsed.data.companyId, req.staff.uid, "driver_csv_import", {
        count: drivers.length,
        groupId: parsed.data.groupId,
        smsProvider: smsProvider.mode,
        smsQueued: smsResults.filter((row) => row.status === "stub_queued" || row.status === "sent").length,
        legacyCompanyCodeIgnored
      });
      return res.status(201).json({
        success: true,
        imported: drivers.length,
        legacyCompanyCodeIgnored,
        activation: {
          otpTtlHours: 24,
          smsProvider: smsProvider.mode,
          deliveries: smsResults
        }
      });
    } catch (error) { return res.status(400).json({ success: false, error: error.message }); }
  });

  app.post("/api/staff/drivers/:driverId/resend-activation", rateLimit(8, 10 * 60_000), requireStaff, async (req, res) => {
    const driverId = driverIdSchema.safeParse(req.params.driverId);
    if (!driverId.success) return res.status(400).json({ success: false, error: "Nevažeći vozač." });
    if (req.staff.role !== "company_admin") {
      return res.status(403).json({ success: false, error: "Samo administrator firme može slati aktivacioni kod." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const profileRef = companyRef.collection("drivers").doc(driverId.data);
      const credentialRef = companyRef.collection("driver_credentials").doc(driverId.data);
      const [profileSnap, credentialSnap] = await Promise.all([profileRef.get(), credentialRef.get()]);
      if (!profileSnap.exists || !credentialSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      }
      if (profileSnap.data().codeActivated) {
        return res.status(409).json({ success: false, error: "Nalog je već aktiviran." });
      }
      const otp = generateActivationOtp();
      const activationCodeHash = await hashSecret(otp, COST);
      const expiresAt = activationExpiresAt();
      await credentialRef.update({
        activationCodeHash,
        activationExpiresAt: expiresAt.toISOString(),
        activationUsedAt: null
      });
      const sms = await smsProvider.sendActivationSms({
        phone: profileSnap.data().phone,
        companyId: req.staff.companyId,
        driverId: driverId.data,
        portalUrl: `/driver.html?company=${encodeURIComponent(req.staff.companyId)}`,
        otp
      });
      await logAudit(req.staff.companyId, req.staff.uid, "driver_activation_resent", {
        driverId: driverId.data,
        smsStatus: sms.status,
        smsProvider: smsProvider.mode
      });
      return res.json({
        success: true,
        activation: {
          otpTtlHours: 24,
          smsProvider: smsProvider.mode,
          smsStatus: sms.status
        }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Ponovno slanje aktivacije nije uspelo");
      return res.status(500).json({ success: false, error: "Aktivacioni kod nije mogao biti poslat." });
    }
  });

  app.put("/api/staff/drivers/:driverId/status", rateLimit(20, 5 * 60_000), requireStaff, async (req, res) => {
    const driverId = driverIdSchema.safeParse(req.params.driverId);
    const status = driverStatusSchema.safeParse(req.body);
    if (!driverId.success || !status.success) {
      return res.status(400).json({ success: false, error: "Nevažeći status vozača." });
    }
    if (req.staff.role !== "company_admin") {
      return res.status(403).json({ success: false, error: "Samo administrator firme može menjati status vozača." });
    }
    try {
      const profileRef = db().collection("companies").doc(req.staff.companyId)
        .collection("drivers").doc(driverId.data);
      const profile = await profileRef.get();
      if (!profile.exists) return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      const active = status.data.active;
      await profileRef.update({
        active,
        statusChangedAt: admin().firestore.FieldValue.serverTimestamp(),
        statusChangedBy: req.staff.uid
      });
      if (!active) {
        try { await admin().auth().revokeRefreshTokens(driverId.data); }
        catch (error) { req.log?.warn?.({ err: error, driverId: driverId.data }, "Opoziv vozačkih tokena nije uspeo"); }
      }
      await logAudit(req.staff.companyId, req.staff.uid, active ? "driver_activated" : "driver_deactivated", {
        driverId: driverId.data
      });
      return res.json({ success: true, active });
    } catch (error) {
      req.log?.error?.({ err: error }, "Promena statusa vozača nije uspela");
      return res.status(500).json({ success: false, error: "Promena statusa vozača nije uspela." });
    }
  });

  /** Soft-remove driver from a line/group list — keeps company roster (active unchanged). */
  app.put("/api/staff/drivers/:driverId/line", rateLimit(30, 5 * 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može skidati vozača sa linije." });
    }
    const driverId = driverIdSchema.safeParse(req.params.driverId);
    const body = lineDetachSchema.safeParse(req.body);
    if (!driverId.success || !body.success) {
      return res.status(400).json({ success: false, error: "Nevažeći zahtev za skidanje sa linije." });
    }
    const targetGroupId = body.data.groupId;
    if (!dispatcherCanAccessGroup(req.staff.groups, targetGroupId)) {
      return res.status(403).json({ success: false, error: "Linija nije u dodeljenim grupama." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const profileRef = companyRef.collection("drivers").doc(driverId.data);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      }
      const driver = profileSnap.data() || {};
      const currentGroup = String(driver.groupId || driver.lineId || "").trim();
      const known = Array.isArray(driver.knownGroupIds)
        ? [...new Set(driver.knownGroupIds.map((g) => String(g || "").trim()).filter(Boolean))]
        : (currentGroup ? [currentGroup] : []);
      const groupsSnap = await companyRef.collection("groups").get();
      const detachIds = new Set([targetGroupId]);
      groupsSnap.forEach((doc) => {
        const data = doc.data() || {};
        if (doc.id === targetGroupId || String(data.lineId || "") === targetGroupId) {
          detachIds.add(doc.id);
        }
      });
      const onLine = detachIds.has(currentGroup)
        || detachIds.has(String(driver.lineId || "").trim())
        || (Array.isArray(driver.groupIds) && driver.groupIds.some((g) => detachIds.has(String(g))))
        || known.some((g) => detachIds.has(g));
      if (!onLine) {
        return res.status(409).json({ success: false, error: "Vozač nije na toj liniji." });
      }
      const knownAccess = known.some((g) => dispatcherCanAccessGroup(req.staff.groups, g));
      if (currentGroup && !dispatcherCanAccessGroup(req.staff.groups, currentGroup)
        && !dispatcherCanAccessGroup(req.staff.groups, String(driver.lineId || ""))
        && !knownAccess) {
        // Allow when current membership is a subgroup of an assigned line.
        const currentIsSub = [...detachIds].some((id) => dispatcherCanAccessGroup(req.staff.groups, id));
        if (!currentIsSub) {
          return res.status(403).json({ success: false, error: "Vozač nije u dodeljenoj grupi." });
        }
      }
      const remaining = known.filter((g) => !detachIds.has(g));
      if (remaining.length) {
        const nextHome = remaining.includes(currentGroup) ? currentGroup : remaining[0];
        await profileRef.update({
          groupId: nextHome,
          lineId: nextHome,
          knownGroupIds: remaining.includes(nextHome) ? remaining : [nextHome, ...remaining],
          subGroup: admin().firestore.FieldValue.delete(),
          groupIds: [],
          lineDetachedAt: admin().firestore.FieldValue.serverTimestamp(),
          lineDetachedBy: req.staff.uid,
          lineDetachedFrom: targetGroupId
        });
        await logAudit(req.staff.companyId, req.staff.uid, "driver_detached_from_group", {
          driverId: driverId.data,
          groupId: targetGroupId,
          previousGroupId: currentGroup || null,
          remainingGroupIds: remaining,
          reason: body.data.reason || null,
          note: body.data.note || null
        });
        return res.json({
          success: true,
          driverId: driverId.data,
          groupId: nextHome,
          lineId: nextHome,
          knownGroupIds: remaining,
          detachedFrom: targetGroupId
        });
      }
      await profileRef.update({
        groupId: admin().firestore.FieldValue.delete(),
        lineId: admin().firestore.FieldValue.delete(),
        subGroup: admin().firestore.FieldValue.delete(),
        groupIds: [],
        knownGroupIds: [],
        lineDetachedAt: admin().firestore.FieldValue.serverTimestamp(),
        lineDetachedBy: req.staff.uid,
        lineDetachedFrom: targetGroupId
      });
      await logAudit(req.staff.companyId, req.staff.uid, "driver_detached_from_group", {
        driverId: driverId.data,
        groupId: targetGroupId,
        previousGroupId: currentGroup || null,
        reason: body.data.reason || null,
        note: body.data.note || null
      });
      return res.json({
        success: true,
        driverId: driverId.data,
        groupId: null,
        lineId: null,
        knownGroupIds: [],
        detachedFrom: targetGroupId
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Skidanje vozača sa linije nije uspelo");
      return res.status(500).json({ success: false, error: "Vozač nije mogao biti skinut sa linije." });
    }
  });

  /** Dispatcher-editable "Streckenkenntnis" — full company line list, never eid/pin/companyCode. */
  app.put("/api/staff/drivers/:driverId/known-groups", rateLimit(30, 5 * 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može urediti poznate linije vozača." });
    }
    const driverId = driverIdSchema.safeParse(req.params.driverId);
    const body = knownGroupsUpdateSchema.safeParse(req.body);
    if (!driverId.success || !body.success) {
      return res.status(400).json({ success: false, error: "Nevažeći zahtev za poznate linije." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const profileRef = companyRef.collection("drivers").doc(driverId.data);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      }
      const driver = profileSnap.data() || {};
      const homeGroupId = String(driver.groupId || driver.lineId || "").trim();
      const requested = normalizeGroupIds(body.data.knownGroupIds);
      await assertCompanyGroupsExist(companyRef, requested);
      const knownGroupIds = homeGroupId && !requested.includes(homeGroupId)
        ? [homeGroupId, ...requested]
        : requested;
      await profileRef.update({ knownGroupIds });
      await logAudit(req.staff.companyId, req.staff.uid, "driver_known_groups_updated", {
        driverId: driverId.data,
        knownGroupIds
      });
      return res.json({ success: true, driverId: driverId.data, knownGroupIds });
    } catch (error) {
      if (error.code === "group-not-found") {
        return res.status(400).json({ success: false, error: error.message });
      }
      req.log?.error?.({ err: error }, "Ažuriranje poznatih linija nije uspelo");
      return res.status(500).json({ success: false, error: "Poznate linije vozača nisu sačuvane." });
    }
  });

  app.put("/api/staff/vacations/:vacationId/status", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može obrađivati zahteve za odmor." });
    }
    const vacationId = vacationIdSchema.safeParse(req.params.vacationId);
    const status = vacationStatusSchema.safeParse(req.body);
    if (!vacationId.success || !status.success) {
      return res.status(400).json({ success: false, error: "Neva\u017ee\u0107i status zahteva." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const vacationRef = companyRef.collection("vacations").doc(vacationId.data);
      const snapshot = await vacationRef.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Zahtev nije prona\u0111en." });
      const vacation = snapshot.data() || {};
      const currentStatus = vacation.status;
      if (!["pending", "Na \u010dekanju"].includes(currentStatus)) {
        return res.status(409).json({ success: false, error: "Zahtev je ve\u0107 obra\u0111en." });
      }
      let groupId = vacation.groupId || vacation.lineId || null;
      if (!groupId && vacation.driverId) {
        const driverSnap = await companyRef.collection("drivers").doc(vacation.driverId).get();
        if (driverSnap.exists) {
          const driver = driverSnap.data() || {};
          groupId = driver.groupId || driver.lineId || null;
        }
      }
      if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Zahtev nije u dodeljenoj grupi." });
      }
      await vacationRef.update({
        status: status.data.status,
        reviewedAt: admin().firestore.FieldValue.serverTimestamp(),
        reviewedBy: req.staff.uid
      });
      await logAudit(req.staff.companyId, req.staff.uid, `vacation_${status.data.status}`, {
        vacationId: vacationId.data, driverId: vacation.driverId || null, groupId: groupId || null
      });
      return res.json({ success: true, status: status.data.status });
    } catch (error) {
      req.log?.error?.({ err: error }, "Obrada zahteva za odmor nije uspela");
      return res.status(500).json({ success: false, error: "Zahtev nije mogao biti obrađen." });
    }
  });

  app.post("/api/staff/messages", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    if (!["dispatcher", "company_admin"].includes(req.staff.role)) {
      return res.status(403).json({ success: false, error: "Pristup odbijen." });
    }
    const parsed = staffMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: "Nevažeća poruka." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const [groupsSnap, staffUserSnap] = await Promise.all([
        companyRef.collection("groups").get(),
        companyRef.collection("users").doc(req.staff.uid).get()
      ]);
      const groups = groupsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

      // Soft-pilot (Ch17): dispatcher loads only assigned-group drivers; CA keeps tenant-wide.
      let driverDocs = [];
      if (req.staff.role === "dispatcher") {
        const assigned = staffUserSnap.exists && Array.isArray(staffUserSnap.data().groups)
          ? staffUserSnap.data().groups
          : (req.staff.groups || []);
        const groupIds = [...new Set((assigned || []).filter(Boolean))].slice(0, 40);
        driverDocs = await loadDriverDocsForGroups(companyRef, groupIds);
      } else {
        const driversSnap = await companyRef.collection("drivers").get();
        driverDocs = driversSnap.docs;
      }

      const drivers = driverDocs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: safeDriver(doc).name || doc.id,
          groupId: data.groupId || data.lineId || null,
          lineId: data.lineId || null,
          knownGroupIds: Array.isArray(data.knownGroupIds) ? data.knownGroupIds : [],
          active: data.active !== false
        };
      });
      const resolved = resolveStaffMessageTargets({
        mode: parsed.data.mode,
        recipientDriverId: parsed.data.recipientDriverId,
        groupId: parsed.data.groupId,
        groupIds: parsed.data.groupIds,
        displayScope: parsed.data.displayScope,
        staff: req.staff,
        drivers,
        groups
      });
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, error: resolved.error });
      }
      if (resolved.targets.length > 200) {
        return res.status(400).json({ success: false, error: "Previše primalaca u jednom slanju (max 200)." });
      }

      const now = new Date();
      const type = messageTypeForTemplate(parsed.data.template);
      const requiresAck = shouldRequireAck({
        requiresAck: parsed.data.requiresAck,
        type,
        template: parsed.data.template
      });
      const senderName = parsed.data.senderName
        || staffUserSnap.data()?.name
        || staffUserSnap.data()?.displayName
        || req.staff.email
        || "Staff";
      const createdAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      const messages = resolved.targets.map((target) => {
        const id = newMessageId();
        const doc = buildStaffMessageDoc({
          id,
          now,
          senderName,
          senderUid: req.staff.uid,
          senderLang: parsed.data.senderLang,
          template: parsed.data.template,
          detail: parsed.data.detail,
          type,
          scope: resolved.scope,
          broadcast: resolved.broadcast,
          recipientName: target.driverName,
          recipientDriverId: target.driverId,
          groupId: target.groupId || resolved.groupId || null,
          groupIds: resolved.groupIds || null,
          requiresAck,
          idempotencyKey: parsed.data.idempotencyKey || null
        });
        batch.set(companyRef.collection("messages").doc(id), { ...doc, createdAt });
        return { ...doc, createdAt: null };
      });
      await batch.commit();

      await logAudit(req.staff.companyId, req.staff.uid, "staff_message_sent", {
        mode: parsed.data.mode,
        template: parsed.data.template,
        scope: resolved.scope,
        broadcast: resolved.broadcast === true,
        groupId: resolved.groupId || null,
        groupIds: resolved.groupIds || null,
        requiresAck,
        messageCount: messages.length,
        messageIds: messages.map((message) => message.id),
        recipientDriverIds: messages
          .map((message) => message.recipientDriverId)
          .filter(Boolean)
          .slice(0, 12)
      });

      return res.json({ success: true, messages });
    } catch (error) {
      req.log?.error?.({ err: error }, "Slanje poruke nije uspelo");
      return res.status(500).json({ success: false, error: "Poruka nije mogla biti poslata." });
    }
  });

  app.put("/api/staff/messages/:messageId/archive", rateLimit(40, 60_000), requireStaff, async (req, res) => {
    if (!["dispatcher", "company_admin"].includes(req.staff.role)) {
      return res.status(403).json({ success: false, error: "Pristup odbijen." });
    }
    const parsed = messageIdSchema.safeParse(req.params.messageId);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeća poruka." });
    // Enumeration-safe: nonexistent / foreign / unscoped all look identical to Dispo.
    const messageUnavailable = () => res.status(404).json({
      success: false,
      code: "MESSAGE_UNAVAILABLE",
      error: "Poruka nije dostupna."
    });
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const snapshot = await companyRef.collection("messages").doc(parsed.data).get();
      if (!snapshot.exists) return messageUnavailable();
      const message = snapshot.data();
      if (req.staff.role === "dispatcher") {
        const groups = Array.isArray(req.staff.groups) ? req.staff.groups : [];
        let gid = message.groupId || null;
        if (message.broadcast === true && message.recipientDriverId == null) {
          return messageUnavailable();
        }
        if (!gid && message.recipientDriverId) {
          const driverSnap = await companyRef.collection("drivers").doc(String(message.recipientDriverId)).get();
          if (driverSnap.exists) {
            gid = driverSnap.data().groupId || driverSnap.data().lineId || null;
          }
        }
        if (!gid || !groups.includes(gid)) {
          return messageUnavailable();
        }
      }
      await snapshot.ref.update({
        dispArchivedByIds: admin().firestore.FieldValue.arrayUnion(req.staff.uid),
        dispArchivedAt: admin().firestore.FieldValue.serverTimestamp()
      });
      await logAudit(req.staff.companyId, req.staff.uid, "staff_message_archived", {
        messageId: parsed.data
      });
      return res.json({ success: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Arhiviranje staff poruke nije uspelo");
      return res.status(500).json({ success: false, error: "Poruka nije mogla biti arhivirana." });
    }
  });

  app.put("/api/staff/map-access", rateLimit(20, 60_000), requireStaff, async (req, res) => {
    if (!["dispatcher", "company_admin"].includes(req.staff.role)) {
      return res.status(403).json({ success: false, error: "Pristup odbijen." });
    }
    try {
      await logAudit(req.staff.companyId, req.staff.uid, "staff_map_access", {
        role: req.staff.role,
        // Never log coordinates — only that the live map was opened.
        surface: "dispatcher_live_map"
      });
      return res.json({ success: true });
    } catch (error) {
      req.log?.error?.({ err: error }, "Audit pristupa mapi nije uspeo");
      return res.status(500).json({ success: false, error: "Pristup mapi nije mogao biti zabeležen." });
    }
  });

  app.put("/api/staff/sos/resolve", rateLimit(20, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može rešiti SOS alarm." });
    }
    const parsedBody = sosResolveSchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return res.status(400).json({ success: false, error: "Beleska o resenju je predugacka." });
    }
    const resolutionNote = parsedBody.data.note || SOS_DEFAULT_RESOLUTION_NOTE;
    // Enumeration-safe: no SOS and foreign-group SOS share the same public response.
    const sosUnavailable = () => res.status(409).json({
      success: false,
      code: "SOS_UNAVAILABLE",
      error: "Nema aktivnog SOS alarma."
    });
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const settingsRef = companyRef.collection("settings").doc("sos");
      const settingsSnap = await settingsRef.get();
      if (!settingsSnap.exists || settingsSnap.data().sosActive !== true) {
        return sosUnavailable();
      }
      const settings = settingsSnap.data() || {};
      const sosId = typeof settings.sosId === "string" ? settings.sosId : null;
      let groupId = settings.groupId || null;
      if (!groupId && settings.sosDriverId) {
        const driverSnap = await companyRef.collection("drivers").doc(String(settings.sosDriverId)).get();
        if (driverSnap.exists) {
          groupId = driverSnap.data().groupId || driverSnap.data().lineId || null;
        }
      }
      // A driver with no group raises an SOS with groupId=null, and
      // dispatcherCanAccessGroup(groups, null) returns false — which left the alarm
      // unclearable by ANY dispatcher: banner and siren stuck until a redeploy.
      // An ungrouped alarm stays tenant-scoped (requireStaff + same companyId) and is
      // resolvable by any dispatcher of that tenant; group scoping still applies when
      // the SOS actually carries a group.
      if (groupId && !dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return sosUnavailable();
      }
      const resolvedAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      if (sosId) {
        const sosRef = companyRef.collection("sos").doc(sosId);
        const sosSnap = await sosRef.get();
        if (sosSnap.exists) {
          batch.update(sosRef, {
            status: "resolved",
            resolvedAt,
            resolvedBy: req.staff.uid,
            resolutionNote
          });
        }
      }
      batch.set(settingsRef, {
        sosActive: false,
        sosDriverId: null,
        sosDriver: "",
        sosBus: "",
        sosId: null,
        groupId: null,
        resolvedAt,
        resolvedBy: req.staff.uid
      }, { merge: true });
      await batch.commit();
      await logAudit(req.staff.companyId, req.staff.uid, "staff_sos_resolved", {
        sosId,
        driverId: settings.sosDriverId || null,
        groupId: groupId || null,
        groupScope: groupId ? "group" : "unassigned",
        resolutionNote
      });
      return res.json({
        success: true,
        sos: {
          sosActive: false,
          sosDriver: "",
          sosBus: "",
          sosId: null,
          resolvedBy: req.staff.uid
        }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Rešavanje SOS alarma nije uspelo");
      return res.status(500).json({ success: false, error: "SOS alarm nije mogao biti rešen." });
    }
  });

  app.put("/api/staff/lost-items/:itemId/status", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    // Align with CA operational read-only: only dispatchers mutate lost-item status.
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Pristup odbijen." });
    }
    const itemId = lostItemIdSchema.safeParse(req.params.itemId);
    const status = lostItemStatusSchema.safeParse(req.body);
    if (!itemId.success || !status.success) {
      return res.status(400).json({ success: false, error: "Nevažeći status predmeta." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const itemRef = companyRef.collection("lost_items").doc(itemId.data);
      const itemSnap = await itemRef.get();
      if (!itemSnap.exists) {
        return res.status(404).json({ success: false, error: "Predmet nije pronađen." });
      }
      const item = itemSnap.data() || {};
      const fromStatus = normalizeLostItemStatus(item.status) || item.status;
      const toStatus = status.data.status;
      if (!canTransitionLostItemStatus(fromStatus, toStatus)) {
        return res.status(409).json({
          success: false,
          error: fromStatus === "returned"
            ? "Predmet je već vraćen."
            : "Nedozvoljena promena statusa predmeta."
        });
      }

      let groupId = item.groupId || null;
      if (!groupId && item.driverId) {
        const driverSnap = await companyRef.collection("drivers").doc(item.driverId).get();
        if (driverSnap.exists) groupId = driverSnap.data().groupId || driverSnap.data().lineId || null;
      }
      if (req.staff.role === "dispatcher" && !dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Predmet nije u dodeljenoj grupi." });
      }

      const patch = {
        status: toStatus,
        statusUpdatedAt: admin().firestore.FieldValue.serverTimestamp(),
        statusUpdatedBy: req.staff.uid
      };
      if (toStatus === "returned") {
        patch.returnedAt = admin().firestore.FieldValue.serverTimestamp();
        patch.returnedBy = req.staff.uid;
      }
      await itemRef.update(patch);
      await logAudit(req.staff.companyId, req.staff.uid, "lost_item_status_changed", {
        itemId: itemId.data,
        fromStatus,
        toStatus,
        driverId: item.driverId || null,
        groupId
      });
      if (toStatus === "returned") {
        await logAudit(req.staff.companyId, req.staff.uid, "lost_item_returned", {
          itemId: itemId.data,
          driverId: item.driverId || null,
          groupId
        });
      }
      return res.json({
        success: true,
        item: {
          id: itemId.data,
          status: toStatus,
          statusUpdatedBy: req.staff.uid,
          returnedBy: toStatus === "returned" ? req.staff.uid : (item.returnedBy || null),
          returnedAt: null
        }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Ažuriranje statusa predmeta nije uspelo");
      return res.status(500).json({ success: false, error: "Status predmeta nije mogao biti ažuriran." });
    }
  });

  app.put("/api/staff/reports/:reportId/resolve", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    const reportId = reportIdSchema.safeParse(req.params.reportId);
    const resolution = reportResolutionSchema.safeParse(req.body);
    if (!reportId.success) return res.status(400).json({ success: false, error: "Nevažeća prijava." });
    if (!resolution.success) return res.status(400).json({
      success: false, code: "RESOLUTION_REQUIRED",
      error: "Problem nije rešen klikom. Izaberite provereno rešenje i unesite kratak zapis."
    });
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može rešavati operativne prijave." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const reportRef = companyRef.collection("reports").doc(reportId.data);
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) return res.status(404).json({ success: false, error: "Prijava nije pronađena." });
      const report = reportSnap.data();
      let groupId = report.groupId || null;
      if (!groupId && report.driverId) {
        const driverSnap = await companyRef.collection("drivers").doc(report.driverId).get();
        if (driverSnap.exists) groupId = driverSnap.data().groupId || driverSnap.data().lineId || null;
      }
      if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Prijava nije u dodeljenoj grupi." });
      }
      if (isResolvedReportStatus(report.status)) {
        return res.status(409).json({ success: false, error: "Prijava je već rešena." });
      }
      if (!isActiveReportStatus(report.status)) {
        return res.status(409).json({ success: false, error: "Prijava nema aktivan status." });
      }
      const normalizedType = String(report.type || report.reason || "").toLowerCase();
      const coverageIncident = normalizedType.includes("coverage") || normalizedType.includes("uncovered")
        || normalizedType.includes("driver_missing") || normalizedType.includes("no_driver");
      if (coverageIncident) return res.status(409).json({
        success: false, code: "GUIDED_REASSIGNMENT_REQUIRED",
        error: "Nepokrivena smena ostaje otvorena dok Resolver transakcija stvarno ne promeni vozača, autobus i plan."
      });
      const resolvedAt = admin().firestore.FieldValue.serverTimestamp();
      const resolutionRecord = {
        type: resolution.data.type,
        summary: resolution.data.summary,
        verifiedBy: req.staff.uid,
        verifiedAt: resolvedAt
      };
      await reportRef.update({ status: "resolved", groupId, resolution: resolutionRecord, resolvedAt, resolvedBy: req.staff.uid });
      await logAudit(req.staff.companyId, req.staff.uid, "driver_report_resolved", {
        reportId: reportId.data,
        driverId: report.driverId || null,
        groupId,
        resolutionType: resolution.data.type
      });
      return res.json({
        success: true,
        report: { id: reportId.data, status: "resolved", groupId, resolution: { ...resolutionRecord, verifiedAt: null }, resolvedAt: null, resolvedBy: req.staff.uid }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Rešavanje prijave nije uspelo");
      return res.status(500).json({ success: false, error: "Prijava nije mogla biti rešena." });
    }
  });

  app.post("/api/staff/buses", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može upravljati autobusima." });
    }
    const parsed = busCreateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeći podaci autobusa." });
    if (!dispatcherCanAccessGroup(req.staff.groups, parsed.data.groupId)) {
      return res.status(403).json({ success: false, error: "Grupa nije dodeljena ovom disponentu." });
    }
    const { busHasGroup, withAttachedGroup, buildNewBusGroups } = require("./bus-group-membership");
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const duplicate = await companyRef.collection("buses").where("number", "==", parsed.data.number).limit(1).get();
      if (!duplicate.empty) {
        const doc = duplicate.docs[0];
        const existing = { id: doc.id, ...doc.data() };
        if (busHasGroup(existing, parsed.data.groupId)) {
          return res.status(200).json({
            success: true,
            attached: false,
            alreadyInGroup: true,
            bus: publicBusPayload(doc.id, {
              ...existing,
              groupId: existing.groupId || parsed.data.groupId,
              lineId: existing.lineId || existing.groupId || parsed.data.groupId
            })
          });
        }
        const attached = withAttachedGroup(existing, parsed.data.groupId);
        await doc.ref.update({
          groupIds: attached.groupIds,
          groupId: attached.groupId,
          lineId: attached.lineId
        });
        await logAudit(req.staff.companyId, req.staff.uid, "bus_group_attached", {
          busId: doc.id,
          number: parsed.data.number,
          groupId: parsed.data.groupId,
          groupIds: attached.groupIds
        });
        return res.status(200).json({
          success: true,
          attached: true,
          alreadyInGroup: false,
          bus: publicBusPayload(doc.id, attached)
        });
      }
      const busRef = companyRef.collection("buses").doc();
      const groups = buildNewBusGroups(parsed.data.groupId);
      const payload = {
        number: parsed.data.number,
        ...groups,
        companyId: req.staff.companyId,
        active: true,
        plate: String(parsed.data.plate || "").trim().slice(0, 20),
        garage: String(parsed.data.garage || "").trim().slice(0, 40),
        opsStatus: parsed.data.opsStatus || "active",
        revision: 0,
        createdAt: admin().firestore.FieldValue.serverTimestamp(),
        createdBy: req.staff.uid
      };
      await busRef.set(payload);
      await logAudit(req.staff.companyId, req.staff.uid, "bus_created", {
        busId: busRef.id, number: parsed.data.number, groupId: parsed.data.groupId, groupIds: groups.groupIds
      });
      return res.status(201).json({ success: true, attached: false, bus: publicBusPayload(busRef.id, payload) });
    } catch (error) {
      req.log?.error?.({ err: error }, "Dodavanje autobusa nije uspelo");
      return res.status(500).json({ success: false, error: "Autobus nije mogao biti dodat." });
    }
  });

  app.put("/api/staff/buses/:busId", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može upravljati autobusima." });
    }
    const busId = busIdSchema.safeParse(req.params.busId);
    const profile = busProfileSchema.safeParse(req.body);
    if (!busId.success || !profile.success) {
      return res.status(400).json({ success: false, error: "Nevažeći podaci autobusa." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const busRef = companyRef.collection("buses").doc(busId.data);
      const plate = String(profile.data.plate || "").trim().slice(0, 20);
      const garage = String(profile.data.garage || "").trim().slice(0, 40);
      const opsStatus = profile.data.opsStatus;
      // Only meaningful alongside other_line — never stored otherwise.
      const otherLineId = opsStatus === "other_line" ? String(profile.data.otherLineId || "").trim().slice(0, 64) : "";
      const expectedRevision = profile.data.expectedRevision;
      const result = await db().runTransaction(async (tx) => {
        const snapshot = await tx.get(busRef);
        if (!snapshot.exists) {
          const err = new Error("not_found");
          err.code = "not_found";
          throw err;
        }
        const bus = snapshot.data() || {};
        const { normalizeGroupIds } = require("./bus-group-membership");
        const groupIds = normalizeGroupIds(bus);
        const canAccess = groupIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
        if (!groupIds.length || !canAccess) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        const currentRevision = busRevisionOf(bus);
        if (currentRevision !== expectedRevision) {
          const err = new Error("revision_conflict");
          err.code = "revision_conflict";
          err.bus = publicBusPayload(busId.data, bus);
          throw err;
        }
        const nextRevision = currentRevision + 1;
        const prevPlate = String(bus.plate || "").trim().slice(0, 20);
        const prevGarage = String(bus.garage || "").trim().slice(0, 40);
        // Soft mutex per garage label: second dispatcher cannot save into a garage
        // another dispatcher is actively writing (2 min). Same dispatcher can continue.
        if (garage) {
          const garageKey = garage.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 48) || "garage";
          const garageLockRef = companyRef.collection("ops_locks").doc(`garage_${garageKey}`);
          const garageSnap = await tx.get(garageLockRef);
          const lock = garageSnap.exists ? garageSnap.data() : null;
          const lockUid = String(lock?.holderUid || "");
          if (lock && lockUid && lockUid !== req.staff.uid && Number(lock?.expiresAtMs || 0) > Date.now()) {
            const err = new Error("garage_busy");
            err.code = "garage_busy";
            err.holderUid = lockUid;
            throw err;
          }
          tx.set(garageLockRef, {
            type: "garage",
            garage,
            busId: busId.data,
            holderUid: req.staff.uid,
            expiresAtMs: Date.now() + 2 * 60 * 1000,
            updatedAtMs: Date.now()
          }, { merge: true });
        }
        tx.update(busRef, {
          plate,
          garage,
          opsStatus,
          otherLineId: otherLineId || admin().firestore.FieldValue.delete(),
          revision: nextRevision,
          profileUpdatedAt: admin().firestore.FieldValue.serverTimestamp(),
          profileUpdatedBy: req.staff.uid
        });
        return {
          previous: { plate: prevPlate, garage: prevGarage, opsStatus: bus.opsStatus || "active", revision: currentRevision },
          next: { plate, garage, opsStatus, otherLineId, revision: nextRevision },
          groupIds,
          bus: { ...bus, plate, garage, opsStatus, otherLineId, revision: nextRevision, groupIds }
        };
      });
      await logAudit(req.staff.companyId, req.staff.uid, "bus_profile_updated", {
        busId: busId.data,
        groupId: result.groupIds[0],
        groupIds: result.groupIds,
        previous: result.previous,
        next: result.next
      });
      return res.json({
        success: true,
        bus: publicBusPayload(busId.data, result.bus)
      });
    } catch (error) {
      if (error.code === "not_found") {
        return res.status(404).json({ success: false, error: "Autobus nije pronađen." });
      }
      if (error.code === "forbidden") {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      if (error.code === "revision_conflict") {
        return res.status(409).json({
          success: false,
          code: "REVISION_CONFLICT",
          error: "Autobus je izmenjen. Osvežite i pokušajte ponovo.",
          bus: error.bus || null
        });
      }
      if (error.code === "garage_busy") {
        return res.status(409).json({
          success: false,
          code: "GARAGE_BUSY",
          error: "Drugi disponent trenutno menja tu garažu. Osvežite i pokušajte ponovo."
        });
      }
      req.log?.error?.({ err: error }, "Izmena autobusa nije uspela");
      return res.status(500).json({ success: false, error: "Autobus nije mogao biti izmenjen." });
    }
  });

  app.put("/api/staff/buses/:busId/status", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može upravljati autobusima." });
    }
    const busId = busIdSchema.safeParse(req.params.busId);
    const status = busStatusSchema.safeParse(req.body);
    if (!busId.success || !status.success) return res.status(400).json({ success: false, error: "Nevažeći zahtev." });
    try {
      const busRef = db().collection("companies").doc(req.staff.companyId).collection("buses").doc(busId.data);
      const result = await db().runTransaction(async (tx) => {
        const snapshot = await tx.get(busRef);
        if (!snapshot.exists) {
          const err = new Error("not_found");
          err.code = "not_found";
          throw err;
        }
        const bus = snapshot.data() || {};
        const { normalizeGroupIds } = require("./bus-group-membership");
        const groupIds = normalizeGroupIds(bus);
        const canAccess = groupIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
        if (!groupIds.length || !canAccess) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        const currentRevision = busRevisionOf(bus);
        if (currentRevision !== status.data.expectedRevision) {
          const err = new Error("revision_conflict");
          err.code = "revision_conflict";
          err.bus = publicBusPayload(busId.data, bus);
          throw err;
        }
        const nextRevision = currentRevision + 1;
        tx.update(busRef, {
          active: status.data.active,
          revision: nextRevision,
          statusChangedAt: admin().firestore.FieldValue.serverTimestamp(),
          statusChangedBy: req.staff.uid
        });
        return { active: status.data.active, revision: nextRevision, groupIds, bus: { ...bus, active: status.data.active, revision: nextRevision } };
      });
      await logAudit(req.staff.companyId, req.staff.uid, result.active ? "bus_activated" : "bus_deactivated", {
        busId: busId.data,
        groupId: result.groupIds[0],
        groupIds: result.groupIds,
        revision: result.revision,
        reason: status.data.reason || null,
        note: status.data.note || null
      });
      return res.json({ success: true, active: result.active, revision: result.revision, bus: publicBusPayload(busId.data, result.bus) });
    } catch (error) {
      if (error.code === "not_found") {
        return res.status(404).json({ success: false, error: "Autobus nije pronađen." });
      }
      if (error.code === "forbidden") {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      if (error.code === "revision_conflict") {
        return res.status(409).json({
          success: false,
          code: "REVISION_CONFLICT",
          error: "Autobus je izmenjen. Osvežite i pokušajte ponovo.",
          bus: error.bus || null
        });
      }
      req.log?.error?.({ err: error }, "Promena statusa autobusa nije uspela");
      return res.status(500).json({ success: false, error: "Status autobusa nije mogao biti promenjen." });
    }
  });

  /** Soft-remove bus from a line/group — stays in company fleet (active unchanged). */
  app.put("/api/staff/buses/:busId/groups", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može skidati autobus sa linije." });
    }
    const busId = busIdSchema.safeParse(req.params.busId);
    const body = busGroupDetachSchema.safeParse(req.body);
    if (!busId.success || !body.success) {
      return res.status(400).json({ success: false, error: "Nevažeći zahtev za skidanje autobusa." });
    }
    const targetGroupId = body.data.groupId;
    if (!dispatcherCanAccessGroup(req.staff.groups, targetGroupId)) {
      return res.status(403).json({ success: false, error: "Linija nije u dodeljenim grupama." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const busRef = companyRef.collection("buses").doc(busId.data);
      const groupsSnap = await companyRef.collection("groups").get();
      const detachIds = [targetGroupId];
      groupsSnap.forEach((doc) => {
        const data = doc.data() || {};
        if (doc.id === targetGroupId || String(data.lineId || "") === targetGroupId) {
          if (!detachIds.includes(doc.id)) detachIds.push(doc.id);
        }
      });
      const result = await db().runTransaction(async (tx) => {
        const snapshot = await tx.get(busRef);
        if (!snapshot.exists) {
          const err = new Error("not_found");
          err.code = "not_found";
          throw err;
        }
        const bus = snapshot.data() || {};
        const { normalizeGroupIds, withDetachedGroup, busHasGroup } = require("./bus-group-membership");
        const beforeIds = normalizeGroupIds(bus);
        const onLine = detachIds.some((gid) => busHasGroup(bus, gid));
        if (!onLine) {
          const err = new Error("not_on_line");
          err.code = "not_on_line";
          throw err;
        }
        const canAccess = beforeIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid))
          || detachIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
        if (!canAccess) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        const currentRevision = busRevisionOf(bus);
        if (currentRevision !== body.data.expectedRevision) {
          const err = new Error("revision_conflict");
          err.code = "revision_conflict";
          err.bus = publicBusPayload(busId.data, bus);
          throw err;
        }
        const next = withDetachedGroup(bus, detachIds);
        const nextRevision = currentRevision + 1;
        const update = {
          groupIds: next.groupIds,
          groupId: next.groupId || admin().firestore.FieldValue.delete(),
          lineId: next.lineId || admin().firestore.FieldValue.delete(),
          revision: nextRevision,
          lineDetachedAt: admin().firestore.FieldValue.serverTimestamp(),
          lineDetachedBy: req.staff.uid,
          lineDetachedFrom: targetGroupId
        };
        tx.update(busRef, update);
        return {
          revision: nextRevision,
          previousGroupIds: beforeIds,
          bus: { ...bus, ...next, revision: nextRevision }
        };
      });
      await logAudit(req.staff.companyId, req.staff.uid, "bus_detached_from_group", {
        busId: busId.data,
        groupId: targetGroupId,
        previousGroupIds: result.previousGroupIds,
        groupIds: result.bus.groupIds,
        revision: result.revision,
        reason: body.data.reason || null,
        note: body.data.note || null
      });
      return res.json({
        success: true,
        bus: publicBusPayload(busId.data, result.bus),
        detachedFrom: targetGroupId
      });
    } catch (error) {
      if (error.code === "not_found") {
        return res.status(404).json({ success: false, error: "Autobus nije pronađen." });
      }
      if (error.code === "forbidden") {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      if (error.code === "not_on_line") {
        return res.status(409).json({ success: false, error: "Autobus nije na toj liniji." });
      }
      if (error.code === "revision_conflict") {
        return res.status(409).json({
          success: false,
          code: "REVISION_CONFLICT",
          error: "Autobus je izmenjen. Osvežite i pokušajte ponovo.",
          bus: error.bus || null
        });
      }
      req.log?.error?.({ err: error }, "Skidanje autobusa sa linije nije uspelo");
      return res.status(500).json({ success: false, error: "Autobus nije mogao biti skinut sa linije." });
    }
  });

  /** Reassign a bus's primary line in one transaction — detach current group(s), attach the new one. */
  app.put("/api/staff/buses/:busId/switch-group", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može menjati liniju autobusa." });
    }
    const busId = busIdSchema.safeParse(req.params.busId);
    const body = busGroupSwitchSchema.safeParse(req.body);
    if (!busId.success || !body.success) {
      return res.status(400).json({ success: false, error: "Nevažeći zahtev za promenu linije." });
    }
    const toGroupId = body.data.toGroupId;
    if (!dispatcherCanAccessGroup(req.staff.groups, toGroupId)) {
      return res.status(403).json({ success: false, error: "Linija nije u dodeljenim grupama." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const busRef = companyRef.collection("buses").doc(busId.data);
      const { normalizeGroupIds, withDetachedGroup, buildNewBusGroups, busHasGroup } = require("./bus-group-membership");
      const result = await db().runTransaction(async (tx) => {
        const snapshot = await tx.get(busRef);
        if (!snapshot.exists) {
          const err = new Error("not_found");
          err.code = "not_found";
          throw err;
        }
        const bus = snapshot.data() || {};
        const beforeIds = normalizeGroupIds(bus);
        const canAccess = beforeIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
        if (beforeIds.length && !canAccess) {
          const err = new Error("forbidden");
          err.code = "forbidden";
          throw err;
        }
        const currentRevision = busRevisionOf(bus);
        if (currentRevision !== body.data.expectedRevision) {
          const err = new Error("revision_conflict");
          err.code = "revision_conflict";
          err.bus = publicBusPayload(busId.data, bus);
          throw err;
        }
        if (busHasGroup(bus, toGroupId) && beforeIds.length === 1) {
          const err = new Error("already_on_line");
          err.code = "already_on_line";
          throw err;
        }
        const nextRevision = currentRevision + 1;
        const detached = withDetachedGroup(bus, beforeIds);
        const attachedGroups = buildNewBusGroups(toGroupId);
        const next = { ...detached, ...attachedGroups };
        tx.update(busRef, {
          groupIds: next.groupIds,
          groupId: next.groupId,
          lineId: next.lineId,
          revision: nextRevision,
          lineSwitchedAt: admin().firestore.FieldValue.serverTimestamp(),
          lineSwitchedBy: req.staff.uid
        });
        return {
          revision: nextRevision,
          previousGroupIds: beforeIds,
          bus: { ...bus, ...next, revision: nextRevision }
        };
      });
      await logAudit(req.staff.companyId, req.staff.uid, "bus_group_switched", {
        busId: busId.data,
        toGroupId,
        previousGroupIds: result.previousGroupIds,
        groupIds: result.bus.groupIds,
        revision: result.revision
      });
      return res.json({
        success: true,
        bus: publicBusPayload(busId.data, result.bus)
      });
    } catch (error) {
      if (error.code === "not_found") {
        return res.status(404).json({ success: false, error: "Autobus nije pronađen." });
      }
      if (error.code === "forbidden") {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      if (error.code === "already_on_line") {
        return res.status(409).json({ success: false, error: "Autobus je već na toj liniji." });
      }
      if (error.code === "revision_conflict") {
        return res.status(409).json({
          success: false,
          code: "REVISION_CONFLICT",
          error: "Autobus je izmenjen. Osvežite i pokušajte ponovo.",
          bus: error.bus || null
        });
      }
      req.log?.error?.({ err: error }, "Promena linije autobusa nije uspela");
      return res.status(500).json({ success: false, error: "Linija autobusa nije mogla biti promenjena." });
    }
  });

  app.post("/api/staff/operational-incidents", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može evidentirati operativni incident." });
    }
    const parsed = operationalIncidentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeći podaci incidenta." });
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const affectedEntity = parsed.data.affectedEntity || "driver";
      const busNumber = String(parsed.data.bus || "").trim();
      let groupId = null;
      let driverId = parsed.data.driverId || null;
      let driverName = "";
      let driverSnap = null;

      if (driverId) {
        driverSnap = await companyRef.collection("drivers").doc(driverId).get();
        if (!driverSnap.exists || driverSnap.data().active === false) {
          return res.status(404).json({ success: false, error: "Aktivan vozač nije pronađen." });
        }
        const driver = driverSnap.data();
        groupId = driver.groupId || driver.lineId || null;
        if (!groupId || groupId === "all") {
          return res.status(400).json({ success: false, code: "INVALID_GROUP", error: "Vozač nema definisanu grupu." });
        }
        driverName = safeDriver(driverSnap).name;
        if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
          return res.status(403).json({ success: false, error: "Vozač nije u dodeljenoj grupi." });
        }
      }

      if (affectedEntity === "vehicle") {
        const { busHasGroup, normalizeGroupIds } = require("./bus-group-membership");
        const busQuery = await companyRef.collection("buses").where("number", "==", busNumber).limit(5).get();
        if (groupId) {
          const busSnap = busQuery.docs.find((doc) => {
            const bus = doc.data();
            return bus.active !== false && busHasGroup(bus, groupId);
          });
          if (!busSnap) {
            return res.status(409).json({
              success: false,
              code: "BUS_NOT_AVAILABLE",
              error: "Izabrani autobus nije aktivan i dostupan u ovoj grupi."
            });
          }
        } else {
          const staffGroups = Array.isArray(req.staff.groups) ? req.staff.groups : [];
          const busSnap = busQuery.docs.find((doc) => {
            const bus = doc.data();
            if (bus.active === false) return false;
            return staffGroups.some((gid) => busHasGroup(bus, gid));
          });
          if (!busSnap) {
            return res.status(404).json({ success: false, error: "Autobus nije pronađen u dodeljenoj grupi." });
          }
          const busGroupIds = normalizeGroupIds(busSnap.data());
          groupId = busGroupIds.find((gid) => dispatcherCanAccessGroup(req.staff.groups, gid)) || null;
          if (!groupId || groupId === "all") {
            return res.status(400).json({ success: false, code: "INVALID_GROUP", error: "Autobus nema definisanu grupu." });
          }
          if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
            return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
          }
        }
      } else if (!driverId) {
        return res.status(400).json({ success: false, error: "Nevažeći podaci incidenta." });
      }

      const profileSnap = await companyRef.collection("profile").doc("main").get();
      const timezone = profileSnap.exists ? profileSnap.data().timezone : null;
      if (!validTimezone(timezone)) {
        return res.status(503).json({
          success: false,
          code: "COMPANY_TIMEZONE_REQUIRED",
          error: "Vremenska zona firme nije ispravno podešena."
        });
      }
      const today = localDateString(now(), timezone);
      if (parsed.data.date !== today) {
        return res.status(409).json({
          success: false,
          code: "INCIDENT_TODAY_ONLY",
          error: "Operativni incident može se evidentirati samo za današnju smenu."
        });
      }

      let scopeKind = "day";
      let scopeId = "day";
      if (parsed.data.scopeKind === "assignment" && parsed.data.scopeId) {
        const shiftRef = companyRef.collection("shifts").doc(shiftDocumentId(driverId, parsed.data.date));
        const shiftSnap = await shiftRef.get();
        if (!shiftSnap.exists) {
          return res.status(400).json({ success: false, code: "INVALID_ASSIGNMENT_SCOPE", error: "Dodeljena smena nije pronađena." });
        }
        const shiftData = shiftSnap.data();
        if (shiftData.driverId !== driverId || shiftData.date !== parsed.data.date || (shiftData.groupId && shiftData.groupId !== groupId)) {
          return res.status(400).json({ success: false, code: "INVALID_ASSIGNMENT_SCOPE", error: "Dodeljena smena ne odgovara incidentu." });
        }
        scopeKind = "assignment";
        scopeId = parsed.data.scopeId;
      }

      const canonical = buildCanonicalIncidentIdentity({
        version: "v1",
        incidentType: parsed.data.type || "coverage:disruption",
        affectedEntity,
        driverId,
        bus: busNumber || null,
        date: parsed.data.date,
        groupId,
        scopeKind,
        scopeId
      });
      if (!canonical.ok) {
        return res.status(400).json({ success: false, code: "INVALID_INCIDENT_IDENTITY", error: "Nevažeći identifikator incidenta." });
      }

      const activeGuardRef = companyRef.collection("ops_active_incidents").doc(canonical.guardKey);

      const result = await db().runTransaction(async (tx) => {
        const guardSnap = await tx.get(activeGuardRef);
        if (guardSnap.exists) {
          const guardData = guardSnap.data() || {};
          if (guardData.reportId) {
            const activeReportRef = companyRef.collection("reports").doc(guardData.reportId);
            const activeReportSnap = await tx.get(activeReportRef);
            if (activeReportSnap.exists && isActiveReportStatus(activeReportSnap.data().status)) {
              const activeReportData = activeReportSnap.data();
              return {
                duplicate: true,
                report: {
                  id: activeReportSnap.id,
                  ...activeReportData,
                  createdAt: null,
                  lifecycle: { open: null }
                }
              };
            }
          }
        }

        const reportRef = companyRef.collection("reports").doc();
        const reportId = reportRef.id;
        const createdAt = admin().firestore.FieldValue.serverTimestamp();
        const report = {
          type: canonical.identity.incidentType,
          reason: parsed.data.reason,
          description: parsed.data.description,
          severity: "sev_critical",
          bus: busNumber,
          shiftType: parsed.data.shiftType || "",
          shiftName: parsed.data.shiftName || "",
          date: canonical.identity.date,
          driverId: canonical.identity.driverId,
          driver: driverName,
          groupId: canonical.identity.groupId,
          affectedEntity: canonical.identity.affectedEntity,
          scopeKind: canonical.identity.scopeKind,
          scopeId: canonical.identity.scopeId,
          guardKey: canonical.guardKey,
          scopeKey: canonical.guardKey,
          source: "dispatcher",
          createdBy: req.staff.uid,
          createdAt,
          ...buildProblemCreateFields({
            affectedEntity: canonical.identity.affectedEntity,
            reporterId: req.staff.uid,
            at: createdAt
          })
        };

        const guardPayload = {
          version: canonical.identity.version,
          incidentType: canonical.identity.incidentType,
          affectedEntity: canonical.identity.affectedEntity,
          resourceId: canonical.identity.resourceId,
          driverId: canonical.identity.driverId,
          bus: canonical.identity.bus,
          date: canonical.identity.date,
          groupId: canonical.identity.groupId,
          scopeKind: canonical.identity.scopeKind,
          scopeId: canonical.identity.scopeId,
          guardKey: canonical.guardKey,
          reportId,
          status: "open",
          updatedAt: createdAt
        };

        const auditRef = companyRef.collection("audit_log").doc();

        tx.set(reportRef, report);
        tx.set(activeGuardRef, guardPayload);
        tx.set(auditRef, {
          action: "operational_incident_created",
          actorId: req.staff.uid,
          companyId: req.staff.companyId,
          category: "operations",
          timestamp: createdAt,
          details: {
            reportId,
            incidentType: canonical.identity.incidentType,
            driverId: canonical.identity.driverId,
            groupId: canonical.identity.groupId,
            date: canonical.identity.date,
            affectedEntity: canonical.identity.affectedEntity,
            bus: busNumber || null,
            scopeKind: canonical.identity.scopeKind,
            scopeId: canonical.identity.scopeId,
            guardKey: canonical.guardKey,
            scopeKey: canonical.guardKey
          }
        });

        return {
          duplicate: false,
          report: {
            ...report,
            id: reportId,
            createdAt: null,
            lifecycle: { open: null }
          }
        };
      });

      if (result.duplicate) {
        return res.status(200).json({
          success: true,
          report: result.report,
          duplicate: true
        });
      }

      return res.status(201).json({
        success: true,
        report: result.report
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Evidentiranje operativnog incidenta nije uspelo");
      return res.status(500).json({ success: false, error: "Operativni incident nije mogao biti sačuvan." });
    }
  });

  app.put("/api/staff/operational-incidents/:reportId/transition", rateLimit(20, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može menjati status incidenta." });
    }
    const reportId = reportIdSchema.safeParse(req.params.reportId);
    const parsed = problemTransitionSchema.safeParse(req.body);
    if (!reportId.success || !parsed.success) {
      return res.status(400).json({ success: false, error: "Nevažeći podaci tranzicije." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const reportRef = companyRef.collection("reports").doc(reportId.data);
      const reportSnap = await reportRef.get();
      if (!reportSnap.exists) return res.status(404).json({ success: false, error: "Incident nije pronađen." });
      const existing = reportSnap.data();
      const groupId = existing.groupId || null;
      if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Incident nije u dodeljenoj grupi." });
      }

      const fromStatus = normalizedProblemStatus(existing.status);
      const transitionedAt = admin().firestore.FieldValue.serverTimestamp();
      const simulated = simulateProblemTransition(existing, parsed.data.toStatus, {
        expectedRevision: parsed.data.expectedRevision,
        assigneeId: parsed.data.assigneeId,
        proposedSolution: parsed.data.proposedSolution,
        actorId: req.staff.uid,
        at: transitionedAt
      });
      if (!simulated.ok) {
        if (simulated.code === "REVISION_CONFLICT") {
          return res.status(409).json({
            success: false,
            code: "REVISION_CONFLICT",
            currentRevision: simulated.currentRevision ?? 0,
            error: "Incident je u međuvremenu izmenjen. Osvežite prikaz."
          });
        }
        if (simulated.code === "INVALID_TRANSITION") {
          return res.status(409).json({
            success: false,
            code: "INVALID_TRANSITION",
            from: simulated.from,
            to: simulated.to,
            error: "Nedozvoljena promena statusa incidenta."
          });
        }
        if (simulated.code === "INCIDENT_NOT_ACTIVE") {
          return res.status(409).json({
            success: false,
            code: "INCIDENT_NOT_ACTIVE",
            currentRevision: simulated.currentRevision ?? 0,
            error: "Incident nije aktivan."
          });
        }
        return res.status(400).json({
          success: false,
          code: simulated.code || "INVALID_TRANSITION",
          error: "Nevažeći podaci tranzicije."
        });
      }

      await reportRef.update(simulated.patch);
      await logAudit(req.staff.companyId, req.staff.uid, "operational_incident_transitioned", {
        reportId: reportId.data,
        groupId,
        from: fromStatus,
        to: simulated.status,
        revision: simulated.revision,
        affectedEntity: existing.affectedEntity || "driver"
      });
      return res.json({
        success: true,
        report: {
          id: reportId.data,
          status: simulated.status,
          revision: simulated.revision,
          assigneeId: simulated.patch.assigneeId,
          proposedSolution: simulated.patch.proposedSolution,
          groupId
        }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Tranzicija operativnog incidenta nije uspela");
      return res.status(500).json({ success: false, error: "Status incidenta nije mogao biti promenjen." });
    }
  });

  app.get("/api/staff/ops-activity", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može pregledati operativnu aktivnost." });
    }
    try {
      const requested = Number.parseInt(req.query.limit, 10);
      const limit = Number.isFinite(requested) ? Math.min(50, Math.max(1, requested)) : 25;
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const snapshot = await companyRef.collection("audit_log")
        .orderBy("timestamp", "desc")
        .limit(Math.min(250, limit * 5))
        .get();

      const events = [];
      for (const doc of snapshot.docs) {
        const data = doc.data() || {};
        if (!isOpsActivityAction(data.action)) continue;
        const details = data.details && typeof data.details === "object" ? data.details : {};
        const groupId = details.groupId || null;
        const groupIds = Array.isArray(details.groupIds) ? details.groupIds : [];
        if (groupId) {
          if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) continue;
        } else if (groupIds.length) {
          const visible = groupIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
          if (!visible) continue;
        } else {
          // Ungrouped audit rows must not leak company-wide to Dispo.
          continue;
        }
        const ts = data.timestamp;
        events.push({
          id: doc.id,
          action: String(data.action || ""),
          actorId: data.actorId || null,
          actorName: data.actorName || null,
          timestamp: typeof ts?.toDate === "function" ? ts.toDate().toISOString() : (ts || null),
          details: {
            groupId: groupId || null,
            groupIds: groupIds.length ? groupIds : undefined,
            reportId: details.reportId || null,
            driverId: details.driverId || null,
            date: details.date || null,
            affectedEntity: details.affectedEntity || null,
            bus: details.bus || null,
            from: details.from || null,
            to: details.to || null,
            revision: details.revision ?? null
          }
        });
        if (events.length >= limit) break;
      }
      return res.json({ success: true, events });
    } catch (error) {
      req.log?.error?.({ err: error }, "Učitavanje operativne aktivnosti nije uspelo");
      return res.status(500).json({ success: false, error: "Operativna aktivnost nije mogla biti učitana." });
    }
  });

  app.put("/api/staff/operational-incidents/:reportId/resolve", rateLimit(20, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može rešavati operativni incident." });
    }
    const reportId = reportIdSchema.safeParse(req.params.reportId);
    const parsed = coverageResolutionSchema.safeParse(req.body);
    if (!reportId.success || !parsed.success) {
      return res.status(400).json({ success: false, code: "INVALID_RESOLUTION", error: "Izaberite dostupnog vozača i autobus." });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const reportRef = companyRef.collection("reports").doc(reportId.data);
      const initialReportSnap = await reportRef.get();
      if (!initialReportSnap.exists) return res.status(404).json({ success: false, error: "Incident nije pronađen." });
      const initialReport = initialReportSnap.data();
      const groupId = initialReport.groupId || null;
      if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Incident nije u dodeljenoj grupi." });
      }

      const effectiveType = parsed.data.resolutionType || parsed.data.type || "replacement";
      const isAvailableAgain = effectiveType === "available_again"
        || effectiveType === "restored"
        || effectiveType === "cancelled"
        || effectiveType === "no_replacement";

      const primaryIncidentType = initialReport.type || "coverage:disruption";
      const primaryAffectedEntity = initialReport.affectedEntity || "driver";
      const primaryDriverId = initialReport.driverId || null;
      const primaryBus = initialReport.bus || null;
      const primaryDate = initialReport.date;
      const primaryGroupId = initialReport.groupId || null;
      const primaryScopeKind = initialReport.scopeKind || "day";
      const primaryScopeId = initialReport.scopeId || "day";

      const primaryCanonical = buildCanonicalIncidentIdentity({
        version: "v1",
        incidentType: primaryIncidentType,
        affectedEntity: primaryAffectedEntity,
        driverId: primaryDriverId,
        bus: primaryBus,
        date: primaryDate,
        groupId: primaryGroupId,
        scopeKind: primaryScopeKind,
        scopeId: primaryScopeId
      });
      const primaryGuardKey = primaryCanonical.ok ? primaryCanonical.guardKey : (initialReport.guardKey || initialReport.scopeKey || null);

      if (isAvailableAgain) {
        const txResult = await db().runTransaction(async (tx) => {
          const reportSnap = await tx.get(reportRef);
          if (!reportSnap.exists) {
            return { status: 404, json: { success: false, error: "Incident nije pronađen." } };
          }
          const primaryReport = reportSnap.data() || {};
          const primaryGroupId = primaryReport.groupId || null;

          if (!dispatcherCanAccessGroup(req.staff.groups, primaryGroupId)) {
            return { status: 403, json: { success: false, error: "Incident nije u dodeljenoj grupi." } };
          }

          if (isResolvedReportStatus(primaryReport.status)) {
            return {
              status: 200,
              json: {
                success: true,
                report: { id: reportId.data, ...primaryReport },
                idempotent: true
              }
            };
          }

          if (!isActiveReportStatus(primaryReport.status)) {
            return { status: 409, json: { success: false, code: "INCIDENT_NOT_ACTIVE", error: "Incident nema aktivan status." } };
          }

          if (Number.isInteger(parsed.data.expectedProblemRevision)
            && parsed.data.expectedProblemRevision !== currentProblemRevision(primaryReport)) {
            return {
              status: 409,
              json: {
                success: false,
                code: "REVISION_CONFLICT",
                error: "Incident je u međuvremenu izmenjen.",
                conflict: { currentRevision: currentProblemRevision(primaryReport) }
              }
            };
          }

          const primaryIncidentType = primaryReport.type || "coverage:disruption";
          const primaryAffectedEntity = primaryReport.affectedEntity || "driver";
          const primaryDriverId = primaryReport.driverId || null;
          const primaryBus = primaryReport.bus || null;
          const primaryDate = primaryReport.date;
          const primaryScopeKind = primaryReport.scopeKind || "day";
          const primaryScopeId = primaryReport.scopeId || "day";

          const primaryCanonical = buildCanonicalIncidentIdentity({
            version: "v1",
            incidentType: primaryIncidentType,
            affectedEntity: primaryAffectedEntity,
            driverId: primaryDriverId,
            bus: primaryBus,
            date: primaryDate,
            groupId: primaryGroupId,
            scopeKind: primaryScopeKind,
            scopeId: primaryScopeId
          });
          const primaryGuardKey = primaryCanonical.ok ? primaryCanonical.guardKey : (primaryReport.guardKey || primaryReport.scopeKey || null);

          // Transactional query for candidate duplicates
          const secondaryDocs = [];
          if (primaryDriverId && primaryDate) {
            const dupQuery = companyRef.collection("reports")
              .where("driverId", "==", primaryDriverId)
              .where("date", "==", primaryDate)
              .where("type", "==", primaryIncidentType);
            const dupSnap = await tx.get(dupQuery);

            dupSnap.docs.forEach((doc) => {
              if (doc.id !== reportId.data) {
                const docData = doc.data() || {};
                const docGroupId = docData.groupId || null;
                const docScopeKind = docData.scopeKind || "day";
                const docScopeId = docData.scopeId || "day";
                if (
                  isActiveReportStatus(docData.status) &&
                  docGroupId === primaryGroupId &&
                  docScopeKind === primaryScopeKind &&
                  docScopeId === primaryScopeId &&
                  dispatcherCanAccessGroup(req.staff.groups, docGroupId)
                ) {
                  secondaryDocs.push(doc);
                }
              }
            });
          }

          const secondaryReportIds = secondaryDocs.map((d) => d.id).sort();
          const allResolvedReportIds = [reportId.data, ...secondaryReportIds];

          const candidateGuardKeys = new Set();
          if (primaryGuardKey) candidateGuardKeys.add(primaryGuardKey);
          if (primaryReport.scopeKey) candidateGuardKeys.add(primaryReport.scopeKey);
          if (primaryReport.guardKey) candidateGuardKeys.add(primaryReport.guardKey);
          secondaryDocs.forEach((d) => {
            const dData = d.data() || {};
            if (dData.guardKey) candidateGuardKeys.add(dData.guardKey);
            if (dData.scopeKey) candidateGuardKeys.add(dData.scopeKey);
          });

          // Read all candidate guards transactionally (ALL READS BEFORE WRITES)
          const guardsToDelete = [];
          for (const gKey of candidateGuardKeys) {
            const gRef = companyRef.collection("ops_active_incidents").doc(gKey);
            const gSnap = await tx.get(gRef);
            if (gSnap.exists) {
              const gData = gSnap.data() || {};
              if (allResolvedReportIds.includes(gData.reportId)) {
                guardsToDelete.push(gRef);
              }
            }
          }

          // ALL WRITES AFTER ALL READS
          for (const gRef of guardsToDelete) {
            tx.delete(gRef);
          }

          const assignedAt = admin().firestore.FieldValue.serverTimestamp();
          const resolution = {
            type: "available_again",
            summary: "Vozač je ponovo dostupan",
            verifiedBy: req.staff.uid,
            verifiedAt: assignedAt
          };
          const problemRevision = currentProblemRevision(primaryReport) + 1;
          const lifecycle = {
            ...(primaryReport.lifecycle && typeof primaryReport.lifecycle === "object"
              ? primaryReport.lifecycle
              : {}),
            resolved: assignedAt
          };

          tx.update(reportRef, {
            status: "resolved",
            revision: problemRevision,
            resolution,
            resolvedAt: assignedAt,
            resolvedBy: req.staff.uid,
            assigneeId: req.staff.uid,
            lifecycle
          });

          for (const sDoc of secondaryDocs) {
            const sData = sDoc.data() || {};
            tx.update(sDoc.ref, {
              status: "resolved",
              revision: currentProblemRevision(sData) + 1,
              resolution,
              resolvedAt: assignedAt,
              resolvedBy: req.staff.uid,
              assigneeId: req.staff.uid,
              lifecycle
            });
          }

          const auditRef = companyRef.collection("audit_log").doc();
          tx.set(auditRef, {
            action: "operational_incident_resolved",
            actorId: req.staff.uid,
            companyId: req.staff.companyId,
            category: "operations",
            timestamp: assignedAt,
            details: {
              reportId: reportId.data,
              secondaryReportIds,
              incidentType: primaryIncidentType,
              driverId: primaryDriverId,
              groupId: primaryGroupId,
              scopeKind: primaryScopeKind,
              scopeId: primaryScopeId,
              guardKey: primaryGuardKey,
              scopeKey: primaryGuardKey,
              resolutionType: "available_again"
            }
          });

          return {
            status: 200,
            json: {
              success: true,
              report: {
                id: reportId.data,
                ...primaryReport,
                status: "resolved",
                revision: problemRevision,
                resolution,
                resolvedAt: null,
                resolvedBy: req.staff.uid,
                lifecycle: { ...lifecycle, resolved: null }
              }
            }
          };
        });

        return res.status(txResult.status).json(txResult.json);
      }

      const affectedEntity = initialReport.affectedEntity === "vehicle" ? "vehicle" : "driver";
      const isSameDriverBusSwap = affectedEntity === "vehicle"
        && initialReport.driverId
        && initialReport.driverId === parsed.data.replacementDriverId;
      if (!initialReport.driverId) {
        return res.status(409).json({
          success: false,
          code: "INVALID_REPLACEMENT",
          error: "Incident nema vozača za zamenu. Dodeli vozača pre rešavanja."
        });
      }
      if (!isSameDriverBusSwap && initialReport.driverId === parsed.data.replacementDriverId) {
        return res.status(409).json({ success: false, code: "INVALID_REPLACEMENT", error: "Izaberite drugog vozača za zamenu." });
      }
      if (Number.isInteger(parsed.data.expectedProblemRevision)
        && parsed.data.expectedProblemRevision !== currentProblemRevision(initialReport)) {
        return res.status(409).json({
          success: false,
          code: "REVISION_CONFLICT",
          error: "Incident je u međuvremenu izmenjen.",
          conflict: { currentRevision: currentProblemRevision(initialReport) }
        });
      }

      const [originalDriverSnap, replacementDriverSnap, busQuery] = await Promise.all([
        companyRef.collection("drivers").doc(initialReport.driverId).get(),
        companyRef.collection("drivers").doc(parsed.data.replacementDriverId).get(),
        companyRef.collection("buses").where("number", "==", parsed.data.replacementBus).limit(2).get()
      ]);
      if (!originalDriverSnap.exists || !replacementDriverSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač za zamenu nije pronađen." });
      }
      const replacementDriver = replacementDriverSnap.data();
      if (replacementDriver.active === false) {
        return res.status(409).json({ success: false, code: "DRIVER_NOT_AVAILABLE", error: "Izabrani vozač nije aktivan." });
      }
      const busSnap = busQuery.docs.find((doc) => doc.data().active !== false);
      if (!busSnap) {
        return res.status(409).json({ success: false, code: "BUS_NOT_AVAILABLE", error: "Izabrani autobus nije aktivan." });
      }

      const date = initialReport.date;
      const originalName = safeDriver(originalDriverSnap).name;
      const replacementName = safeDriver(replacementDriverSnap).name;
      const originalShiftRef = companyRef.collection("shifts").doc(shiftDocumentId(initialReport.driverId, date));
      const replacementShiftRef = companyRef.collection("shifts").doc(shiftDocumentId(parsed.data.replacementDriverId, date));
      const month = scheduleMonthFromDate(date);
      const day = scheduleDayNumber(date);
      const originalScheduleId = scheduleDocumentId(initialReport.driverId, originalName, month).canonical;
      const replacementScheduleId = scheduleDocumentId(parsed.data.replacementDriverId, replacementName, month).canonical;
      const originalScheduleRef = companyRef.collection("schedules").doc(originalScheduleId);
      const replacementScheduleRef = companyRef.collection("schedules").doc(replacementScheduleId);
      const auditRef = companyRef.collection("audit_log").doc();
      const busConflictQuery = companyRef.collection("shifts")
        .where("date", "==", date)
        .where("bus", "==", parsed.data.replacementBus);

      const result = await db().runTransaction(async (tx) => {
        const [reportSnap, originalShiftSnap, replacementShiftSnap, originalScheduleSnap, replacementScheduleSnap, busConflicts] = await Promise.all([
          tx.get(reportRef),
          tx.get(originalShiftRef),
          tx.get(replacementShiftRef),
          tx.get(originalScheduleRef),
          tx.get(replacementScheduleRef),
          tx.get(busConflictQuery)
        ]);
        const replacementGroupId = replacementDriver.groupId || replacementDriver.lineId || groupId;
        const lockScopes = new Map();
        if (groupId && month) lockScopes.set(`${groupId}|${month}`, { groupId, month });
        if (replacementGroupId && month) {
          lockScopes.set(`${replacementGroupId}|${month}`, { groupId: replacementGroupId, month });
        }
        const importGates = [];
        for (const scope of lockScopes.values()) {
          importGates.push(await readMonthlyImportLockInTx(tx, companyRef, scope.groupId, scope.month));
        }
        const guardCandidateKeys = new Set();
        if (primaryGuardKey) guardCandidateKeys.add(primaryGuardKey);
        if (initialReport.guardKey) guardCandidateKeys.add(initialReport.guardKey);
        if (initialReport.scopeKey) guardCandidateKeys.add(initialReport.scopeKey);

        const guardSnaps = await Promise.all(
          Array.from(guardCandidateKeys).map(async (gKey) => {
            const gRef = companyRef.collection("ops_active_incidents").doc(gKey);
            const gSnap = await tx.get(gRef);
            return { gRef, gSnap };
          })
        );
        const guardsToDelete = guardSnaps
          .filter(({ gSnap }) => gSnap.exists && gSnap.data()?.reportId === reportId.data)
          .map(({ gRef }) => gRef);

        if (!reportSnap.exists || !isActiveReportStatus(reportSnap.data().status)) {
          const error = new Error("incident_not_active");
          error.code = "incident_not_active";
          throw error;
        }
        const originalRevision = assertExpectedRevision(originalShiftSnap.exists ? originalShiftSnap.data() : null, parsed.data.expectedOriginalRevision);
        const replacementRevision = assertExpectedRevision(replacementShiftSnap.exists ? replacementShiftSnap.data() : null, parsed.data.expectedReplacementRevision);
        if (!originalRevision.ok || !replacementRevision.ok) {
          const error = new Error("revision_conflict");
          error.code = "revision_conflict";
          throw error;
        }
        for (const gate of importGates) {
          if (!gate.decision.ok) {
            const error = new Error(gate.decision.code);
            error.code = gate.decision.code;
            error.recoveryRequired = gate.decision.recoveryRequired === true;
            error.retryable = gate.decision.retryable === true;
            throw error;
          }
        }
        const replacementScheduleDay = day != null
          ? replacementScheduleSnap.data()?.parsedShifts?.[day]
          : null;
        const replacementDutyType = replacementShiftSnap.exists
          ? replacementShiftSnap.data().type
          : replacementScheduleDay?.type;
        const availableReplacementTypes = new Set(["clear", "off", "bereitschaft", "standby"]);
        const sameDriverRefs = originalShiftRef.id === replacementShiftRef.id;
        if (!sameDriverRefs && replacementDutyType && !availableReplacementTypes.has(replacementDutyType)) {
          const error = new Error("driver_conflict");
          error.code = "driver_conflict";
          throw error;
        }
        const conflictingBus = busConflicts.docs.some((doc) =>
          doc.id !== originalShiftRef.id && doc.id !== replacementShiftRef.id && doc.data().type !== "clear"
        );
        if (conflictingBus) {
          const error = new Error("bus_conflict");
          error.code = "bus_conflict";
          throw error;
        }

        const priorShift = sameDriverRefs && originalShiftSnap.exists
          ? originalShiftSnap.data()
          : (replacementShiftSnap.exists ? replacementShiftSnap.data() : null);
        const shiftData = {
          driverId: parsed.data.replacementDriverId,
          date,
          type: (sameDriverRefs && priorShift?.type) || initialReport.shiftType || "morning",
          name: (sameDriverRefs && priorShift?.name) || initialReport.shiftName || "",
          bus: parsed.data.replacementBus,
          routeCode: (sameDriverRefs && priorShift?.routeCode) || initialReport.shiftName || "",
          start: priorShift?.start || (originalShiftSnap.exists ? originalShiftSnap.data().start || undefined : undefined),
          end: priorShift?.end || (originalShiftSnap.exists ? originalShiftSnap.data().end || undefined : undefined)
        };

        const resolvedDutyCode = String(shiftData.routeCode || shiftData.name || "").trim().toUpperCase();
        const dutyGuardKey = resolvedDutyCode && !isPassiveDutyType(shiftData.type)
          ? canonicalDutyGuardKey({ groupId, serviceDate: date, dutyCode: resolvedDutyCode })
          : null;
        const dutyGuardDocRef = dutyGuardKey ? dutyGuardRef(companyRef, dutyGuardKey) : null;
        const dutyGuardSnap = dutyGuardDocRef ? await tx.get(dutyGuardDocRef) : null;

        if (dutyGuardSnap && dutyGuardSnap.exists) {
          const gData = dutyGuardSnap.data() || {};
          if (gData.ownerDriverId && gData.ownerDriverId !== initialReport.driverId && gData.ownerDriverId !== parsed.data.replacementDriverId) {
            const error = new Error("DUTY_ALREADY_ASSIGNED");
            error.code = "DUTY_ALREADY_ASSIGNED";
            error.conflict = {
              dutyCode: resolvedDutyCode,
              date,
              groupId,
              existingDriverId: gData.ownerDriverId,
              existingDriverName: gData.ownerDriverName || gData.ownerDriverId
            };
            throw error;
          }
        }

        for (const gate of importGates) {
          if (gate.decision.clearLock) tx.delete(gate.lockRef);
        }

        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        if (!sameDriverRefs) {
          if (originalShiftSnap.exists) tx.delete(originalShiftRef);
          if (originalScheduleSnap.exists && day != null) {
            const originalSchedule = originalScheduleSnap.data();
            const parsedShifts = { ...(originalSchedule.parsedShifts || {}) };
            delete parsedShifts[day];
            tx.set(originalScheduleRef, {
              ...originalSchedule, parsedShifts,
              revision: currentRevision(originalSchedule) + 1,
              updatedAt: assignedAt,
              updatedBy: req.staff.uid
            }, { merge: true });
          }
        }

        const replacementShift = buildAssignedShift({
          data: shiftData,
          driverName: replacementName,
          driverGroupId: groupId,
          staffUid: req.staff.uid,
          revision: currentRevision(priorShift) + 1,
          assignedAt,
          priorSnapshot: capturePriorSnapshot(priorShift)
        });
        tx.set(replacementShiftRef, replacementShift);

        if (dutyGuardDocRef) {
          if (dutyGuardSnap && dutyGuardSnap.exists) {
            writeDutyGuardTransferInTx(tx, dutyGuardDocRef, admin().firestore.FieldValue, {
              ownerDriverId: parsed.data.replacementDriverId,
              ownerShiftDocumentId: replacementShiftRef.id,
              assignedBus: parsed.data.replacementBus || "",
              staffUid: req.staff.uid
            });
          } else {
            writeDutyGuardClaimInTx(tx, dutyGuardDocRef, admin().firestore.FieldValue, {
              companyId: req.staff.companyId,
              groupId,
              serviceDate: date,
              dutyCode: resolvedDutyCode,
              shiftType: shiftData.type,
              ownerDriverId: parsed.data.replacementDriverId,
              ownerShiftDocumentId: replacementShiftRef.id,
              assignedBus: parsed.data.replacementBus || "",
              staffUid: req.staff.uid
            });
          }
        }
        if (day != null) {
          const scheduleBase = replacementScheduleSnap.exists
            ? replacementScheduleSnap.data()
            : { id: replacementScheduleId, driverId: parsed.data.replacementDriverId, driverName: replacementName, groupId, month, parsedShifts: {} };
          const parsedShifts = { ...(scheduleBase.parsedShifts || {}), [day]: buildScheduleDayEntry(replacementShift) };
          tx.set(replacementScheduleRef, {
            ...scheduleBase, parsedShifts,
            revision: currentRevision(scheduleBase) + 1,
            updatedAt: assignedAt,
            updatedBy: req.staff.uid
          }, { merge: true });
        }

        const resolution = {
          type: "replacement",
          summary: `${replacementName} / ${parsed.data.replacementBus}`,
          replacementDriverId: parsed.data.replacementDriverId,
          replacementBus: parsed.data.replacementBus,
          verifiedBy: req.staff.uid,
          verifiedAt: assignedAt
        };
        const problemRevision = currentProblemRevision(reportSnap.data()) + 1;
        const lifecycle = {
          ...(reportSnap.data().lifecycle && typeof reportSnap.data().lifecycle === "object"
            ? reportSnap.data().lifecycle
            : {}),
          applying: assignedAt,
          resolved: assignedAt
        };

        for (const gRef of guardsToDelete) {
          tx.delete(gRef);
        }

        tx.update(reportRef, {
          status: "resolved",
          revision: problemRevision,
          resolution,
          resolvedAt: assignedAt,
          resolvedBy: req.staff.uid,
          assigneeId: req.staff.uid,
          lifecycle
        });
        tx.set(auditRef, {
          action: "operational_incident_resolved",
          actorId: req.staff.uid,
          companyId: req.staff.companyId,
          category: "operations",
          timestamp: assignedAt,
          details: {
            reportId: reportId.data,
            incidentType: primaryIncidentType,
            driverId: initialReport.driverId,
            replacementDriverId: parsed.data.replacementDriverId,
            replacementBus: parsed.data.replacementBus,
            groupId: primaryGroupId,
            scopeKind: primaryScopeKind,
            scopeId: primaryScopeId,
            guardKey: primaryGuardKey,
            date,
            affectedEntity: initialReport.affectedEntity || "driver",
            revision: problemRevision,
            resolutionType: "replacement"
          }
        });
        return { replacementShift, resolution, problemRevision };
      });

      // Best-effort notify + invalidate stale confirms (§10).
      if (confirmationScheduler?.invalidateShiftConfirmations) {
        const invalidateEntries = [
          { driverId: initialReport.driverId, date },
          { driverId: parsed.data.replacementDriverId, date }
        ].filter((row) => row.driverId);
        confirmationScheduler.invalidateShiftConfirmations({
          companyId: req.staff.companyId,
          entries: invalidateEntries,
          reason: "operational_incident_resolved"
        }).catch((err) => {
          req.log?.warn?.({ err }, "Invalidacija potvrda posle resolve-a nije uspela");
        });
      }
      const notifyIds = [...new Set([
        initialReport.driverId,
        parsed.data.replacementDriverId
      ].filter(Boolean))];
      const notified = [];
      try {
        if (notifyIds.length) {
          const batch = db().batch();
          const createdAt = admin().firestore.FieldValue.serverTimestamp();
          const nowDate = new Date();
          for (const targetId of notifyIds) {
            const targetSnap = targetId === parsed.data.replacementDriverId
              ? replacementDriverSnap
              : originalDriverSnap;
            const id = newMessageId();
            const doc = buildStaffMessageDoc({
              id,
              now: nowDate,
              senderName: "Dispatch",
              senderUid: req.staff.uid,
              senderLang: "sr",
              template: "tmpl_shift_now",
              detail: `Plan ${date}: ${replacementName} / bus ${parsed.data.replacementBus}`,
              type: "info",
              scope: "driver",
              broadcast: false,
              recipientName: safeDriver(targetSnap).name,
              recipientDriverId: targetId,
              groupId
            });
            batch.set(companyRef.collection("messages").doc(id), { ...doc, createdAt });
            notified.push(targetId);
          }
          await batch.commit();
          await logAudit(req.staff.companyId, req.staff.uid, "staff_message_sent", {
            mode: "driver",
            template: "tmpl_shift_now",
            scope: "driver",
            broadcast: false,
            groupId,
            messageCount: notified.length,
            recipientDriverIds: notified,
            reason: "operational_incident_resolved"
          });
        }
      } catch (notifyError) {
        req.log?.warn?.({ err: notifyError }, "Obaveštavanje vozača posle resolve-a nije uspelo");
      }

      return res.json({
        success: true,
        report: {
          id: reportId.data,
          status: "resolved",
          revision: result.problemRevision,
          resolution: { ...result.resolution, verifiedAt: null },
          resolvedAt: null
        },
        shift: { ...result.replacementShift, id: replacementShiftRef.id, assignedAt: null },
        removedDriverId: isSameDriverBusSwap ? null : initialReport.driverId,
        notifiedDriverIds: notified
      });
    } catch (error) {
      if (error.code === "MONTHLY_IMPORT_IN_PROGRESS" || error.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED") {
        return res.status(409).json({
          success: false,
          code: error.code,
          retryable: error.retryable === true,
          recoveryRequired: error.recoveryRequired === true,
          error: "Uvoz mesečnog plana je u toku ili zahteva proveru."
        });
      }
      if (error.code === "revision_conflict") {
        return res.status(409).json({ success: false, code: "REVISION_CONFLICT", error: "Plan je u međuvremenu izmenjen. Osvežite prikaz." });
      }
      if (error.code === "DUTY_ALREADY_ASSIGNED") {
        return res.status(409).json({
          success: false,
          code: "DUTY_ALREADY_ASSIGNED",
          error: `Smena ${error.conflict?.dutyCode || ""} za ${parsed.data?.date || ""} već je dodeljena drugom vozaču.`,
          conflict: error.conflict || null
        });
      }
      if (error.code === "bus_conflict") {
        return res.status(409).json({ success: false, code: "BUS_NOT_AVAILABLE", error: "Autobus je u međuvremenu dodeljen drugoj smeni." });
      }
      if (error.code === "driver_conflict") {
        return res.status(409).json({ success: false, code: "DRIVER_NOT_AVAILABLE", error: "Vozač je u međuvremenu dobio drugu smenu." });
      }
      if (error.code === "incident_not_active") {
        return res.status(409).json({ success: false, code: "INCIDENT_NOT_ACTIVE", error: "Incident više nije aktivan." });
      }
      req.log?.error?.({ err: error }, "Atomsko rešavanje operativnog incidenta nije uspelo");
      return res.status(500).json({ success: false, error: "Incident nije mogao bezbedno da se reši." });
    }
  });

  app.get("/api/staff/shift-confirmations", rateLimit(30, 60_000), requireStaff, async (req, res) => {
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const profileSnap = await companyRef.collection("profile").doc("main").get();
      const timezone = profileSnap.exists && profileSnap.data().timezone
        ? profileSnap.data().timezone
        : "Europe/Vienna";
      const today = localDateString(new Date(), timezone);
      const from = String(req.query.from || today).slice(0, 10);
      const to = String(req.query.to || addDays(from, 3)).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
        return res.status(400).json({ success: false, error: "Nevažeći period." });
      }

      const [confirmSnap, outboxSnap, staffSnap, dispatchHealthSnap] = await Promise.all([
        companyRef.collection("shift_confirmations")
          .where("date", ">=", from)
          .where("date", "<=", to)
          .get(),
        companyRef.collection("confirmation_outbox")
          .where("targetDate", ">=", from)
          .where("targetDate", "<=", to)
          .get(),
        companyRef.collection("users").doc(req.staff.uid).get(),
        companyRef.collection("ops").doc("confirmation_dispatch").get()
      ]);

      let allowedDriverIds = null;
      if (req.staff.role === "dispatcher") {
        const groups = staffSnap.exists && Array.isArray(staffSnap.data().groups)
          ? staffSnap.data().groups
          : (req.staff.groups || []);
        // Soft-pilot: home groupId queries only (knownGroupIds is not a directory).
        const groupIds = [...new Set((groups || []).filter(Boolean))].slice(0, 40);
        const driverDocs = await loadDriverDocsForGroups(companyRef, groupIds);
        allowedDriverIds = new Set(driverDocs.map((doc) => doc.id));
      }

      const inRange = (date) => date >= from && date <= to;
      const confirmationsRaw = confirmSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          driverId: data.driverId || null,
          date: data.date || null,
          shiftFingerprint: data.shiftFingerprint || null,
          confirmationBoundRevision: Number.isInteger(data.confirmationBoundRevision)
            ? data.confirmationBoundRevision
            : null,
          confirmedAt: data.confirmedAt?.toDate?.()?.toISOString?.() || data.confirmedAt || null,
          confirmationSourceShiftDate: data.confirmationSourceShiftDate || null
        };
      }).filter((row) => row.driverId && row.date && inRange(row.date)
        && (!allowedDriverIds || allowedDriverIds.has(row.driverId)));

      const outbox = outboxSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          driverId: data.driverId || null,
          targetDate: data.targetDate || null,
          sourceShiftDate: data.sourceShiftDate || null,
          status: data.status || null,
          label: data.label || "next_shift",
          fingerprint: data.fingerprint || null,
          channel: data.channel || "in_app",
          attempts: Number(data.attempts || 0),
          lastAttemptAt: data.lastAttemptAt || null,
          lastError: data.lastError || null,
          nextRetryAt: data.nextRetryAt || null,
          terminalFailure: data.terminalFailure === true,
          deliveredAt: data.deliveredAt || null,
          confirmedAt: data.confirmedAt || null,
          smsStatus: data.smsStatus || null,
          updatedAt: data.updatedAt || null
        };
      }).filter((row) => row.driverId && row.targetDate && inRange(row.targetDate)
        && (!allowedDriverIds || allowedDriverIds.has(row.driverId)));

      const outboxByKey = new Map(
        outbox.map((row) => [`${row.driverId}|${row.targetDate}`, row])
      );
      const confirmations = confirmationsRaw.filter((row) => {
        const ob = outboxByKey.get(`${row.driverId}|${row.date}`);
        if (ob?.status === "cancelled") return false;
        if (isStaleConfirmation(row, { liveFingerprint: ob?.fingerprint || null })) return false;
        return true;
      });

      const confirmedKeys = new Set(
        confirmations.map((row) => `${row.driverId}|${row.date}`)
      );
      const attention = outbox
        .map((row) => classifyOutboxForOps(row, confirmedKeys, { today }))
        .filter(Boolean)
        .sort((a, b) => {
          if (a.severity === b.severity) return String(a.targetDate).localeCompare(String(b.targetDate));
          return a.severity === "critical" ? -1 : 1;
        });

      const summary = {
        ...summarizeOutboxStatuses(outbox),
        expired: attention.filter((row) => row.kind === "expired").length
      };

      const dispatchHealth = dispatchHealthSnap.exists
        ? {
          lastRunAt: dispatchHealthSnap.data().lastRunAt || null,
          schedulerEnabled: dispatchHealthSnap.data().schedulerEnabled === true,
          processed: Number(dispatchHealthSnap.data().processed || 0),
          delivered: Number(dispatchHealthSnap.data().delivered || 0),
          failed: Number(dispatchHealthSnap.data().failed || 0),
          terminalFailed: Number(dispatchHealthSnap.data().terminalFailed || 0),
          skippedInactiveSession: Number(dispatchHealthSnap.data().skippedInactiveSession || 0),
          skippedRetryWindow: Number(dispatchHealthSnap.data().skippedRetryWindow || 0),
          scanned: Number(dispatchHealthSnap.data().scanned || 0)
        }
        : null;

      return res.json({
        success: true,
        timezone,
        from,
        to,
        confirmations,
        outbox,
        summary,
        attention,
        dispatchHealth
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Učitavanje potvrda smena nije uspelo");
      return res.status(500).json({ success: false, error: "Potvrde smena nisu mogle biti učitane." });
    }
  });

  app.post("/api/staff/monthly-plans/import/preview", rateLimit(10, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može pripremiti mesečni plan." });
    }
    const parsed = monthlyPlanImportPreviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PLAN_IMPORT",
        error: "Paket mesečnog plana nije ispravan."
      });
    }
    if (!req.staff.groups.includes(parsed.data.groupId)) {
      return res.status(403).json({
        success: false,
        code: "GROUP_ACCESS_DENIED",
        error: "Pristup izabranoj grupi nije dozvoljen."
      });
    }

    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const driverIds = [...new Set(parsed.data.rows.map((row) => row.driverId))];
      const driverRefs = driverIds.map((driverId) => companyRef.collection("drivers").doc(driverId));
      const [driverSnaps, monthlyShiftsSnap, activePlan, busesSnap] = await Promise.all([
        db().getAll(...driverRefs),
        companyRef.collection("shifts")
          .where("date", ">=", `${parsed.data.month}-01`)
          .where("date", "<=", `${parsed.data.month}-31`)
          .get(),
        getActiveServicePlan({
          db: db(),
          companyId: req.staff.companyId,
          groupId: parsed.data.groupId
        }),
        companyRef.collection("buses").get()
      ]);
      const driversById = new Map(driverSnaps
        .filter((snap) => snap.exists)
        .map((snap) => [snap.id, { id: snap.id, ...snap.data() }]));
      const shiftsById = new Map(monthlyShiftsSnap.docs
        .map((doc) => doc.data())
        .filter((shift) => shift.driverId && shift.date)
        .map((shift) => [`${shift.driverId}|${shift.date}`, shift]));
      const dutiesByCode = new Map();
      for (const duty of activePlan?.duties || []) {
        const code = String(duty.code || "").trim().toUpperCase();
        if (code) dutiesByCode.set(code, duty);
      }
      const busesByNumber = new Map();
      busesSnap.docs.forEach((doc) => {
        const bus = { id: doc.id, ...doc.data() };
        const number = String(bus.number || "").trim();
        if (number) {
          busesByNumber.set(number, bus);
          busesByNumber.set(number.toUpperCase(), bus);
        }
      });

      const preview = buildPlanImportPreview({
        companyId: req.staff.companyId,
        staffUid: req.staff.uid,
        payload: parsed.data,
        driversById,
        shiftsById,
        dutiesByCode,
        busesByNumber,
        requireDutyCatalog: true
      });
      const prepared = await prepareStaffMonthlyImport({
        db: db(),
        admin: admin(),
        companyId: req.staff.companyId,
        actorId: req.staff.uid,
        preview
      });
      await logAudit(req.staff.companyId, req.staff.uid, "monthly_plan_import_previewed", {
        importId: prepared.id,
        fingerprint: preview.fingerprint,
        groupId: preview.groupId,
        month: preview.month,
        sourceName: preview.sourceName,
        reason: preview.reason,
        summary: preview.summary
      });
      return res.json({
        success: true,
        importId: prepared.id,
        fingerprint: prepared.fingerprint,
        expiresAt: prepared.expiresAt,
        preview: {
          fingerprint: preview.fingerprint,
          groupId: preview.groupId,
          month: preview.month,
          sourceName: preview.sourceName,
          reason: preview.reason,
          summary: preview.summary,
          rows: prepared.rows
        }
      });
    } catch (error) {
      if (error instanceof PlanImportValidationError) {
        await logAudit(req.staff.companyId, req.staff.uid, "monthly_plan_import_preview_failed", {
          groupId: parsed.data.groupId,
          month: parsed.data.month,
          sourceName: parsed.data.sourceName,
          reason: parsed.data.reason,
          errorCount: error.errors.length,
          codes: [...new Set(error.errors.map((item) => item.code))].slice(0, 20)
        }).catch(() => {});
        return res.status(422).json({
          success: false,
          code: error.code,
          error: "Plan sadrži podatke koji moraju biti ispravljeni.",
          details: error.errors
        });
      }
      if (error instanceof GroupMonthlyImportError) {
        return res.status(error.status || 409).json({
          success: false,
          code: error.code,
          error: "Uvoz nije mogao biti pripremljen.",
          details: error.details || []
        });
      }
      req.log?.error?.({ err: error }, "Pregled uvoza mesečnog plana nije uspeo");
      return res.status(500).json({
        success: false,
        code: "PLAN_IMPORT_PREVIEW_FAILED",
        error: "Pregled mesečnog plana nije mogao biti pripremljen."
      });
    }
  });

  app.put("/api/staff/monthly-plans/import/commit", rateLimit(10, 60_000), requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može potvrditi mesečni plan." });
    }
    const parsed = monthlyPlanImportCommitSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        code: "INVALID_PLAN_IMPORT_COMMIT",
        error: "Potvrda uvoza nije ispravna."
      });
    }
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const importSnap = await companyRef.collection("monthly_plan_imports").doc(parsed.data.importId).get();
      if (!importSnap.exists) {
        return res.status(404).json({
          success: false,
          code: "MONTHLY_IMPORT_NOT_FOUND",
          error: "Pripremljeni uvoz nije pronađen."
        });
      }
      const job = importSnap.data() || {};
      if (!req.staff.groups.includes(job.groupId)) {
        return res.status(403).json({
          success: false,
          code: "GROUP_ACCESS_DENIED",
          error: "Pristup izabranoj grupi nije dozvoljen."
        });
      }
      const result = await commitStaffMonthlyImport({
        db: db(),
        admin: admin(),
        companyId: req.staff.companyId,
        actorId: req.staff.uid,
        importId: parsed.data.importId,
        fingerprint: parsed.data.fingerprint,
        actorGroups: req.staff.groups
      });
      await logAudit(req.staff.companyId, req.staff.uid, "monthly_plan_import_committed", {
        importId: result.id,
        fingerprint: parsed.data.fingerprint,
        groupId: job.groupId,
        month: job.month,
        summary: result.summary,
        idempotent: result.idempotent === true
      });
      return res.json({
        success: true,
        importId: result.id,
        summary: result.summary,
        idempotent: result.idempotent === true
      });
    } catch (error) {
      if (error instanceof GroupMonthlyImportError) {
        const compensationFailed = error.code === "MONTHLY_IMPORT_COMPENSATION_FAILED";
        const recovery = error.recoveryRequired === true
          || compensationFailed
          || error.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED";
        const inProgress = error.code === "MONTHLY_IMPORT_IN_PROGRESS"
          || error.retryable === true;
        const compensated = error.compensated === true;
        // compensation_failed audit action only for real compensation process failure.
        const auditAction = compensationFailed
          ? "monthly_plan_import_compensation_failed"
          : "monthly_plan_import_failed";
        await logAudit(req.staff.companyId, req.staff.uid, auditAction, {
          importId: parsed.data.importId,
          fingerprint: parsed.data.fingerprint,
          code: error.code,
          details: (error.details || []).slice(0, 20),
          recoveryRequired: recovery === true,
          retryable: inProgress === true,
          compensated: compensated === true
        }).catch(() => {});
        let message = "Uvoz nije potvrđen.";
        if (compensationFailed) {
          message = "Uvoz nije potvrđen. Automatski povrat nije uspeo — potrebna je provera (recovery_required).";
        } else if (recovery) {
          message = "Uvoz nije potvrđen. Stanje zahteva proveru — plan se ne smatra čistim.";
        } else if (inProgress) {
          message = "Uvoz se još obrađuje — pokušajte ponovo uskoro.";
        } else if (compensated) {
          message = "Uvoz nije potvrđen. Delimične izmene su poništene.";
        }
        return res.status(error.status || 409).json({
          success: false,
          code: error.code,
          recoveryRequired: recovery === true,
          retryable: inProgress === true,
          compensated: compensated === true,
          error: message,
          details: error.details || []
        });
      }
      req.log?.error?.({ err: error }, "Potvrda uvoza mesečnog plana nije uspela");
      await logAudit(req.staff.companyId, req.staff.uid, "monthly_plan_import_failed", {
        importId: parsed.data.importId,
        fingerprint: parsed.data.fingerprint,
        code: "MONTHLY_IMPORT_COMMIT_FAILED"
      }).catch(() => {});
      return res.status(500).json({
        success: false,
        code: "MONTHLY_IMPORT_COMMIT_FAILED",
        recoveryRequired: false,
        compensated: false,
        error: "Uvoz nije potvrđen. Ishod nije potvrđen — proverite plan pre novog uvoza."
      });
    }
  });

  app.put("/api/staff/shifts/assignment", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može menjati raspored vozača." });
    }
    const parsed = shiftAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Neva\u017ee\u0107a smena." });
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const [driverSnap, staffSnap] = await Promise.all([
        companyRef.collection("drivers").doc(parsed.data.driverId).get(),
        companyRef.collection("users").doc(req.staff.uid).get()
      ]);
      if (!driverSnap.exists) return res.status(404).json({ success: false, error: "Voza\u010d nije prona\u0111en." });
      // Preflight gate only — LIVE staff/groups are revalidated fail-closed inside the mutation tx (D24.1.1).
      if (!staffSnap.exists) {
        return res.status(403).json({
          success: false,
          code: "STAFF_SESSION_INVALID",
          error: assignmentResourceErrorMessage("STAFF_SESSION_INVALID")
        });
      }
      const preflightStaff = staffSnap.data() || {};
      if (preflightStaff.active === false || String(preflightStaff.role || "") !== "dispatcher") {
        return res.status(403).json({
          success: false,
          code: "STAFF_SESSION_INVALID",
          error: assignmentResourceErrorMessage("STAFF_SESSION_INVALID")
        });
      }
      const groups = Array.isArray(preflightStaff.groups) ? preflightStaff.groups : null;
      if (!groups) {
        return res.status(403).json({
          success: false,
          code: "STAFF_SESSION_INVALID",
          error: assignmentResourceErrorMessage("STAFF_SESSION_INVALID")
        });
      }
      const driver = driverSnap.data();
      const driverGroupId = driver.groupId || driver.lineId || null;
      if (!driverGroupId || !groups.includes(driverGroupId)) {
        return res.status(403).json({ success: false, error: "Pristup voza\u010du van dodeljene grupe nije dozvoljen." });
      }

      const importLock = await assertNoActiveGroupMonthlyImport({
        db: db(),
        companyId: req.staff.companyId,
        groupId: driverGroupId,
        month: scheduleMonthFromDate(parsed.data.date)
      });
      if (!importLock.ok) {
        return res.status(409).json({
          success: false,
          code: importLock.code,
          error: "Uvoz mesečnog plana za ovu grupu je u toku. Pokušajte ponovo kada se uvoz završi."
        });
      }

      // First-writer lock: first successful mutate acquires; others blocked until release/TTL/break-glass
      const { ensureAssignmentDayLock } = require("./plan-edit-lock-routes");
      const lockCheck = await ensureAssignmentDayLock({
        db,
        companyId: req.staff.companyId,
        staff: req.staff,
        groupId: driverGroupId,
        dateStr: parsed.data.date
      });
      if (!lockCheck.ok) {
        return res.status(409).json({
          success: false,
          code: lockCheck.code || "LOCK_HELD",
          error: "Plan trenutno uređuje drugi disponent.",
          lock: lockCheck.lock || null
        });
      }
      // Group for which the day-lock was acquired — must match LIVE home group in tx.
      const lockedGroupId = driverGroupId;

      const driverName = safeDriver(driverSnap).name;
      const shiftId = shiftDocumentId(parsed.data.driverId, parsed.data.date);
      const shiftRef = companyRef.collection("shifts").doc(shiftId);
      const yearMonth = scheduleMonthFromDate(parsed.data.date);
      const dayNum = scheduleDayNumber(parsed.data.date);
      const scheduleIds = scheduleDocumentId(parsed.data.driverId, driverName, yearMonth);
      const scheduleRef = companyRef.collection("schedules").doc(scheduleIds.canonical);
      const legacyScheduleRef = companyRef.collection("schedules").doc(scheduleIds.legacyName);

      // Resolve legacy duplicate docs outside the transaction (same day, non-canonical id).
      const legacyShiftQuery = await companyRef.collection("shifts")
        .where("driverId", "==", parsed.data.driverId)
        .where("date", "==", parsed.data.date)
        .get();
      const legacyShiftRefs = legacyShiftQuery.docs
        .filter((doc) => doc.id !== shiftId)
        .map((doc) => doc.ref);

      const busNumber = String(parsed.data.bus || "").trim();
      const needsBusGuard = parsed.data.type !== "clear" && isActiveDutyType(parsed.data.type) && Boolean(busNumber);
      const dutyCode = String(parsed.data.routeCode || parsed.data.name || "").trim().toUpperCase();
      const needsDutyGuard = parsed.data.type !== "clear" && isActiveDutyType(parsed.data.type) && Boolean(dutyCode);
      const driverRef = companyRef.collection("drivers").doc(parsed.data.driverId);
      const staffUserRef = companyRef.collection("users").doc(req.staff.uid);
      const busConflictQuery = needsBusGuard
        ? companyRef.collection("shifts").where("date", "==", parsed.data.date).where("bus", "==", busNumber)
        : null;
      const busLookupQuery = needsBusGuard
        ? companyRef.collection("buses").where("number", "==", busNumber).limit(5)
        : null;
      const legacyDutyConflictQuery = needsDutyGuard
        ? companyRef.collection("shifts").where("date", "==", parsed.data.date).where("routeCode", "==", dutyCode)
        : null;

      const result = await db().runTransaction(async (tx) => {
        // D24.1: all authoritative reads before first write (live bus/scope/duty/revision).
        const liveDriverSnap = await tx.get(driverRef);
        const liveStaffSnap = await tx.get(staffUserRef);
        const shiftSnap = await tx.get(shiftRef);
        const legacyShiftSnaps = [];
        for (const ref of legacyShiftRefs) {
          legacyShiftSnaps.push(await tx.get(ref));
        }
        const scheduleSnap = await tx.get(scheduleRef);
        const legacyScheduleSnap = await tx.get(legacyScheduleRef);
        const busLookupSnap = busLookupQuery ? await tx.get(busLookupQuery) : null;
        const busConflictSnap = busConflictQuery ? await tx.get(busConflictQuery) : null;
        const legacyDutyConflictSnap = legacyDutyConflictQuery ? await tx.get(legacyDutyConflictQuery) : null;

        // D24.1.1 — LIVE staff fail-closed (no claims/middleware fallback).
        if (!liveStaffSnap.exists) {
          const error = new Error("STAFF_SESSION_INVALID");
          error.code = "STAFF_SESSION_INVALID";
          throw error;
        }
        const liveStaff = liveStaffSnap.data() || {};
        if (liveStaff.active === false) {
          const error = new Error("STAFF_SESSION_INVALID");
          error.code = "STAFF_SESSION_INVALID";
          throw error;
        }
        if (String(liveStaff.role || "") !== "dispatcher") {
          const error = new Error("STAFF_SESSION_INVALID");
          error.code = "STAFF_SESSION_INVALID";
          throw error;
        }
        const liveGroups = Array.isArray(liveStaff.groups) ? liveStaff.groups : null;
        if (!liveGroups) {
          const error = new Error("STAFF_SESSION_INVALID");
          error.code = "STAFF_SESSION_INVALID";
          throw error;
        }

        if (!liveDriverSnap.exists) {
          const error = new Error("DRIVER_NOT_FOUND");
          error.code = "DRIVER_NOT_FOUND";
          throw error;
        }
        const liveDriver = liveDriverSnap.data() || {};
        const liveDriverGroupId = liveDriver.groupId || liveDriver.lineId || null;
        const writeDriverGroupId = lockedGroupId;
        const writeDriverName = safeDriver(liveDriverSnap).name || driverName;
        if (!liveDriverGroupId || String(liveDriverGroupId) !== String(lockedGroupId)) {
          // D24.1.1.1: mismatch is authoritative internally; response must stay data-minimal.
          const error = new Error("DRIVER_SCOPE_CHANGED");
          error.code = "DRIVER_SCOPE_CHANGED";
          throw error;
        }
        if (!liveGroups.includes(liveDriverGroupId)) {
          const error = new Error("DRIVER_SCOPE_DENIED");
          error.code = "DRIVER_SCOPE_DENIED";
          throw error;
        }
        // New assignments require an active driver; clear may remove an existing duty.
        if (parsed.data.type !== "clear" && liveDriver.active === false) {
          const error = new Error("DRIVER_INACTIVE");
          error.code = "DRIVER_INACTIVE";
          throw error;
        }
        // Import lock stays on the locked group (same as LIVE after drift check).
        const importGate = await readMonthlyImportLockInTx(
          tx, companyRef, lockedGroupId, yearMonth
        );

        let assignmentStart = parsed.data.start || null;
        let assignmentEnd = parsed.data.end || null;
        if (needsDutyGuard) {
          let activePlan = null;
          try {
            activePlan = await getActiveServicePlanInTx(tx, companyRef, liveDriverGroupId);
          } catch (catalogErr) {
            if (catalogErr?.code === "invalid-group") {
              const error = new Error("invalid-group");
              error.code = "invalid-group";
              throw error;
            }
            throw catalogErr;
          }
          const dutiesByCode = new Map();
          for (const duty of activePlan?.duties || []) {
            const code = String(duty.code || "").trim();
            if (!code) continue;
            dutiesByCode.set(code, duty);
            dutiesByCode.set(code.toUpperCase(), duty);
          }
          const dutyCheck = evaluateDutyAgainstCatalog({
            type: parsed.data.type,
            dutyCode,
            start: assignmentStart,
            end: assignmentEnd,
            dutiesByCode
          });
          if (!dutyCheck.ok) {
            const error = new Error(dutyCheck.code);
            error.code = dutyCheck.code;
            error.dutyCode = dutyCheck.dutyCode || dutyCode;
            error.expectedStart = dutyCheck.expectedStart || null;
            error.expectedEnd = dutyCheck.expectedEnd || null;
            throw error;
          }
          if (dutyCheck.start && !assignmentStart) assignmentStart = dutyCheck.start;
          if (dutyCheck.end && !assignmentEnd) assignmentEnd = dutyCheck.end;
        }

        const legacyExisting = legacyShiftSnaps.find((snap) => snap.exists)?.data() || null;
        const existing = shiftSnap.exists ? shiftSnap.data() : legacyExisting;
        const revisionCheck = assertExpectedRevision(existing, parsed.data.expectedRevision);
        if (!revisionCheck.ok) {
          const error = new Error(revisionCheck.reason || "revision_conflict");
          error.code = revisionCheck.reason || "revision_conflict";
          error.currentRevision = revisionCheck.currentRevision ?? 0;
          error.current = revisionCheck.current || existing;
          throw error;
        }
        if (!importGate.decision.ok) {
          const error = new Error(importGate.decision.code);
          error.code = importGate.decision.code;
          error.recoveryRequired = importGate.decision.recoveryRequired === true;
          error.retryable = importGate.decision.retryable === true;
          throw error;
        }

        // Canonical Duty Guard: Read & Evaluate
        const incomingDutyGuardKey = needsDutyGuard ? canonicalDutyGuardKey({ groupId: liveDriverGroupId, serviceDate: parsed.data.date, dutyCode }) : null;
        const incomingDutyGuardRef = incomingDutyGuardKey ? dutyGuardRef(companyRef, incomingDutyGuardKey) : null;
        const incomingDutyGuardSnap = incomingDutyGuardRef ? await tx.get(incomingDutyGuardRef) : null;

        const existingDutyCode = (existing && !isPassiveDutyType(existing.type)) ? String(existing.routeCode || existing.name || "").trim().toUpperCase() : "";
        const targetDutyCode = needsDutyGuard ? dutyCode : "";
        const oldDutyGuardKey = (existingDutyCode && existingDutyCode !== targetDutyCode) ? canonicalDutyGuardKey({ groupId: liveDriverGroupId, serviceDate: parsed.data.date, dutyCode: existingDutyCode }) : null;
        const oldDutyGuardRef = oldDutyGuardKey ? dutyGuardRef(companyRef, oldDutyGuardKey) : null;
        const oldDutyGuardSnap = oldDutyGuardRef ? await tx.get(oldDutyGuardRef) : null;

        if (needsDutyGuard) {
          if (incomingDutyGuardSnap && incomingDutyGuardSnap.exists) {
            const claimCheck = evaluateDutyGuardClaim({
              guardData: incomingDutyGuardSnap.data(),
              driverId: parsed.data.driverId,
              driverName: writeDriverName,
              shiftDocumentId: shiftId,
              date: parsed.data.date,
              groupId: liveDriverGroupId,
              dutyCode
            });
            if (!claimCheck.ok) {
              const error = new Error(claimCheck.code);
              error.code = claimCheck.code;
              error.conflict = claimCheck.conflict;
              throw error;
            }
          } else if (legacyDutyConflictSnap) {
            const conflictDoc = legacyDutyConflictSnap.docs.find((doc) => {
              const d = doc.data() || {};
              return doc.id !== shiftId
                && d.driverId !== parsed.data.driverId
                && !isPassiveDutyType(d.type)
                && (String(d.groupId || d.lineId || "") === String(liveDriverGroupId));
            });
            if (conflictDoc) {
              const conflicting = conflictDoc.data() || {};
              const error = new Error("DUTY_ALREADY_ASSIGNED");
              error.code = "DUTY_ALREADY_ASSIGNED";
              error.conflict = {
                dutyCode,
                date: parsed.data.date,
                groupId: liveDriverGroupId,
                existingDriverId: conflicting.driverId,
                existingDriverName: conflicting.driverName || conflicting.driverId,
                existingShiftId: conflictDoc.id
              };
              throw error;
            }
          }
        }

        if (needsBusGuard) {
          const liveBusDoc = (busLookupSnap?.docs || [])
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .find((row) => row.active !== false)
            || (busLookupSnap?.docs?.[0]
              ? { id: busLookupSnap.docs[0].id, ...busLookupSnap.docs[0].data() }
              : null);
          const busCheck = evaluateBusResource({
            bus: liveBusDoc,
            busNumber,
            groupId: liveDriverGroupId,
            existingBusNumber: existing?.bus || null
          });
          if (!busCheck.ok) {
            const error = new Error(busCheck.code);
            error.code = busCheck.code;
            error.bus = busNumber;
            error.opsStatus = busCheck.opsStatus || null;
            throw error;
          }
          const conflictShifts = (busConflictSnap?.docs || []).map((doc) => ({
            id: doc.id,
            ...doc.data()
          }));
          const overlaps = findOverlappingBusAssignments(conflictShifts, {
            bus: busNumber,
            date: parsed.data.date,
            excludeDriverId: parsed.data.driverId,
            excludeShiftId: shiftId,
            start: assignmentStart,
            end: assignmentEnd
          });
          if (overlaps.length) {
            const error = new Error("BUS_DOUBLE_BOOKED");
            error.code = "BUS_DOUBLE_BOOKED";
            error.bus = busNumber;
            error.conflict = { bus: overlaps[0] };
            throw error;
          }
        }

        // Apply duty-derived times for the write payload (still inside tx, before writes).
        if (assignmentStart && !parsed.data.start) parsed.data.start = assignmentStart;
        if (assignmentEnd && !parsed.data.end) parsed.data.end = assignmentEnd;
        if (_assignmentMutationHookForTests) {
          await _assignmentMutationHookForTests({
            tx,
            phase: "before-writes",
            companyRef,
            busNumber,
            lockedGroupId,
            driverId: parsed.data.driverId,
            date: parsed.data.date
          });
        }

        if (importGate.decision.clearLock) tx.delete(importGate.lockRef);

        legacyShiftSnaps.forEach((snap) => {
          if (snap.exists) tx.delete(snap.ref);
        });

        const scheduleBaseSnap = scheduleSnap.exists ? scheduleSnap : legacyScheduleSnap;

        if (parsed.data.type === "clear") {
          const priorSnapshot = capturePriorSnapshot(existing);
          const revision = currentRevision(existing) + 1;
          const assignedAt = admin().firestore.FieldValue.serverTimestamp();
          const cleared = buildClearedShift({
            data: parsed.data,
            driverName: writeDriverName,
            driverGroupId: writeDriverGroupId,
            staffUid: req.staff.uid,
            revision,
            priorSnapshot,
            assignedAt
          });
          tx.set(shiftRef, cleared);
          if (oldDutyGuardRef && oldDutyGuardSnap?.exists && oldDutyGuardSnap.data()?.ownerDriverId === parsed.data.driverId) {
            writeDutyGuardReleaseInTx(tx, oldDutyGuardRef);
          } else if (existingDutyCode) {
            const clearOldGuardKey = canonicalDutyGuardKey({ groupId: liveDriverGroupId, serviceDate: parsed.data.date, dutyCode: existingDutyCode });
            if (clearOldGuardKey) {
              const clearOldRef = dutyGuardRef(companyRef, clearOldGuardKey);
              writeDutyGuardReleaseInTx(tx, clearOldRef);
            }
          }

          if (scheduleBaseSnap.exists && dayNum != null) {
            const schedule = { ...scheduleBaseSnap.data() };
            const parsedShifts = { ...(schedule.parsedShifts || {}) };
            delete parsedShifts[dayNum];
            delete parsedShifts[String(dayNum)];
            tx.set(scheduleRef, {
              ...schedule,
              id: scheduleIds.canonical,
              driverId: parsed.data.driverId,
              driverName: writeDriverName,
              groupId: writeDriverGroupId,
              month: yearMonth,
              parsedShifts,
              revision: currentRevision(schedule) + 1,
              updatedAt: assignedAt,
              updatedBy: req.staff.uid
            }, { merge: true });
            if (scheduleBaseSnap.id !== scheduleIds.canonical) tx.delete(legacyScheduleRef);
          }
          return { deleted: true, shiftId, revision, shift: cleared };
        }

        const priorSnapshot = capturePriorSnapshot(existing);
        const revision = currentRevision(existing) + 1;
        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        const shift = buildAssignedShift({
          data: parsed.data,
          driverName: writeDriverName,
          driverGroupId: writeDriverGroupId,
          staffUid: req.staff.uid,
          revision,
          assignedAt,
          priorSnapshot
        });
        tx.set(shiftRef, shift);
        if (incomingDutyGuardRef) {
          writeDutyGuardClaimInTx(tx, incomingDutyGuardRef, admin().firestore.FieldValue, {
            companyId: req.staff.companyId,
            groupId: writeDriverGroupId,
            serviceDate: parsed.data.date,
            dutyCode,
            shiftType: parsed.data.type,
            ownerDriverId: parsed.data.driverId,
            ownerShiftDocumentId: shiftId,
            assignedBus: busNumber,
            staffUid: req.staff.uid
          });
        }
        if (oldDutyGuardRef && oldDutyGuardSnap?.exists && oldDutyGuardSnap.data()?.ownerDriverId === parsed.data.driverId) {
          writeDutyGuardReleaseInTx(tx, oldDutyGuardRef);
        }

        if (dayNum != null) {
          const base = scheduleBaseSnap.exists
            ? scheduleBaseSnap.data()
            : { fileName: "", fileType: "application/json", fileData: "", parsedShifts: {} };
          const parsedShifts = { ...(base.parsedShifts || {}) };
          parsedShifts[dayNum] = buildScheduleDayEntry(shift);
          tx.set(scheduleRef, {
            ...base,
            id: scheduleIds.canonical,
            driverId: parsed.data.driverId,
            driverName: writeDriverName,
            groupId: writeDriverGroupId,
            month: yearMonth,
            parsedShifts,
            revision: currentRevision(base) + 1,
            updatedAt: assignedAt,
            updatedBy: req.staff.uid
          }, { merge: true });
          if (scheduleBaseSnap.exists && scheduleBaseSnap.id !== scheduleIds.canonical) {
            tx.delete(legacyScheduleRef);
          }
        }

        return { deleted: false, shiftId, shift, revision };
      });

      if (result.deleted) {
        await logAudit(req.staff.companyId, req.staff.uid, "shift_removed", {
          shiftId: result.shiftId, driverId: parsed.data.driverId, date: parsed.data.date,
          revision: result.revision
        });
        if (confirmationScheduler?.invalidateShiftConfirmations) {
          confirmationScheduler.invalidateShiftConfirmations({
            companyId: req.staff.companyId,
            entries: [{ driverId: parsed.data.driverId, date: parsed.data.date }],
            reason: "staff_assignment_clear"
          }).catch((err) => {
            req.log?.warn?.({ err }, "Invalidacija potvrda posle clear-a nije uspela");
          });
        }
        return res.json({
          success: true,
          deleted: true,
          shiftId: result.shiftId,
          revision: result.revision,
          shift: result.shift
            ? { ...result.shift, id: result.shiftId, assignedAt: null, clearedAt: null }
            : undefined
        });
      }

      await logAudit(req.staff.companyId, req.staff.uid, "shift_assigned", {
        shiftId: result.shiftId,
        driverId: parsed.data.driverId,
        date: parsed.data.date,
        type: parsed.data.type,
        revision: result.revision
      });
      if (confirmationScheduler?.invalidateShiftConfirmations) {
        confirmationScheduler.invalidateShiftConfirmations({
          companyId: req.staff.companyId,
          entries: [{ driverId: parsed.data.driverId, date: parsed.data.date }],
          reason: "staff_assignment"
        }).catch((err) => {
          req.log?.warn?.({ err }, "Invalidacija potvrda posle dodele nije uspela");
        });
      }
      return res.json({
        success: true,
        shift: { ...result.shift, id: result.shiftId, assignedAt: null }
      });
    } catch (error) {
      if (error.code === "MONTHLY_IMPORT_IN_PROGRESS" || error.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED") {
        return res.status(409).json({
          success: false,
          code: error.code,
          retryable: error.retryable === true,
          recoveryRequired: error.recoveryRequired === true,
          error: "Uvoz mesečnog plana za ovu grupu je u toku ili zahteva proveru."
        });
      }
      if (error.code === "revision_conflict" || error.message === "revision_conflict") {
        return res.status(409).json({
          success: false,
          error: "Raspored je u me\u0111uvremenu izmenjen. Osve\u017eite prikaz i poku\u0161ajte ponovo.",
          code: "REVISION_CONFLICT",
          conflict: {
            currentRevision: error.currentRevision ?? 0,
            shift: error.current || null
          }
        });
      }
      if (error.code === "DRIVER_NOT_FOUND") {
        return res.status(404).json({ success: false, error: "Voza\u010d nije prona\u0111en." });
      }
      if (error.code === "STAFF_SESSION_INVALID") {
        return res.status(403).json({
          success: false,
          code: "STAFF_SESSION_INVALID",
          error: assignmentResourceErrorMessage("STAFF_SESSION_INVALID")
        });
      }
      if (error.code === "DRIVER_SCOPE_DENIED") {
        return res.status(403).json({
          success: false,
          code: "DRIVER_SCOPE_DENIED",
          error: "Pristup voza\u010du van dodeljene grupe nije dozvoljen."
        });
      }
      if (error.code === "DRIVER_SCOPE_CHANGED") {
        return res.status(409).json({
          success: false,
          code: "DRIVER_SCOPE_CHANGED",
          error: assignmentResourceErrorMessage("DRIVER_SCOPE_CHANGED")
        });
      }
      if (error.code === "DUTY_ALREADY_ASSIGNED") {
        const attemptedDutyCode = String(parsed?.data?.routeCode || parsed?.data?.name || "").trim().toUpperCase();
        let existingDriverName = error.conflict?.existingDriverName || "";
        const conflictDriverId = error.conflict?.existingDriverId;
        if (conflictDriverId && (!existingDriverName || existingDriverName === conflictDriverId || existingDriverName === "drugom vozaču")) {
          try {
            const drvSnap = await db().collection("companies").doc(req.staff.companyId).collection("drivers").doc(conflictDriverId).get();
            if (drvSnap.exists && drvSnap.data()?.name) {
              existingDriverName = drvSnap.data().name;
            }
          } catch {}
        }
        if (!existingDriverName) existingDriverName = "drugom vozaču";
        const conflict = {
          ...(error.conflict || { dutyCode: attemptedDutyCode, date: parsed.data.date }),
          existingDriverName
        };
        return res.status(409).json({
          success: false,
          code: "DUTY_ALREADY_ASSIGNED",
          error: `Smena ${conflict.dutyCode || attemptedDutyCode} za ${parsed.data.date} već je dodeljena vozaču ${existingDriverName}.`,
          conflict
        });
      }
      if (error.code === "DRIVER_INACTIVE") {
        return res.status(409).json({
          success: false,
          code: "DRIVER_INACTIVE",
          error: assignmentResourceErrorMessage("DRIVER_INACTIVE")
        });
      }
      if (error.code === "invalid-group") {
        return res.status(400).json({ success: false, error: "Nevažeća grupa za katalog smena." });
      }
      const resourceCodes = new Set([
        "BUS_NOT_FOUND",
        "BUS_INACTIVE",
        "BUS_NOT_AVAILABLE",
        "BUS_OUTSIDE_GROUP",
        "BUS_DOUBLE_BOOKED",
        "DUTY_CATALOG_MISSING",
        "DUTY_NOT_IN_ACTIVE_CATALOG",
        "DUTY_TIME_MISMATCH"
      ]);
      if (resourceCodes.has(error.code)) {
        return res.status(409).json({
          success: false,
          code: error.code,
          bus: error.bus || null,
          opsStatus: error.opsStatus || null,
          conflict: error.conflict || null,
          dutyCode: error.dutyCode || null,
          expectedStart: error.expectedStart || null,
          expectedEnd: error.expectedEnd || null,
          error: assignmentResourceErrorMessage(error.code)
        });
      }
      req.log?.error?.({ err: error }, "Dodela smene nije uspela");
      return res.status(500).json({ success: false, error: "Smena nije mogla biti sa\u010duvana." });
    }
  });

  app.post("/api/staff/shifts/assignment/undo", requireStaff, async (req, res) => {
    if (req.staff.role !== "dispatcher") {
      return res.status(403).json({ success: false, error: "Samo disponent može poništiti izmenu rasporeda." });
    }
    const parsed = shiftUndoSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Nevažeći zahtev za undo." });
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const [driverSnap, staffSnap] = await Promise.all([
        companyRef.collection("drivers").doc(parsed.data.driverId).get(),
        companyRef.collection("users").doc(req.staff.uid).get()
      ]);
      if (!driverSnap.exists) return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      const driver = driverSnap.data();
      const groups = staffSnap.exists ? staffSnap.data().groups : req.staff.groups;
      const driverGroupId = driver.groupId || driver.lineId || null;
      if (!Array.isArray(groups) || !driverGroupId || !groups.includes(driverGroupId)) {
        return res.status(403).json({ success: false, error: "Pristup vozaču van dodeljene grupe nije dozvoljen." });
      }

      const importLock = await assertNoActiveGroupMonthlyImport({
        db: db(),
        companyId: req.staff.companyId,
        groupId: driverGroupId,
        month: scheduleMonthFromDate(parsed.data.date)
      });
      if (!importLock.ok) {
        return res.status(409).json({
          success: false,
          code: importLock.code,
          error: "Uvoz mesečnog plana za ovu grupu je u toku. Pokušajte ponovo kada se uvoz završi."
        });
      }

      const { ensureAssignmentDayLock } = require("./plan-edit-lock-routes");
      const lockCheck = await ensureAssignmentDayLock({
        db,
        companyId: req.staff.companyId,
        staff: req.staff,
        groupId: driverGroupId,
        dateStr: parsed.data.date
      });
      if (!lockCheck.ok) {
        return res.status(409).json({
          success: false,
          code: lockCheck.code || "LOCK_HELD",
          error: "Plan trenutno uređuje drugi disponent.",
          lock: lockCheck.lock || null
        });
      }

      const driverName = safeDriver(driverSnap).name;
      const shiftId = shiftDocumentId(parsed.data.driverId, parsed.data.date);
      const shiftRef = companyRef.collection("shifts").doc(shiftId);
      const yearMonth = scheduleMonthFromDate(parsed.data.date);
      const dayNum = scheduleDayNumber(parsed.data.date);
      const scheduleIds = scheduleDocumentId(parsed.data.driverId, driverName, yearMonth);
      const scheduleRef = companyRef.collection("schedules").doc(scheduleIds.canonical);
      const legacyScheduleRef = companyRef.collection("schedules").doc(scheduleIds.legacyName);

      const result = await db().runTransaction(async (tx) => {
        const shiftSnap = await tx.get(shiftRef);
        const scheduleSnap = await tx.get(scheduleRef);
        const legacyScheduleSnap = await tx.get(legacyScheduleRef);
        const importGate = await readMonthlyImportLockInTx(
          tx, companyRef, driverGroupId, yearMonth
        );
        const existing = shiftSnap.exists ? shiftSnap.data() : null;
        const plan = simulateUndoWrite(existing, parsed.data.expectedRevision);
        if (!plan.ok) {
          const error = new Error(plan.code === "NOTHING_TO_UNDO" ? "nothing_to_undo" : "revision_conflict");
          error.code = plan.code === "NOTHING_TO_UNDO" ? "nothing_to_undo" : "revision_conflict";
          error.currentRevision = plan.currentRevision ?? 0;
          error.current = plan.current || existing;
          throw error;
        }
        if (!importGate.decision.ok) {
          const error = new Error(importGate.decision.code);
          error.code = importGate.decision.code;
          error.recoveryRequired = importGate.decision.recoveryRequired === true;
          error.retryable = importGate.decision.retryable === true;
          throw error;
        }
        if (importGate.decision.clearLock) tx.delete(importGate.lockRef);

        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        const scheduleBaseSnap = scheduleSnap.exists ? scheduleSnap : legacyScheduleSnap;

        // Duty guard verification for undo / restore
        const restoreDutyCode = (!plan.deleted && plan.restore && !isPassiveDutyType(plan.restore.type))
          ? String(plan.restore.routeCode || plan.restore.name || "").trim().toUpperCase()
          : "";
        const incomingDutyGuardKey = restoreDutyCode
          ? canonicalDutyGuardKey({ groupId: driverGroupId, serviceDate: parsed.data.date, dutyCode: restoreDutyCode })
          : null;
        const incomingDutyGuardRef = incomingDutyGuardKey ? dutyGuardRef(companyRef, incomingDutyGuardKey) : null;
        const incomingDutyGuardSnap = incomingDutyGuardRef ? await tx.get(incomingDutyGuardRef) : null;

        const existingDutyCode = (existing && !isPassiveDutyType(existing.type))
          ? String(existing.routeCode || existing.name || "").trim().toUpperCase()
          : "";
        const oldDutyGuardKey = (existingDutyCode && existingDutyCode !== restoreDutyCode)
          ? canonicalDutyGuardKey({ groupId: driverGroupId, serviceDate: parsed.data.date, dutyCode: existingDutyCode })
          : null;
        const oldDutyGuardRef = oldDutyGuardKey ? dutyGuardRef(companyRef, oldDutyGuardKey) : null;
        const oldDutyGuardSnap = oldDutyGuardRef ? await tx.get(oldDutyGuardRef) : null;

        if (restoreDutyCode && incomingDutyGuardSnap && incomingDutyGuardSnap.exists) {
          const claimCheck = evaluateDutyGuardClaim({
            guardData: incomingDutyGuardSnap.data(),
            driverId: parsed.data.driverId,
            driverName,
            shiftDocumentId: shiftId,
            date: parsed.data.date,
            groupId: driverGroupId,
            dutyCode: restoreDutyCode
          });
          if (!claimCheck.ok) {
            const error = new Error(claimCheck.code);
            error.code = claimCheck.code;
            error.conflict = claimCheck.conflict;
            throw error;
          }
        }

        if (plan.deleted) {
          const cleared = buildClearedShift({
            data: parsed.data,
            driverName,
            driverGroupId,
            staffUid: req.staff.uid,
            revision: plan.revision,
            priorSnapshot: plan.priorSnapshot,
            assignedAt
          });
          tx.set(shiftRef, cleared);
          if (oldDutyGuardRef && oldDutyGuardSnap?.exists && oldDutyGuardSnap.data()?.ownerDriverId === parsed.data.driverId) {
            writeDutyGuardReleaseInTx(tx, oldDutyGuardRef);
          } else if (existingDutyCode) {
            const clearOldGuardKey = canonicalDutyGuardKey({ groupId: driverGroupId, serviceDate: parsed.data.date, dutyCode: existingDutyCode });
            if (clearOldGuardKey) {
              const clearOldRef = dutyGuardRef(companyRef, clearOldGuardKey);
              writeDutyGuardReleaseInTx(tx, clearOldRef);
            }
          }

          if (scheduleBaseSnap.exists && dayNum != null) {
            const schedule = { ...scheduleBaseSnap.data() };
            const parsedShifts = { ...(schedule.parsedShifts || {}) };
            delete parsedShifts[dayNum];
            delete parsedShifts[String(dayNum)];
            tx.set(scheduleRef, {
              ...schedule,
              id: scheduleIds.canonical,
              driverId: parsed.data.driverId,
              driverName,
              groupId: driverGroupId,
              month: yearMonth,
              parsedShifts,
              revision: currentRevision(schedule) + 1,
              updatedAt: assignedAt,
              updatedBy: req.staff.uid
            }, { merge: true });
            if (scheduleBaseSnap.id !== scheduleIds.canonical) tx.delete(legacyScheduleRef);
          }
          return { deleted: true, shiftId, revision: plan.revision, shift: cleared };
        }

        const shift = buildAssignedShift({
          data: {
            driverId: parsed.data.driverId,
            date: parsed.data.date,
            type: plan.restore.type,
            name: plan.restore.name,
            bus: plan.restore.bus,
            routeCode: plan.restore.routeCode,
            start: plan.restore.start || undefined,
            end: plan.restore.end || undefined
          },
          driverName,
          driverGroupId,
          staffUid: req.staff.uid,
          revision: plan.revision,
          assignedAt,
          priorSnapshot: plan.priorSnapshot
        });
        tx.set(shiftRef, shift);
        if (incomingDutyGuardRef) {
          writeDutyGuardClaimInTx(tx, incomingDutyGuardRef, admin().firestore.FieldValue, {
            companyId: req.staff.companyId,
            groupId: driverGroupId,
            serviceDate: parsed.data.date,
            dutyCode: restoreDutyCode,
            shiftType: plan.restore.type || "morning",
            ownerDriverId: parsed.data.driverId,
            ownerShiftDocumentId: shiftId,
            assignedBus: plan.restore.bus || "",
            staffUid: req.staff.uid
          });
        }
        if (oldDutyGuardRef && oldDutyGuardSnap?.exists && oldDutyGuardSnap.data()?.ownerDriverId === parsed.data.driverId) {
          writeDutyGuardReleaseInTx(tx, oldDutyGuardRef);
        } else if (existingDutyCode && existingDutyCode !== restoreDutyCode) {
          const clearOldGuardKey = canonicalDutyGuardKey({ groupId: driverGroupId, serviceDate: parsed.data.date, dutyCode: existingDutyCode });
          if (clearOldGuardKey) {
            const clearOldRef = dutyGuardRef(companyRef, clearOldGuardKey);
            writeDutyGuardReleaseInTx(tx, clearOldRef);
          }
        }

        if (dayNum != null) {
          const base = scheduleBaseSnap.exists
            ? scheduleBaseSnap.data()
            : { fileName: "", fileType: "application/json", fileData: "", parsedShifts: {} };
          const parsedShifts = { ...(base.parsedShifts || {}) };
          parsedShifts[dayNum] = buildScheduleDayEntry(shift);
          tx.set(scheduleRef, {
            ...base,
            id: scheduleIds.canonical,
            driverId: parsed.data.driverId,
            driverName,
            groupId: driverGroupId,
            month: yearMonth,
            parsedShifts,
            revision: currentRevision(base) + 1,
            updatedAt: assignedAt,
            updatedBy: req.staff.uid
          }, { merge: true });
          if (scheduleBaseSnap.exists && scheduleBaseSnap.id !== scheduleIds.canonical) {
            tx.delete(legacyScheduleRef);
          }
        }

        return { deleted: false, shiftId, shift, revision: plan.revision };
      });

      await logAudit(req.staff.companyId, req.staff.uid, "shift_undone", {
        shiftId: result.shiftId,
        driverId: parsed.data.driverId,
        date: parsed.data.date,
        revision: result.revision,
        restoredEmpty: result.deleted === true
      });

      if (confirmationScheduler?.invalidateShiftConfirmations) {
        confirmationScheduler.invalidateShiftConfirmations({
          companyId: req.staff.companyId,
          entries: [{ driverId: parsed.data.driverId, date: parsed.data.date }],
          reason: "staff_assignment_undo"
        }).catch((err) => {
          req.log?.warn?.({ err }, "Invalidacija potvrda posle undo-a nije uspela");
        });
      }

      if (result.deleted) {
        return res.json({
          success: true,
          deleted: true,
          shiftId: result.shiftId,
          revision: result.revision,
          shift: result.shift
            ? { ...result.shift, id: result.shiftId, assignedAt: null, clearedAt: null }
            : undefined
        });
      }
      return res.json({
        success: true,
        deleted: false,
        shift: { ...result.shift, id: result.shiftId, assignedAt: null }
      });
    } catch (error) {
      if (error.code === "DUTY_ALREADY_ASSIGNED") {
        return res.status(409).json({
          success: false,
          code: "DUTY_ALREADY_ASSIGNED",
          error: `Smena ${error.conflict?.dutyCode || ""} za ${parsed.data.date} već je dodeljena vozaču ${error.conflict?.existingDriverName || "drugom vozaču"}.`,
          conflict: error.conflict || {
            date: parsed.data.date
          }
        });
      }
      if (error.code === "MONTHLY_IMPORT_IN_PROGRESS" || error.code === "MONTHLY_IMPORT_RECOVERY_REQUIRED") {
        return res.status(409).json({
          success: false,
          code: error.code,
          retryable: error.retryable === true,
          recoveryRequired: error.recoveryRequired === true,
          error: "Uvoz mesečnog plana za ovu grupu je u toku ili zahteva proveru."
        });
      }
      if (error.code === "nothing_to_undo") {
        return res.status(409).json({
          success: false,
          code: "NOTHING_TO_UNDO",
          error: "Nema prethodne revizije za poništavanje."
        });
      }
      if (error.code === "revision_conflict" || error.message === "revision_conflict") {
        return res.status(409).json({
          success: false,
          error: "Raspored je u međuvremenu izmenjen. Osvežite prikaz i pokušajte ponovo.",
          code: "REVISION_CONFLICT",
          conflict: {
            currentRevision: error.currentRevision ?? 0,
            shift: error.current || null
          }
        });
      }
      req.log?.error?.({ err: error }, "Undo smene nije uspeo");
      return res.status(500).json({ success: false, error: "Poništavanje izmene nije uspelo." });
    }
  });

  const { registerPlanEditLockRoutes } = require("./plan-edit-lock-routes");
  registerPlanEditLockRoutes(app, { requireStaff, logAudit, db });
}

module.exports = {
  registerDriverRoutes, COST, safeDriver,
  safeProfilePayload, credentialPayload, SENSITIVE_DRIVER_FIELDS,
  verifyDriverLogin, verifyCompanyCode, createRequireActivatedDriver,
  inclusiveDays, vacationOverlaps,
  generateActivationOtp, verifyActivationOtp, isValidPersonalLoginCode,
  hashSecret, activationExpiresAt, smsProvider,
  setAssignmentMutationHookForTests
};
