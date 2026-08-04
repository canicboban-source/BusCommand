const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { parseDriverCsv } = require("./driver-csv");
const { evaluateDriverWorkPolicy, validTimezone, localDateString, addDays } = require("./driver-work-policy");
const { dispatcherCanAccessGroup, isActiveReportStatus, isResolvedReportStatus } = require("./report-lifecycle");
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
  PlanImportValidationError,
  buildPlanImportPreview
} = require("./plan-import-preview");
const { assertNoActiveGroupMonthlyImport } = require("./group-monthly-plan-import");
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
const driverIdSchema = z.string().uuid();
const driverStatusSchema = z.object({ active: z.boolean() });
const busIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const busCreateSchema = z.object({
  number: z.string().trim().min(1).max(32).regex(/^[\p{L}\p{N} ._/-]+$/u),
  groupId: groupIdSchema
});
const busStatusSchema = z.object({ active: z.boolean() });
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
const messageIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemStatusSchema = z.object({ status: z.enum(["returned"]) });
const lostItemSchema = z.object({
  type: z.enum(["lost_tech", "lost_wallet", "lost_keys", "lost_bag", "lost_clothes", "lost_other"]),
  location: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(1000),
  bus: z.string().trim().max(32).optional().default(""),
  idempotencyKey: idempotencyKeySchema,
  clientCreatedAt: z.string().trim().min(10).max(40).optional()
});
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const operationalIncidentSchema = z.object({
  affectedEntity: z.enum(["driver", "vehicle"]).optional().default("driver"),
  driverId: driverIdSchema.optional(),
  date: isoDateSchema,
  reason: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  bus: z.string().trim().max(32).optional().default(""),
  shiftType: z.string().trim().max(64).optional().default(""),
  shiftName: z.string().trim().max(120).optional().default("")
}).superRefine((data, ctx) => {
  const entity = data.affectedEntity || "driver";
  if (entity === "driver" && !data.driverId) {
    ctx.addIssue({ code: "custom", path: ["driverId"], message: "required" });
  }
  if (entity === "vehicle" && !String(data.bus || "").trim()) {
    ctx.addIssue({ code: "custom", path: ["bus"], message: "required" });
  }
});
const problemTransitionSchema = z.object({
  toStatus: z.enum(["acknowledged", "solution_proposed", "applying", "cancelled"]),
  expectedRevision: z.number().int().min(0),
  assigneeId: z.string().trim().min(1).max(128).optional(),
  proposedSolution: z.string().trim().max(1000).optional()
});
const coverageResolutionSchema = z.object({
  replacementDriverId: driverIdSchema,
  replacementBus: z.string().trim().min(1).max(32),
  expectedOriginalRevision: z.number().int().min(0),
  expectedReplacementRevision: z.number().int().min(0),
  expectedProblemRevision: z.number().int().min(0).optional()
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
  return {
    firstName: driver.first_name,
    lastName: driver.last_name,
    phone: driver.phone,
    email: driver.email,
    groupId,
    lineId: groupId,
    companyId,
    active: true,
    codeActivated: false,
    createdAt
  };
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

  app.use("/api/driver", async (req, res, next) => {
    try {
      const policy = await loadDriverWorkPolicy(req.driver);
      if (policy.status !== "active") {
        return res.status(403).json({
          success: false,
          code: policy.status === "grace" ? "DRIVER_SHIFT_ENDED" : "DRIVER_OFF_DUTY",
          error: "Aplikacija voza\u010da miruje van radnog vremena."
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
      const activatedAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      batch.set(companyRef.collection("sos").doc(sosId), {
        driverId: req.driver.uid, driver: driverName, bus: parsed.data.bus,
        status: "active", activatedAt
      });
      batch.set(companyRef.collection("settings").doc("sos"), {
        sosActive: true, sosDriverId: req.driver.uid, sosDriver: driverName,
        sosBus: parsed.data.bus, sosId, activatedAt
      });
      await batch.commit();
      await logAudit(req.driver.companyId, req.driver.uid, "driver_sos_created", { sosId });
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
            item: { ...existing, id: itemId, createdAt: null }
          });
        }
      }
      const { idempotencyKey: _ignored, clientCreatedAt, ...itemFields } = parsed.data;
      const item = {
        ...itemFields,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        status: "in_depot",
        idempotencyKey: idempotencyKey || null,
        clientCreatedAt: clientCreatedAt || null,
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await itemsRef.doc(itemId).set(item);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_lost_item_created", {
        itemId, type: item.type, idempotencyKey: idempotencyKey || null
      });
      return res.status(201).json({ success: true, item: { ...item, id: itemId, createdAt: null } });
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
    if (!parsed.success) return res.status(400).json({ success: false, error: "Neva\u017ee\u0107a potvrda smene." });
    const allowed = new Map(req.driverWorkPolicy.confirmationTargets.map((target) => [target.date, target]));
    if (parsed.data.dates.some((date) => !allowed.has(date))) {
      return res.status(403).json({ success: false, error: "Potvrditi se mogu samo ponu\u0111ene naredne smene." });
    }
    try {
      const companyRef = req.driverWorkPolicy.companyRef;
      const shiftRefs = parsed.data.dates.map((date) =>
        companyRef.collection("shifts").doc(shiftDocumentId(req.driver.uid, date))
      );
      const shiftSnaps = shiftRefs.length ? await db().getAll(...shiftRefs) : [];
      const liveByDate = new Map();
      shiftSnaps.forEach((snap, index) => {
        liveByDate.set(parsed.data.dates[index], snap.exists ? snap.data() : null);
      });

      for (const date of parsed.data.dates) {
        const target = allowed.get(date);
        const live = liveByDate.get(date);
        if (live?.shiftFingerprint && target?.fingerprint
          && live.shiftFingerprint !== target.fingerprint
          && live.confirmedByDriver === true) {
          return res.status(409).json({
            success: false,
            code: "CONFIRMATION_STALE",
            error: "Plan smene je izmenjen. Osvežite potvrdu i pokušajte ponovo."
          });
        }
      }

      const batch = db().batch();
      const confirmedAt = admin().firestore.FieldValue.serverTimestamp();
      parsed.data.dates.forEach((date) => {
        const target = allowed.get(date);
        const live = liveByDate.get(date);
        const boundRevision = live ? currentRevision(live) : 0;
        batch.set(companyRef.collection("shift_confirmations").doc(`${req.driver.uid}_${date}`), {
          driverId: req.driver.uid,
          date,
          shiftFingerprint: target.fingerprint,
          confirmationBoundRevision: boundRevision,
          confirmedAt,
          confirmationSourceShiftDate: req.driverWorkPolicy.shift.date
        }, { merge: true });
        // Mirror onto assignment doc so staff UI that reads shifts sees confirm immediately.
        batch.set(companyRef.collection("shifts").doc(shiftDocumentId(req.driver.uid, date)), {
          driverId: req.driver.uid,
          date,
          confirmedByDriver: true,
          confirmedAt,
          shiftFingerprint: target.fingerprint,
          confirmationBoundRevision: boundRevision,
          confirmationSourceShiftDate: req.driverWorkPolicy.shift.date,
          updatedAt: confirmedAt
        }, { merge: true });
      });
      await batch.commit();
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
        sourceShiftDate: req.driverWorkPolicy.shift.date,
        boundRevisions: Object.fromEntries(
          parsed.data.dates.map((date) => [
            date,
            liveByDate.get(date) ? currentRevision(liveByDate.get(date)) : 0
          ])
        )
      });
      return res.json({ success: true, confirmedDates: parsed.data.dates });
    } catch (error) {
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
      const companyRef = db().collection("companies").doc(parsed.data.companyId);
      const profileCol = companyRef.collection("drivers");
      const credentialCol = companyRef.collection("driver_credentials");
      const [existingCredentials, existingProfiles, groupSnap, settingsSnap] = await Promise.all([
        credentialCol.get(),
        profileCol.get(),
        companyRef.collection("groups").doc(parsed.data.groupId).get(),
        companyRef.collection("settings").doc("main").get()
      ]);
      if (!groupSnap.exists) return res.status(404).json({ success: false, error: "Izabrana grupa nije pronađena." });
      const maxDrivers = Number(settingsSnap.data()?.maxDrivers || 10);
      if (existingProfiles.size + drivers.length > maxDrivers) {
        return res.status(409).json({ success: false, error: `Licenca dozvoljava najviše ${maxDrivers} vozača.` });
      }
      const credentialDocs = [...existingCredentials.docs];
      const eids = new Set(credentialDocs.map((d) => String(d.data().eid || "").toLowerCase()));
      for (const driver of drivers) if (eids.has(driver.eid.toLowerCase())) return res.status(409).json({ success: false, error: "EID već postoji." });
      for (const driver of drivers) {
        if (!driver.company_code) continue;
        for (const doc of credentialDocs) if (doc.data().companyCodeHash && await bcrypt.compare(driver.company_code, doc.data().companyCodeHash)) return res.status(409).json({ success: false, error: "Company code već postoji." });
      }
      const prepared = await Promise.all(drivers.map(async (driver) => {
        const otp = generateActivationOtp();
        return {
          driver,
          otp,
          companyCodeHash: driver.company_code ? await hashSecret(driver.company_code, COST) : null,
          activationCodeHash: await hashSecret(otp, COST),
          expiresAt: activationExpiresAt()
        };
      }));
      const batch = db().batch();
      const delivery = [];
      for (const item of prepared) {
        const driverId = crypto.randomUUID();
        const createdAt = admin().firestore.FieldValue.serverTimestamp();
        batch.set(profileCol.doc(driverId), safeProfilePayload(item.driver, parsed.data.groupId, parsed.data.companyId, createdAt));
        batch.set(credentialCol.doc(driverId), credentialPayload(item.driver, {
          companyCodeHash: item.companyCodeHash,
          activationCodeHash: item.activationCodeHash,
          activationExpiresAt: item.expiresAt.toISOString(),
          createdAt
        }));
        delivery.push({ driverId, driver: item.driver, otp: item.otp });
      }
      await batch.commit();
      const smsResults = [];
      for (const item of delivery) {
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
        smsQueued: smsResults.filter((row) => row.status === "stub_queued" || row.status === "sent").length
      });
      return res.status(201).json({
        success: true,
        imported: drivers.length,
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

  app.put("/api/staff/vacations/:vacationId/status", requireStaff, async (req, res) => {
    const vacationId = vacationIdSchema.safeParse(req.params.vacationId);
    const status = vacationStatusSchema.safeParse(req.body);
    if (!vacationId.success || !status.success) {
      return res.status(400).json({ success: false, error: "Neva\u017ee\u0107i status zahteva." });
    }
    try {
      const vacationRef = db().collection("companies").doc(req.staff.companyId)
        .collection("vacations").doc(vacationId.data);
      const snapshot = await vacationRef.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Zahtev nije prona\u0111en." });
      const currentStatus = snapshot.data().status;
      if (!["pending", "Na \u010dekanju"].includes(currentStatus)) {
        return res.status(409).json({ success: false, error: "Zahtev je ve\u0107 obra\u0111en." });
      }
      await vacationRef.update({
        status: status.data.status,
        reviewedAt: admin().firestore.FieldValue.serverTimestamp(),
        reviewedBy: req.staff.uid
      });
      await logAudit(req.staff.companyId, req.staff.uid, `vacation_${status.data.status}`, {
        vacationId: vacationId.data, driverId: snapshot.data().driverId || null
      });
      return res.json({ success: true, status: status.data.status });
    } catch (error) {
      req.log?.error?.({ err: error }, "Obrada zahteva za odmor nije uspela");
      return res.status(500).json({ success: false, error: "Zahtev nije mogao biti obraÄ‘en." });
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
      const [driversSnap, groupsSnap, staffUserSnap] = await Promise.all([
        companyRef.collection("drivers").get(),
        companyRef.collection("groups").get(),
        companyRef.collection("users").doc(req.staff.uid).get()
      ]);

      const drivers = driversSnap.docs.map((doc) => {
        const data = doc.data() || {};
        return {
          id: doc.id,
          name: safeDriver(doc).name || doc.id,
          groupId: data.groupId || data.lineId || null,
          lineId: data.lineId || null,
          active: data.active !== false
        };
      });
      const groups = groupsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
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
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const snapshot = await companyRef.collection("messages").doc(parsed.data).get();
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Poruka nije pronađena." });
      const message = snapshot.data();
      if (req.staff.role === "dispatcher") {
        const groups = Array.isArray(req.staff.groups) ? req.staff.groups : [];
        const gid = message.groupId || null;
        if (message.broadcast === true && message.recipientDriverId == null) {
          return res.status(403).json({ success: false, error: "Pristup CA broadcast poruci nije dozvoljen." });
        }
        if (gid && !groups.includes(gid)) {
          return res.status(403).json({ success: false, error: "Pristup poruci van dodeljene grupe nije dozvoljen." });
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
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const settingsRef = companyRef.collection("settings").doc("sos");
      const settingsSnap = await settingsRef.get();
      if (!settingsSnap.exists || settingsSnap.data().sosActive !== true) {
        return res.status(409).json({ success: false, error: "Nema aktivnog SOS alarma." });
      }
      const settings = settingsSnap.data() || {};
      const sosId = typeof settings.sosId === "string" ? settings.sosId : null;
      const resolvedAt = admin().firestore.FieldValue.serverTimestamp();
      const batch = db().batch();
      if (sosId) {
        const sosRef = companyRef.collection("sos").doc(sosId);
        const sosSnap = await sosRef.get();
        if (sosSnap.exists) {
          batch.update(sosRef, {
            status: "resolved",
            resolvedAt,
            resolvedBy: req.staff.uid
          });
        }
      }
      batch.set(settingsRef, {
        sosActive: false,
        sosDriverId: null,
        sosDriver: "",
        sosBus: "",
        sosId: null,
        resolvedAt,
        resolvedBy: req.staff.uid
      }, { merge: true });
      await batch.commit();
      await logAudit(req.staff.companyId, req.staff.uid, "staff_sos_resolved", {
        sosId,
        driverId: settings.sosDriverId || null
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
    if (!["dispatcher", "company_admin"].includes(req.staff.role)) {
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
      const openStatuses = new Set(["in_depot", "status_in_depot", "U depou", "Im Depot"]);
      const closedStatuses = new Set(["returned", "status_returned"]);
      if (closedStatuses.has(item.status)) {
        return res.status(409).json({ success: false, error: "Predmet je već vraćen." });
      }
      if (!openStatuses.has(item.status)) {
        return res.status(409).json({ success: false, error: "Predmet nema status u depou." });
      }

      let groupId = item.groupId || null;
      if (!groupId && item.driverId) {
        const driverSnap = await companyRef.collection("drivers").doc(item.driverId).get();
        if (driverSnap.exists) groupId = driverSnap.data().groupId || driverSnap.data().lineId || null;
      }
      if (req.staff.role === "dispatcher" && !dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Predmet nije u dodeljenoj grupi." });
      }

      const returnedAt = admin().firestore.FieldValue.serverTimestamp();
      await itemRef.update({
        status: "returned",
        returnedAt,
        returnedBy: req.staff.uid
      });
      await logAudit(req.staff.companyId, req.staff.uid, "lost_item_returned", {
        itemId: itemId.data,
        driverId: item.driverId || null,
        groupId
      });
      return res.json({
        success: true,
        item: {
          id: itemId.data,
          status: "returned",
          returnedBy: req.staff.uid,
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
    const { busHasGroup, withAttachedGroup, buildNewBusGroups, normalizeGroupIds } = require("./bus-group-membership");
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
            bus: {
              id: doc.id,
              number: existing.number,
              groupId: existing.groupId || parsed.data.groupId,
              lineId: existing.lineId || existing.groupId || parsed.data.groupId,
              groupIds: normalizeGroupIds(existing),
              active: existing.active !== false,
              createdAt: null
            }
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
          bus: {
            id: doc.id,
            number: attached.number,
            groupId: attached.groupId,
            lineId: attached.lineId,
            groupIds: attached.groupIds,
            active: attached.active !== false,
            createdAt: null
          }
        });
      }
      const busRef = companyRef.collection("buses").doc();
      const groups = buildNewBusGroups(parsed.data.groupId);
      const payload = {
        number: parsed.data.number,
        ...groups,
        companyId: req.staff.companyId,
        active: true,
        createdAt: admin().firestore.FieldValue.serverTimestamp(),
        createdBy: req.staff.uid
      };
      await busRef.set(payload);
      await logAudit(req.staff.companyId, req.staff.uid, "bus_created", {
        busId: busRef.id, number: parsed.data.number, groupId: parsed.data.groupId, groupIds: groups.groupIds
      });
      return res.status(201).json({ success: true, attached: false, bus: { id: busRef.id, ...payload, createdAt: null } });
    } catch (error) {
      req.log?.error?.({ err: error }, "Dodavanje autobusa nije uspelo");
      return res.status(500).json({ success: false, error: "Autobus nije mogao biti dodat." });
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
      const snapshot = await busRef.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, error: "Autobus nije pronađen." });
      const bus = snapshot.data() || {};
      const { normalizeGroupIds } = require("./bus-group-membership");
      const groupIds = normalizeGroupIds(bus);
      const canAccess = groupIds.some((gid) => dispatcherCanAccessGroup(req.staff.groups, gid));
      if (!groupIds.length || !canAccess) {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      await busRef.update({
        active: status.data.active,
        statusChangedAt: admin().firestore.FieldValue.serverTimestamp(),
        statusChangedBy: req.staff.uid
      });
      await logAudit(req.staff.companyId, req.staff.uid, status.data.active ? "bus_activated" : "bus_deactivated", {
        busId: busId.data, groupId: groupIds[0], groupIds
      });
      return res.json({ success: true, active: status.data.active });
    } catch (error) {
      req.log?.error?.({ err: error }, "Promena statusa autobusa nije uspela");
      return res.status(500).json({ success: false, error: "Status autobusa nije mogao biti promenjen." });
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

      const reportId = crypto.randomUUID();
      const createdAt = admin().firestore.FieldValue.serverTimestamp();
      const report = {
        type: "coverage:disruption",
        reason: parsed.data.reason,
        description: parsed.data.description,
        severity: "sev_critical",
        bus: busNumber,
        shiftType: parsed.data.shiftType,
        shiftName: parsed.data.shiftName,
        date: parsed.data.date,
        driverId,
        driver: driverName,
        groupId,
        source: "dispatcher",
        createdBy: req.staff.uid,
        createdAt,
        ...buildProblemCreateFields({
          affectedEntity,
          reporterId: req.staff.uid,
          at: createdAt
        })
      };
      await companyRef.collection("reports").doc(reportId).set(report);
      await logAudit(req.staff.companyId, req.staff.uid, "operational_incident_created", {
        reportId,
        driverId,
        groupId,
        date: parsed.data.date,
        affectedEntity,
        bus: busNumber || null
      });
      return res.status(201).json({
        success: true,
        report: { ...report, id: reportId, createdAt: null, lifecycle: { open: null } }
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
      const originalDriver = originalDriverSnap.data();
      const replacementDriver = replacementDriverSnap.data();
      const originalGroupId = originalDriver.groupId || originalDriver.lineId || null;
      const replacementGroupId = replacementDriver.groupId || replacementDriver.lineId || null;
      if (replacementDriver.active === false || originalGroupId !== groupId || replacementGroupId !== groupId) {
        return res.status(409).json({ success: false, code: "DRIVER_NOT_AVAILABLE", error: "Izabrani vozač nije aktivan i dostupan u ovoj grupi." });
      }
      const { busHasGroup } = require("./bus-group-membership");
      const busSnap = busQuery.docs.find((doc) => {
        const bus = doc.data();
        return bus.active !== false && busHasGroup(bus, groupId);
      });
      if (!busSnap) {
        return res.status(409).json({ success: false, code: "BUS_NOT_AVAILABLE", error: "Izabrani autobus nije aktivan i dostupan u ovoj grupi." });
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
            date,
            groupId,
            originalDriverId: initialReport.driverId,
            replacementDriverId: parsed.data.replacementDriverId,
            replacementBus: parsed.data.replacementBus,
            affectedEntity: initialReport.affectedEntity || "driver",
            revision: problemRevision
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
      if (error.code === "revision_conflict") {
        return res.status(409).json({ success: false, code: "REVISION_CONFLICT", error: "Plan je u međuvremenu izmenjen. Osvežite prikaz." });
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
        companyRef.collection("shift_confirmations").get(),
        companyRef.collection("confirmation_outbox").get(),
        companyRef.collection("users").doc(req.staff.uid).get(),
        companyRef.collection("ops").doc("confirmation_dispatch").get()
      ]);

      let allowedDriverIds = null;
      if (req.staff.role === "dispatcher") {
        const groups = staffSnap.exists && Array.isArray(staffSnap.data().groups)
          ? staffSnap.data().groups
          : (req.staff.groups || []);
        const driversSnap = await companyRef.collection("drivers").get();
        allowedDriverIds = new Set(
          driversSnap.docs
            .filter((doc) => {
              const groupId = doc.data().groupId || doc.data().lineId || null;
              return groupId && groups.includes(groupId);
            })
            .map((doc) => doc.id)
        );
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

  app.post("/api/staff/monthly-plans/import/preview", requireStaff, async (req, res) => {
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
      const [driverSnaps, monthlyShiftsSnap] = await Promise.all([
        db().getAll(...driverRefs),
        companyRef.collection("shifts")
          .where("date", ">=", `${parsed.data.month}-01`)
          .where("date", "<=", `${parsed.data.month}-31`)
          .get()
      ]);
      const driversById = new Map(driverSnaps
        .filter((snap) => snap.exists)
        .map((snap) => [snap.id, snap.data()]));
      const shiftsById = new Map(monthlyShiftsSnap.docs
        .map((doc) => doc.data())
        .filter((shift) => shift.driverId && shift.date)
        .map((shift) => [`${shift.driverId}|${shift.date}`, shift]));

      const preview = buildPlanImportPreview({
        companyId: req.staff.companyId,
        staffUid: req.staff.uid,
        payload: parsed.data,
        driversById,
        shiftsById
      });
      await logAudit(req.staff.companyId, req.staff.uid, "monthly_plan_import_previewed", {
        fingerprint: preview.fingerprint,
        groupId: preview.groupId,
        month: preview.month,
        sourceName: preview.sourceName,
        reason: preview.reason,
        summary: preview.summary
      });
      return res.json({ success: true, preview });
    } catch (error) {
      if (error instanceof PlanImportValidationError) {
        return res.status(422).json({
          success: false,
          code: error.code,
          error: "Plan sadrži podatke koji moraju biti ispravljeni.",
          details: error.errors
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
      const driver = driverSnap.data();
      const groups = staffSnap.exists ? staffSnap.data().groups : req.staff.groups;
      const driverGroupId = driver.groupId || driver.lineId || null;
      if (!Array.isArray(groups) || !driverGroupId || !groups.includes(driverGroupId)) {
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

      const result = await db().runTransaction(async (tx) => {
        const shiftSnap = await tx.get(shiftRef);
        const legacyShiftSnaps = [];
        for (const ref of legacyShiftRefs) {
          legacyShiftSnaps.push(await tx.get(ref));
        }
        const scheduleSnap = await tx.get(scheduleRef);
        const legacyScheduleSnap = await tx.get(legacyScheduleRef);

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
            driverName,
            driverGroupId,
            staffUid: req.staff.uid,
            revision,
            priorSnapshot,
            assignedAt
          });
          tx.set(shiftRef, cleared);

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
          return { deleted: true, shiftId, revision, shift: cleared };
        }

        const priorSnapshot = capturePriorSnapshot(existing);
        const revision = currentRevision(existing) + 1;
        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        const shift = buildAssignedShift({
          data: parsed.data,
          driverName,
          driverGroupId,
          staffUid: req.staff.uid,
          revision,
          assignedAt,
          priorSnapshot
        });
        tx.set(shiftRef, shift);

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
        const existing = shiftSnap.exists ? shiftSnap.data() : null;
        const plan = simulateUndoWrite(existing, parsed.data.expectedRevision);
        if (!plan.ok) {
          const error = new Error(plan.code === "NOTHING_TO_UNDO" ? "nothing_to_undo" : "revision_conflict");
          error.code = plan.code === "NOTHING_TO_UNDO" ? "nothing_to_undo" : "revision_conflict";
          error.currentRevision = plan.currentRevision ?? 0;
          error.current = plan.current || existing;
          throw error;
        }

        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        const scheduleBaseSnap = scheduleSnap.exists ? scheduleSnap : legacyScheduleSnap;

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
  hashSecret, activationExpiresAt, smsProvider
};
