const crypto = require("crypto");
const bcrypt = require("bcrypt");
const { z } = require("zod");
const { parseDriverCsv } = require("./driver-csv");
const { evaluateDriverWorkPolicy, validTimezone, localDateString, addDays } = require("./driver-work-policy");
const { dispatcherCanAccessGroup, isActiveReportStatus, isResolvedReportStatus } = require("./report-lifecycle");
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
  buildScheduleDayEntry
} = require("./shift-assignment");
const {
  staffMessageSchema,
  messageTypeForTemplate,
  resolveStaffMessageTargets,
  buildStaffMessageDoc,
  newMessageId
} = require("./staff-messages");
const {
  summarizeOutboxStatuses,
  classifyOutboxForOps
} = require("./confirmation-outbox");

const COST = 12;
const smsProvider = createSmsProvider();
const SENSITIVE_DRIVER_FIELDS = Object.freeze([
  "eid", "company_code", "companyCode", "companyCodeHash", "loginCodeHash",
  "temporaryCodeHash", "temporaryHash", "activationCodeHash", "activationExpiresAt",
  "activationUsedAt", "pin", "password", "passwordHash"
]);
const companySchema = z.string().trim().toLowerCase().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*$/);
const identifySchema = z.object({ companyId: companySchema, eid: z.string().trim().min(1).max(128) });
const loginSchema = z.object({
  companyId: companySchema,
  driverId: z.string().uuid(),
  loginCode: z.string().trim().regex(/^\d{5,12}$/)
});
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
const quickReportSchema = z.object({
  type: z.enum([
    "delay:5", "delay:10", "delay:15", "delay:20", "delay:30",
    "breakdown:bd_engine", "breakdown:bd_brakes", "breakdown:bd_tyre",
    "breakdown:bd_doors", "breakdown:bd_ac", "breakdown:bd_other"
  ]),
  reason: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  severity: z.enum(["sev_low", "sev_medium", "sev_critical"]),
  bus: z.string().trim().max(32).optional().default("")
});
const sosSchema = z.object({ bus: z.string().trim().max(32).optional().default("") });
const messageIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const lostItemStatusSchema = z.object({ status: z.enum(["returned"]) });
const lostItemSchema = z.object({
  type: z.enum(["lost_tech", "lost_wallet", "lost_keys", "lost_bag", "lost_clothes", "lost_other"]),
  location: z.string().trim().min(2).max(200),
  description: z.string().trim().min(2).max(1000),
  bus: z.string().trim().max(32).optional().default("")
});
const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const operationalIncidentSchema = z.object({
  driverId: driverIdSchema,
  date: isoDateSchema,
  reason: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().default(""),
  bus: z.string().trim().max(32).optional().default(""),
  shiftType: z.string().trim().max(64).optional().default(""),
  shiftName: z.string().trim().max(120).optional().default("")
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
const shiftConfirmationSchema = z.object({
  dates: z.array(isoDateSchema).min(1).max(4).transform((dates) => [...new Set(dates)])
});

function inclusiveDays(start, end) {
  return Math.floor((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000) + 1;
}

function vacationOverlaps(candidate, existing) {
  return candidate.start <= existing.end && candidate.end >= existing.start;
}

function isLocalDemoRequest(req) {
  return process.env.NODE_ENV !== "production"
    && (req.hostname === "localhost" || req.hostname === "127.0.0.1");
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
    companyCodeHash,
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

async function verifyCompanyCode(credentials, companyCode) {
  return Boolean(credentials?.companyCodeHash) && bcrypt.compare(companyCode, credentials.companyCodeHash);
}

function createRequireActivatedDriver({ admin, hasFirebase }) {
  return async function requireActivatedDriver(req, res, next) {
    if (!hasFirebase()) return res.status(503).json({ success: false, code: "FIREBASE_UNAVAILABLE", error: "Firebase nije konfigurisan." });
    try {
      const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
      if (!token) return res.status(401).json({ success: false, code: "INVALID_TOKEN", error: "Nevažeći token." });
      const decoded = await admin().auth().verifyIdToken(token);
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
  const { admin, db, hasFirebase, rateLimit, clearRateLimit, getClientIp, logAudit, confirmationScheduler = null } = deps;
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
      const sessionRef = policy.companyRef.collection("driver_sessions").doc(req.driver.uid);
      if (policy.status === "active" || policy.status === "grace") {
        await sessionRef.set({
          driverId: req.driver.uid,
          status: policy.status,
          shiftDate: policy.shift.date,
          timezone: policy.timezone,
          notificationsUntil: admin().firestore.Timestamp.fromDate(new Date(policy.notificationsUntil)),
          sessionEndsAt: admin().firestore.Timestamp.fromDate(new Date(policy.sessionEndsAt)),
          checkedAt: admin().firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } else {
        await sessionRef.delete().catch(() => {});
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
      const safePolicy = { ...policy };
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

  async function requireStaff(req, res, next) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    try {
      const decoded = await admin().auth().verifyIdToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""), true);
      if (!["dispatcher", "company_admin"].includes(decoded.role)) return res.status(403).json({ success: false, error: "Pristup odbijen." });
      if (!decoded.companyId || !decoded.uid) return res.status(403).json({ success: false, error: "Pristup odbijen." });
      const staffSnap = await db().collection("companies").doc(decoded.companyId).collection("users").doc(decoded.uid).get();
      if (!staffSnap.exists || staffSnap.data().active === false) {
        return res.status(403).json({ success: false, error: "Nalog nije aktivan." });
      }
      req.staff = { ...decoded, groups: Array.isArray(staffSnap.data().groups) ? staffSnap.data().groups : [] };
      next();
    } catch { return res.status(401).json({ success: false, error: "Nevažeći token." }); }
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

  app.post("/api/public/drivers/identify", rateLimit(8, 5 * 60_000), async (req, res) => {
    const parsed = identifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, code: "INVALID_DATA", error: "Nevažeći podaci." });
    }
    if (!hasFirebase()) {
      return res.status(503).json({ success: false, code: "FIREBASE_UNAVAILABLE", error: "Firebase nije konfigurisan." });
    }
    const companyRef = db().collection("companies").doc(parsed.data.companyId);
    const credentialSnap = await companyRef.collection("driver_credentials").where("eid", "==", parsed.data.eid).limit(1).get();
    const driverId = credentialSnap.empty ? null : credentialSnap.docs[0].id;
    if (!driverId) {
      return res.status(404).json({ success: false, code: "DRIVER_NOT_FOUND", error: "Vozač nije pronađen." });
    }
    const profileSnap = await companyRef.collection("drivers").doc(driverId).get();
    if (!profileSnap.exists) {
      return res.status(404).json({ success: false, code: "DRIVER_NOT_FOUND", error: "Vozač nije pronađen." });
    }
    return res.json({ success: true, driver: safeDriver(profileSnap) });
  });

  app.post("/api/auth/driver-login", rateLimit(10, 5 * 60_000), async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, code: "INVALID_LOGIN_PAYLOAD", error: "Nevažeći podaci za prijavu." });
    }
    const { companyId, driverId, loginCode } = parsed.data;
    if (!hasFirebase() && !isLocalDemoRequest(req)) {
      return res.status(503).json({ success: false, code: "FIREBASE_UNAVAILABLE", error: "Firebase nije konfigurisan." });
    }
    if (!hasFirebase()) {
      return res.status(503).json({
        success: false,
        code: "FIREBASE_UNAVAILABLE",
        error: "Firebase nije konfigurisan."
      });
    }
    const companyRef = db().collection("companies").doc(companyId);
    const profileRef = companyRef.collection("drivers").doc(driverId);
    const credentialRef = companyRef.collection("driver_credentials").doc(driverId);
    let mustChangeLoginCode = false;
    let userPayload = null;
    try {
      await db().runTransaction(async (tx) => {
        const [profileSnap, credentialSnap] = await Promise.all([tx.get(profileRef), tx.get(credentialRef)]);
        const profile = profileSnap.exists ? profileSnap.data() : null;
        const credentials = credentialSnap.exists ? credentialSnap.data() : null;
        const valid = profileSnap.exists && await verifyDriverLogin(profile, credentials, loginCode);
        if (!valid) {
          const error = new Error("invalid_login");
          error.code = "invalid_login";
          throw error;
        }
        mustChangeLoginCode = !profile.codeActivated;
        if (mustChangeLoginCode) {
          if (credentials.activationUsedAt) {
            const error = new Error("invalid_login");
            error.code = "invalid_login";
            throw error;
          }
          tx.update(credentialRef, {
            activationUsedAt: admin().firestore.FieldValue.serverTimestamp()
          });
        }
        userPayload = safeDriver(profileSnap);
      });
    } catch (error) {
      if (error?.code === "invalid_login") {
        await logAudit(companyId, driverId, "driver_login_failed", { ip: getClientIp(req) });
        return res.status(401).json({
          success: false,
          code: "INVALID_LOGIN",
          error: "Pogrešan kod ili vozač nije pronađen."
        });
      }
      req.log?.error?.({ err: error }, "Driver login failed");
      return res.status(500).json({ success: false, code: "LOGIN_FAILED", error: "Prijava nije uspela." });
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
      const decoded = await admin().auth().verifyIdToken(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
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

  // Legacy path — company-code-as-login activation removed (shared 123456 era).
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
      const reportId = crypto.randomUUID();
      const report = {
        ...parsed.data,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        status: "active",
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await companyRef.collection("reports").doc(reportId).set(report);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_quick_report_created", {
        reportId, type: report.type, severity: report.severity
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
      const itemId = crypto.randomUUID();
      const item = {
        ...parsed.data,
        driverId: req.driver.uid,
        driver: safeDriver(profileSnap).name,
        groupId: profileSnap.data().groupId || profileSnap.data().lineId || null,
        status: "in_depot",
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await companyRef.collection("lost_items").doc(itemId).set(item);
      await logAudit(req.driver.companyId, req.driver.uid, "driver_lost_item_created", {
        itemId, type: item.type
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
      if (message.broadcast !== true) update.read = true;
      await messageRef.update(update);
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

  app.post("/api/driver/shift-confirmations", rateLimit(10, 60_000), async (req, res) => {
    const parsed = shiftConfirmationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: "Neva\u017ee\u0107a potvrda smene." });
    const allowed = new Map(req.driverWorkPolicy.confirmationTargets.map((target) => [target.date, target]));
    if (parsed.data.dates.some((date) => !allowed.has(date))) {
      return res.status(403).json({ success: false, error: "Potvrditi se mogu samo ponu\u0111ene naredne smene." });
    }
    try {
      const batch = db().batch();
      const confirmedAt = admin().firestore.FieldValue.serverTimestamp();
      parsed.data.dates.forEach((date) => {
        const target = allowed.get(date);
        batch.set(req.driverWorkPolicy.companyRef.collection("shift_confirmations").doc(`${req.driver.uid}_${date}`), {
          driverId: req.driver.uid,
          date,
          shiftFingerprint: target.fingerprint,
          confirmedAt,
          confirmationSourceShiftDate: req.driverWorkPolicy.shift.date
        }, { merge: true });
        // Mirror onto assignment doc so staff UI that reads shifts sees confirm immediately.
        batch.set(req.driverWorkPolicy.companyRef.collection("shifts").doc(shiftDocumentId(req.driver.uid, date)), {
          driverId: req.driver.uid,
          date,
          confirmedByDriver: true,
          confirmedAt,
          shiftFingerprint: target.fingerprint,
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
        sourceShiftDate: req.driverWorkPolicy.shift.date
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
        for (const doc of credentialDocs) if (doc.data().companyCodeHash && await bcrypt.compare(driver.company_code, doc.data().companyCodeHash)) return res.status(409).json({ success: false, error: "Company code već postoji." });
      }
      const prepared = await Promise.all(drivers.map(async (driver) => {
        const otp = generateActivationOtp();
        return {
          driver,
          otp,
          companyCodeHash: await hashSecret(driver.company_code, COST),
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

  app.put("/api/staff/drivers/:driverId/status", requireStaff, async (req, res) => {
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
          groupId: target.groupId || resolved.groupId || null
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
    if (!reportId.success) return res.status(400).json({ success: false, error: "Nevažeća prijava." });
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
      const resolvedAt = admin().firestore.FieldValue.serverTimestamp();
      await reportRef.update({ status: "resolved", groupId, resolvedAt, resolvedBy: req.staff.uid });
      await logAudit(req.staff.companyId, req.staff.uid, "driver_report_resolved", {
        reportId: reportId.data,
        driverId: report.driverId || null,
        groupId
      });
      return res.json({
        success: true,
        report: { id: reportId.data, status: "resolved", groupId, resolvedAt: null, resolvedBy: req.staff.uid }
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
    try {
      const companyRef = db().collection("companies").doc(req.staff.companyId);
      const duplicate = await companyRef.collection("buses").where("number", "==", parsed.data.number).limit(1).get();
      if (!duplicate.empty) return res.status(409).json({ success: false, error: "Autobus sa ovim brojem već postoji." });
      const busRef = companyRef.collection("buses").doc();
      const payload = {
        number: parsed.data.number,
        groupId: parsed.data.groupId,
        lineId: parsed.data.groupId,
        companyId: req.staff.companyId,
        active: true,
        createdAt: admin().firestore.FieldValue.serverTimestamp(),
        createdBy: req.staff.uid
      };
      await busRef.set(payload);
      await logAudit(req.staff.companyId, req.staff.uid, "bus_created", {
        busId: busRef.id, number: parsed.data.number, groupId: parsed.data.groupId
      });
      return res.status(201).json({ success: true, bus: { id: busRef.id, ...payload, createdAt: null } });
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
      const groupId = bus.groupId || bus.lineId || null;
      if (!groupId || !dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Autobus nije u dodeljenoj grupi." });
      }
      await busRef.update({
        active: status.data.active,
        statusChangedAt: admin().firestore.FieldValue.serverTimestamp(),
        statusChangedBy: req.staff.uid
      });
      await logAudit(req.staff.companyId, req.staff.uid, status.data.active ? "bus_activated" : "bus_deactivated", {
        busId: busId.data, groupId
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
      const [driverSnap, profileSnap] = await Promise.all([
        companyRef.collection("drivers").doc(parsed.data.driverId).get(),
        companyRef.collection("profile").doc("main").get()
      ]);
      if (!driverSnap.exists || driverSnap.data().active === false) {
        return res.status(404).json({ success: false, error: "Aktivan vozač nije pronađen." });
      }
      const driver = driverSnap.data();
      const groupId = driver.groupId || driver.lineId || null;
      if (!dispatcherCanAccessGroup(req.staff.groups, groupId)) {
        return res.status(403).json({ success: false, error: "Vozač nije u dodeljenoj grupi." });
      }
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
      const report = {
        type: "coverage:disruption",
        reason: parsed.data.reason,
        description: parsed.data.description,
        severity: "sev_critical",
        bus: parsed.data.bus,
        shiftType: parsed.data.shiftType,
        shiftName: parsed.data.shiftName,
        date: parsed.data.date,
        driverId: parsed.data.driverId,
        driver: safeDriver(driverSnap).name,
        groupId,
        status: "active",
        source: "dispatcher",
        createdBy: req.staff.uid,
        createdAt: admin().firestore.FieldValue.serverTimestamp()
      };
      await companyRef.collection("reports").doc(reportId).set(report);
      await logAudit(req.staff.companyId, req.staff.uid, "operational_incident_created", {
        reportId,
        driverId: parsed.data.driverId,
        groupId,
        date: parsed.data.date
      });
      return res.status(201).json({
        success: true,
        report: { ...report, id: reportId, createdAt: null }
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Evidentiranje operativnog incidenta nije uspelo");
      return res.status(500).json({ success: false, error: "Operativni incident nije mogao biti sačuvan." });
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
      const confirmations = confirmSnap.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          driverId: data.driverId || null,
          date: data.date || null,
          shiftFingerprint: data.shiftFingerprint || null,
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
          deliveredAt: data.deliveredAt || null,
          confirmedAt: data.confirmedAt || null,
          smsStatus: data.smsStatus || null,
          updatedAt: data.updatedAt || null
        };
      }).filter((row) => row.driverId && row.targetDate && inRange(row.targetDate)
        && (!allowedDriverIds || allowedDriverIds.has(row.driverId)));

      const confirmedKeys = new Set(
        confirmations.map((row) => `${row.driverId}|${row.date}`)
      );
      const attention = outbox
        .map((row) => classifyOutboxForOps(row, confirmedKeys))
        .filter(Boolean)
        .sort((a, b) => {
          if (a.severity === b.severity) return String(a.targetDate).localeCompare(String(b.targetDate));
          return a.severity === "critical" ? -1 : 1;
        });

      const dispatchHealth = dispatchHealthSnap.exists
        ? {
          lastRunAt: dispatchHealthSnap.data().lastRunAt || null,
          schedulerEnabled: dispatchHealthSnap.data().schedulerEnabled === true,
          processed: Number(dispatchHealthSnap.data().processed || 0),
          delivered: Number(dispatchHealthSnap.data().delivered || 0),
          failed: Number(dispatchHealthSnap.data().failed || 0),
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
        summary: summarizeOutboxStatuses(outbox),
        attention,
        dispatchHealth
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Učitavanje potvrda smena nije uspelo");
      return res.status(500).json({ success: false, error: "Potvrde smena nisu mogle biti učitane." });
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
          if (shiftSnap.exists) tx.delete(shiftRef);
          if (scheduleBaseSnap.exists && dayNum != null) {
            const schedule = { ...scheduleBaseSnap.data() };
            const parsedShifts = { ...(schedule.parsedShifts || {}) };
            delete parsedShifts[dayNum];
            tx.set(scheduleRef, {
              ...schedule,
              id: scheduleIds.canonical,
              driverId: parsed.data.driverId,
              driverName,
              groupId: driverGroupId,
              month: yearMonth,
              parsedShifts,
              revision: currentRevision(schedule) + 1,
              updatedAt: admin().firestore.FieldValue.serverTimestamp(),
              updatedBy: req.staff.uid
            }, { merge: true });
            if (scheduleBaseSnap.id !== scheduleIds.canonical) tx.delete(legacyScheduleRef);
          }
          return { deleted: true, shiftId, revision: existing ? currentRevision(existing) : 0 };
        }

        const revision = currentRevision(existing) + 1;
        const assignedAt = admin().firestore.FieldValue.serverTimestamp();
        const shift = buildAssignedShift({
          data: parsed.data,
          driverName,
          driverGroupId,
          staffUid: req.staff.uid,
          revision,
          assignedAt
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
        return res.json({ success: true, deleted: true, shiftId: result.shiftId, revision: result.revision });
      }

      await logAudit(req.staff.companyId, req.staff.uid, "shift_assigned", {
        shiftId: result.shiftId,
        driverId: parsed.data.driverId,
        date: parsed.data.date,
        type: parsed.data.type,
        revision: result.revision
      });
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
}

module.exports = {
  registerDriverRoutes, COST, safeDriver, isLocalDemoRequest,
  safeProfilePayload, credentialPayload, SENSITIVE_DRIVER_FIELDS,
  verifyDriverLogin, verifyCompanyCode, createRequireActivatedDriver,
  inclusiveDays, vacationOverlaps,
  generateActivationOtp, verifyActivationOtp, isValidPersonalLoginCode,
  hashSecret, activationExpiresAt, smsProvider
};
