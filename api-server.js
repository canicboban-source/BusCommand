// ============================================================
// BusCommand — Unified Server
// Node.js + Express — statika + API
// ============================================================

const express = require("express");
const bcrypt  = require("bcrypt");
const path    = require("path");
const fs      = require("fs");
const cors    = require("cors");
const os      = require("os");
const helmet  = require("helmet");
const pinoHttp = require("pino-http");
const { z } = require("zod");

const { logger } = require("./server/logger");
const { buildStartupInfo } = require("./server/startup-info");
const { registerDriverRoutes } = require("./server/driver-routes");
const { rateLimit, clearRateLimit, getClientIp } = require("./server/rate-limit");
const {
  ProvisioningError,
  createCompanyAtomic,
  deleteDispatcher,
  deleteCompanyAtomic,
  provisionUser,
  revokeDispatcherSessions,
  setDispatcherActive,
  updateDispatcherGroups
} = require("./server/provisioning");
const { createRequireSuperAdmin, createSuperAdminOverviewHandler } = require("./server/superadmin-overview");
const { createStaffAuth, parseCompanyParam } = require("./server/staff-auth");
const {
  getCompanyDetail,
  listAllCompanyAdmins,
  setCompanyAdminActive,
  requestCompanyAdminPasswordReset
} = require("./server/superadmin-company");
const {
  buildTenantSettingsPatch,
  applyTenantSettingsPatch,
  EDITABLE_FEATURE_KEYS
} = require("./server/superadmin-tenant-settings");
const { createSupportSessionHandlers } = require("./server/support-session");
const { createConfirmationScheduler } = require("./server/confirmation-scheduler");
const {
  getActiveServicePlan,
  getServicePlanVersion,
  listServicePlanHistory,
  normalizeServicePlanGroupId,
  previewServicePlan,
  publishServicePlan,
  activateServicePlan
} = require("./server/service-plans");
const { assertCompanyGroupsExist } = require("./server/group-access");
const { listAuditEvents, normalizeStateSyncDetails } = require("./server/audit-log");
const { findCompanyGroupReferences, normalizeCompanyGroupId } = require("./server/company-groups");
const { normalizeCompanyProfileSettings } = require("./server/company-settings");
const { buildCompanyExport } = require("./server/company-export");
const {
  GroupMonthlyImportError,
  commitGroupMonthlyImport,
  prepareGroupMonthlyImport
} = require("./server/group-monthly-plan-import");
const {
  validateBody,
  sanitizeCompanyId,
  assertCompanyIdUsable,
  companyStatusBody,
  createCompanyBody,
  deleteCompanyBody,
  createUserBody,
  updateUserGroupsBody,
  companyDispatcherBody,
  companyDispatcherStatusBody,
  companyDispatcherActionBody,
  companyDispatcherDeleteBody,
  companyAdminStatusBody,
  companyProfileSettingsBody,
  companyBrandingBody,
  companyGroupBody,
  companyGroupUpdateBody,
  companyDriverProfileBody,
  companyDriverPersonalCodeBody
} = require("./server/validation");

const { version: APP_VERSION } = require("./package.json");

const PORT = Number(process.env.PORT) || 8766;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "firebase-admin-key.json");
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const FORCE_LOCAL_DEMO = String(process.env.BUSCOMMAND_FORCE_LOCAL_DEMO || "").trim() === "1";
const HAS_FIREBASE = !FORCE_LOCAL_DEMO && Boolean(SERVICE_ACCOUNT_JSON || fs.existsSync(SERVICE_ACCOUNT_PATH));

const DEFAULT_CORS_ORIGINS = [
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Always allow live surfaces — Vite marks /assets/* with crossorigin, so the
  // browser sends Origin even for same-site CSS/JS. Missing ACAO → CSS blocked →
  // overlays with inline display:flex stay visible (e.g. clear-sos-modal).
  "https://buscommand.com",
  "https://www.buscommand.com",
  "https://buscommand-preview.onrender.com"
];

function isLocalDevCorsOrigin(origin) {
  // Vite tags hashed assets with crossorigin; browsers send Origin even for same-host CSS/JS.
  // Allow any localhost port locally so Playwright/alternate PORT still loads /assets/*.
  if (process.env.NODE_ENV === "production") return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function isBusCommandCorsOrigin(origin) {
  try {
    const { protocol, hostname } = new URL(origin);
    if (protocol !== "https:" && protocol !== "http:") return false;
    if (hostname === "buscommand.com" || hostname.endsWith(".buscommand.com")) return true;
    if (hostname === "buscommand-preview.onrender.com") return true;
    return false;
  } catch {
    return false;
  }
}

let admin = null;
let db    = null;

if (HAS_FIREBASE) {
  admin = require("firebase-admin");
  const serviceAccount = SERVICE_ACCOUNT_JSON
    ? JSON.parse(SERVICE_ACCOUNT_JSON)
    : JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
}

const app = express();

const groupMonthlyImportPreviewBody = z.object({
  companyId: z.string().trim().min(1).max(128),
  groupId: z.string().trim().min(1).max(120),
  month: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])$/),
  mode: z.enum(["merge", "replace"]),
  sourceName: z.string().trim().min(1).max(255),
  reason: z.string().trim().min(3).max(200),
  rows: z.array(z.object({
    eid: z.string().trim().min(1).max(128),
    date: z.string().regex(/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/),
    dutyCode: z.string().trim().min(1).max(64).transform(value => value.toUpperCase()),
    sourceRow: z.number().int().min(2).max(100000)
  })).min(1).max(2500)
});
const groupMonthlyImportCommitBody = z.object({
  companyId: z.string().trim().min(1).max(128),
  importId: z.string().trim().min(1).max(128),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/)
});

app.set("trust proxy", 1);

const allowedOrigins = [...new Set([
  ...DEFAULT_CORS_ORIGINS,
  ...(process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
])];

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.includes(origin)
      || isLocalDevCorsOrigin(origin)
      || isBusCommandCorsOrigin(origin)
    ) {
      return callback(null, true);
    }
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/api/config" }
}));

const defaultJsonParser = express.json({ limit: "64kb" });
const servicePlanJsonParser = express.json({ limit: "4mb" });
const brandingJsonParser = express.json({ limit: "512kb" });
app.use((req, res, next) => {
  if (req.method === "PUT" && req.path === "/api/company-admin/branding") {
    return brandingJsonParser(req, res, next);
  }
  const isServicePlanWrite = req.path.startsWith("/api/company-admin/service-plans/");
  return (isServicePlanWrite ? servicePlanJsonParser : defaultJsonParser)(req, res, next);
});

const DIST_DIR = path.join(__dirname, "dist");
const HAS_DIST = fs.existsSync(path.join(DIST_DIR, "index.html"));
const STATIC_DIR = HAS_DIST ? DIST_DIR : __dirname;

app.use(express.static(STATIC_DIR, {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    const hashedAsset = /[\\/](assets)[\\/].*-[a-zA-Z0-9_-]{8,}\.(?:js|css|woff2?|png|svg)$/.test(filePath);
    res.setHeader("Cache-Control", hashedAsset
      ? "public, max-age=31536000, immutable"
      : "no-cache");
  }
}));

app.get("/driver", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(STATIC_DIR, "driver.html"));
});

app.get("/staff", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.sendFile(path.join(STATIC_DIR, "staff.html"));
});

const requireSuperAdmin = createRequireSuperAdmin({ hasFirebase: () => HAS_FIREBASE, admin: () => admin });

const {
  requireCompanyStaff,
  requireCompanyAdmin,
  requireCompanyMemberParam,
  requireUserProvisioner,
  requireOwnCompany
} = createStaffAuth({
  hasFirebase: () => HAS_FIREBASE,
  admin: () => admin,
  db: () => db
});

// ─── API: Konfiguracija servera ────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    uptime: Math.floor(process.uptime()),
    mode: HAS_FIREBASE ? "production" : "demo",
    version: APP_VERSION,
    firebase: HAS_FIREBASE
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    mode: HAS_FIREBASE ? "production" : "demo",
    firebase: HAS_FIREBASE,
    version: APP_VERSION,
    port: PORT
  });
});

const confirmationScheduler = createConfirmationScheduler({
  admin: () => admin,
  db: () => db,
  hasFirebase: () => HAS_FIREBASE,
  logAudit: (...args) => _logAuditEvent(...args)
});

registerDriverRoutes(app, {
  admin: () => admin,
  db: () => db,
  hasFirebase: () => HAS_FIREBASE,
  rateLimit,
  clearRateLimit,
  getClientIp,
  logAudit: (...args) => _logAuditEvent(...args),
  confirmationScheduler,
  staffAuth: { requireCompanyStaff }
});

confirmationScheduler.registerRoutes(app, { rateLimit });

// ─── API: Licenca ──────────────────────────────────────────

app.get("/api/license/:companyId", rateLimit(60, 60 * 1000), requireCompanyMemberParam, async (req, res) => {
  const companyId = req.tenantId;

  try {
    const settingsSnap = await db
      .collection("companies").doc(companyId)
      .collection("settings").doc("main").get();

    if (!settingsSnap.exists) {
      return res.status(404).json({ success: false, error: "Firma nije pronađena." });
    }

    const s = settingsSnap.data();
    const now = Date.now();
    const trialEnd = s.trialEndsAt ? s.trialEndsAt.toMillis() : null;
    const subEnd   = s.billing?.currentPeriodEnd
      ? new Date(s.billing.currentPeriodEnd).getTime() : null;

    let daysRemaining = null;
    if (s.plan === "trial" && trialEnd) {
      daysRemaining = Math.max(0, Math.ceil((trialEnd - now) / 86400000));
    } else if (subEnd) {
      daysRemaining = Math.max(0, Math.ceil((subEnd - now) / 86400000));
    }

    return res.json({
      success: true,
      plan: s.plan || "trial",
      status: s.status || "active",
      daysRemaining,
      features: s.features || {},
      maxDrivers: s.maxDrivers || 10,
      maxDispatchers: s.maxDispatchers || 2
    });

  } catch (err) {
    req.log?.error({ err }, "License check greška");
    return res.status(500).json({ success: false, error: "Greška pri proveri licence." });
  }
});

// ─── API: SuperAdmin ───────────────────────────────────────

app.get("/api/admin/overview", requireSuperAdmin, createSuperAdminOverviewHandler({ db: () => db }));

const supportSessionHandlers = createSupportSessionHandlers({
  db: () => db,
  admin: () => admin,
  hasFirebase: () => HAS_FIREBASE,
  logAudit: (...args) => _logAuditEvent(...args),
  parseCompanyParam
});

app.post(
  "/api/admin/companies/:companyId/support-sessions",
  requireSuperAdmin,
  supportSessionHandlers.startSupportSession
);
app.get(
  "/api/admin/companies/:companyId/support-sessions/active",
  requireSuperAdmin,
  supportSessionHandlers.getActiveSupportSessionAdmin
);
app.post(
  "/api/admin/support-sessions/:sessionId/end",
  requireSuperAdmin,
  supportSessionHandlers.endSupportSessionAdmin
);
app.get(
  "/api/company-admin/support-session",
  requireCompanyAdmin,
  supportSessionHandlers.getSupportSessionCompanyAdmin
);
app.post(
  "/api/company-admin/support-session/end",
  requireCompanyAdmin,
  supportSessionHandlers.endSupportSessionCompanyAdmin
);

app.get("/api/admin/companies", requireSuperAdmin, async (req, res) => {
  try {
    const companiesSnap = await db.collection("companies").get();

    const companies = await Promise.all(companiesSnap.docs.map(async (doc) => {
      const [profileSnap, settingsSnap, supportSnap] = await Promise.all([
        doc.ref.collection("profile").doc("main").get(),
        doc.ref.collection("settings").doc("main").get(),
        doc.ref.collection("settings").doc("support").get()
      ]);
      const profile = profileSnap.exists ? profileSnap.data() : doc.data();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};
      const support = supportSnap.exists ? supportSnap.data() : {};
      const supportActive = support.active === true
        && support.expiresAt
        && (typeof support.expiresAt.toDate === "function"
          ? support.expiresAt.toDate().getTime()
          : new Date(support.expiresAt).getTime()) > Date.now();

      return {
        id: doc.id,
        name: profile.name || doc.id,
        country: profile.country,
        status: settings.status || "unknown",
        plan: settings.plan || "trial",
        email: profile.contactEmail,
        supportSessionEnabled: settings.features?.supportSession === true,
        supportSessionActive: supportActive,
        supportExpiresAt: supportActive && support.expiresAt
          ? (typeof support.expiresAt.toDate === "function"
            ? support.expiresAt.toDate().toISOString()
            : new Date(support.expiresAt).toISOString())
          : null
      };
    }));

    return res.json({ success: true, companies });

  } catch (err) {
    req.log?.error({ err }, "Admin companies greška");
    return res.status(500).json({ success: false, error: "Greška." });
  }
});

app.get("/api/admin/company-admins", requireSuperAdmin, async (req, res) => {
  try {
    const companyAdmins = await listAllCompanyAdmins({ db });
    return res.json({ success: true, companyAdmins });
  } catch (err) {
    req.log?.error({ err }, "Admin company-admins greška");
    return res.status(500).json({ success: false, error: "Greška pri učitavanju company admin naloga." });
  }
});

app.post(
  "/api/admin/company/:companyId/status",
  requireSuperAdmin,
  validateBody(companyStatusBody),
  async (req, res) => {
    const parsed = parseCompanyParam(req.params.companyId);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const { id: companyId } = parsed;
    const { status, reason } = req.validatedBody;

    try {
      const companyRef = db.collection("companies").doc(companyId);
      const companySnap = await companyRef.get();
      if (!companySnap.exists) {
        return res.status(404).json({ success: false, error: "Firma nije pronađena." });
      }

      await companyRef.collection("settings").doc("main").update({
        status,
        suspendedAt: status === "suspended" ? admin.firestore.FieldValue.serverTimestamp() : null,
        suspendReason: status === "suspended" ? (reason || null) : null
      });

      await _logAuditEvent("superadmin", req.adminUser.uid, "company_status_changed", {
        companyId, status, reason
      });

      return res.json({ success: true });

    } catch (err) {
      req.log?.error({ err }, "Status update greška");
      return res.status(500).json({ success: false, error: "Greška." });
    }
  }
);

app.post(
  "/api/admin/create-company",
  requireSuperAdmin,
  validateBody(createCompanyBody),
  async (req, res) => {
    const body = req.validatedBody;
    let companyId = body.companyId ? sanitizeCompanyId(body.companyId) : "";
    if (!companyId) {
      companyId = sanitizeCompanyId(body.name);
    }
    const idError = assertCompanyIdUsable(companyId);
    if (idError) {
      return res.status(400).json({ success: false, error: idError });
    }
    const name = body.name;

    try {
      await createCompanyAtomic({
        db, admin, companyId, name,
        country: body.country,
        contactEmail: body.contactEmail,
        actorId: req.adminUser.uid
      });

      return res.status(201).json({ success: true, companyId, name });

    } catch (err) {
      if (err instanceof ProvisioningError && err.code === "company-exists") {
        return res.status(409).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "create-company greška");
      return res.status(500).json({ success: false, error: "Greška pri kreiranju firme." });
    }
  }
);

app.post(
  "/api/admin/company/:companyId/delete",
  requireSuperAdmin,
  validateBody(deleteCompanyBody),
  async (req, res) => {
    const parsed = parseCompanyParam(req.params.companyId);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const { id: companyId } = parsed;
    const { confirmCompanyId } = req.validatedBody;

    try {
      const result = await deleteCompanyAtomic({
        db,
        admin,
        companyId,
        confirmCompanyId,
        actorId: req.adminUser.uid
      });

      req.log?.info({
        companyId,
        deletedAuthUsers: result.deletedAuthUsers,
        authErrors: result.authErrors,
        actorId: req.adminUser.uid
      }, "company permanently deleted");

      return res.json({
        success: true,
        companyId: result.companyId,
        deletedAuthUsers: result.deletedAuthUsers
      });
    } catch (err) {
      if (err instanceof ProvisioningError) {
        const status = err.code === "company-not-found" ? 404
          : err.code === "confirm-mismatch" ? 400
            : 400;
        return res.status(status).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "delete-company greška");
      return res.status(500).json({ success: false, error: "Greška pri brisanju firme." });
    }
  }
);

app.get("/api/admin/company/:companyId", requireSuperAdmin, async (req, res) => {
  const parsed = parseCompanyParam(req.params.companyId);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  try {
    const company = await getCompanyDetail({ db, companyId: parsed.id });
    return res.json({ success: true, company });
  } catch (err) {
    if (err instanceof ProvisioningError && err.code === "company-not-found") {
      return res.status(404).json({ success: false, error: err.message });
    }
    req.log?.error({ err }, "company detail greška");
    return res.status(500).json({ success: false, error: "Greška pri učitavanju firme." });
  }
});

app.patch("/api/admin/company/:companyId/settings", rateLimit(20, 5 * 60 * 1000), requireSuperAdmin, async (req, res) => {
  const parsed = parseCompanyParam(req.params.companyId);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  const built = buildTenantSettingsPatch(req.body || {});
  if (!built.ok) {
    return res.status(400).json({ success: false, error: built.error, details: built.details || null });
  }
  try {
    const settingsRef = db.collection("companies").doc(parsed.id).collection("settings").doc("main");
    const snap = await settingsRef.get();
    if (!snap.exists) {
      return res.status(404).json({ success: false, error: "Firma nije pronađena." });
    }
    const existing = snap.data() || {};
    const next = applyTenantSettingsPatch(existing, built.patch, {
      adminTimestampFromDate: (date) => admin.firestore.Timestamp.fromDate(date)
    });
    await settingsRef.set(next, { merge: true });
    await _logAuditEvent("superadmin", req.adminUser.uid, "company_settings_patched", {
      companyId: parsed.id,
      ...built.audit
    });
    const company = await getCompanyDetail({ db, companyId: parsed.id });
    return res.json({
      success: true,
      company,
      editableFeatures: EDITABLE_FEATURE_KEYS
    });
  } catch (err) {
    req.log?.error({ err }, "company settings patch greška");
    return res.status(500).json({ success: false, error: "Podešavanja firme nisu sačuvana." });
  }
});

app.patch(
  "/api/admin/company/:companyId/admins/:uid/status",
  rateLimit(20, 5 * 60 * 1000),
  requireSuperAdmin,
  validateBody(companyAdminStatusBody),
  async (req, res) => {
    const parsed = parseCompanyParam(req.params.companyId);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    try {
      const result = await setCompanyAdminActive({
        db,
        admin,
        companyId: parsed.id,
        uid: req.params.uid,
        active: req.validatedBody.active,
        actorId: req.adminUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err instanceof ProvisioningError) {
        if (err.code === "invalid-uid") return res.status(400).json({ success: false, error: err.message });
        if (err.code === "user-not-found") return res.status(404).json({ success: false, error: err.message });
        if (err.code === "license-suspended") return res.status(403).json({ success: false, error: err.message });
        if (err.code === "license-unavailable") return res.status(409).json({ success: false, error: err.message });
        if (err.code === "compensation-failed") return res.status(500).json({ success: false, error: err.message });
      }
      req.log?.error({ err, code: err.code }, "company admin status greška");
      return res.status(500).json({ success: false, error: "Status company admina nije ažuriran." });
    }
  }
);

app.post(
  "/api/admin/company/:companyId/admins/:uid/reset-password",
  rateLimit(10, 5 * 60 * 1000),
  requireSuperAdmin,
  async (req, res) => {
    const parsed = parseCompanyParam(req.params.companyId);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    try {
      const result = await requestCompanyAdminPasswordReset({
        db,
        admin,
        companyId: parsed.id,
        uid: req.params.uid,
        actorId: req.adminUser.uid
      });
      return res.json({
        success: true,
        uid: result.uid,
        email: result.email,
        resetLink: result.resetLink
      });
    } catch (err) {
      if (err instanceof ProvisioningError) {
        if (err.code === "invalid-uid") return res.status(400).json({ success: false, error: err.message });
        if (err.code === "user-not-found" || err.code === "email-missing") {
          return res.status(404).json({ success: false, error: err.message });
        }
      }
      req.log?.error({ err, code: err.code }, "company admin reset password greška");
      return res.status(500).json({ success: false, error: "Reset lozinke nije uspeo." });
    }
  }
);

app.post(
  "/api/admin/create-user",
  rateLimit(20, 5 * 60 * 1000),
  requireUserProvisioner,
  validateBody(createUserBody),
  async (req, res) => {
    const { email, password, name, role, companyId, groups } = req.validatedBody;

    if (req.adminUser.role === "company_admin") {
      return res.status(403).json({ success: false, error: "Koristite namenski Company Admin endpoint za dispatchere." });
    }

    try {
      const result = await provisionUser({
        db, admin, email, password, name, role, companyId, groups,
        actorId: req.adminUser.uid
      });
      return res.status(201).json({ success: true, uid: result.uid, email: result.email });

    } catch (err) {
      req.log?.error({ err, code: err.code }, "create-user greška");
      if (err.code === "company-not-found") {
        return res.status(404).json({ success: false, error: err.message });
      }
      if (["role-not-allowed", "company-required", "superadmin-company-forbidden"].includes(err.code)) {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (err.code === "auth/email-already-exists") {
        return res.status(409).json({ success: false, error: "Email već postoji." });
      }
      return res.status(500).json({ success: false, error: "Greška pri kreiranju korisnika." });
    }
  }
);

app.put(
  "/api/admin/users/:uid/groups",
  rateLimit(30, 5 * 60 * 1000),
  requireUserProvisioner,
  validateBody(updateUserGroupsBody),
  async (req, res) => {
    const { companyId, groups } = req.validatedBody;
    if (req.adminUser.role === "company_admin") {
      return res.status(403).json({ success: false, error: "Koristite namenski Company Admin endpoint za dispatchere." });
    }
    try {
      const result = await updateDispatcherGroups({
        db, admin, companyId, uid: req.params.uid, groups, actorId: req.adminUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === "invalid-uid") {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (["user-not-found", "group-not-found"].includes(err.code)) {
        return res.status(404).json({ success: false, error: err.message });
      }
      req.log?.error({ err, code: err.code }, "update dispatcher groups greška");
      return res.status(500).json({ success: false, error: "Grupe dispatchera nisu ažurirane." });
    }
  }
);

// ─── Company Admin APIs ────────────────────────────────────

app.put(
  "/api/company-admin/profile-settings",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyProfileSettingsBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    let profile;
    try {
      profile = normalizeCompanyProfileSettings(req.validatedBody);
    } catch (err) {
      if (err.code === "country-not-supported") return res.status(400).json({ success: false, error: err.message });
      throw err;
    }
    const companyRef = db.collection("companies").doc(companyId);
    const profileRef = companyRef.collection("profile").doc("main");
    const auditRef = companyRef.collection("audit_log").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    try {
      await db.runTransaction(async transaction => {
        const current = await transaction.get(profileRef);
        if (!current.exists) {
          const error = new Error("Profil firme nije pronadjen.");
          error.code = "profile-not-found";
          throw error;
        }
        transaction.set(profileRef, { ...profile, updatedAt: timestamp }, { merge: true });
        transaction.set(auditRef, {
          action: "company_profile_settings_updated",
          actorId: req.staffUser.uid,
          actorRole: req.staffUser.role,
          actorName: req.staffUser.name || null,
          source: "server",
          details: { country: profile.country, timezone: profile.timezone, defaultLanguage: profile.defaultLanguage },
          timestamp
        });
      });
      return res.json({ success: true, profile });
    } catch (err) {
      if (err.code === "profile-not-found") return res.status(404).json({ success: false, error: err.message });
      req.log?.error({ err }, "Company profile settings update failed");
      return res.status(500).json({ success: false, error: "Podesavanja firme nisu sacuvana." });
    }
  }
);

app.get(
  "/api/company-admin/exports/:dataset",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const dataset = String(req.params.dataset || "").trim().toLowerCase();
    const companyRef = db.collection("companies").doc(companyId);
    try {
      const result = await buildCompanyExport(companyRef, dataset);
      await companyRef.collection("audit_log").add({
        action: "company_data_exported",
        actorId: req.staffUser.uid,
        actorRole: req.staffUser.role,
        actorName: req.staffUser.name || null,
        source: "server",
        details: { dataset: result.dataset, count: result.count },
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      return res.status(200).send(result.csv);
    } catch (err) {
      if (err.code === "export-not-supported") return res.status(404).json({ success: false, error: err.message });
      if (err.code === "export-too-large") return res.status(413).json({ success: false, error: err.message });
      req.log?.error({ err, dataset }, "Company data export failed");
      return res.status(500).json({ success: false, error: "Izvoz podataka nije uspeo." });
    }
  }
);

app.post(
  "/api/company-admin/dispatchers",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDispatcherBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const { email, password, name, groups } = req.validatedBody;
    const companyRef = db.collection("companies").doc(companyId);
    try {
      const [settingsSnap, usersSnap] = await Promise.all([
        companyRef.collection("settings").doc("main").get(),
        companyRef.collection("users").where("role", "==", "dispatcher").get()
      ]);
      if (!settingsSnap.exists) {
        return res.status(409).json({ success: false, error: "Licenca firme nije dostupna." });
      }
      const settings = settingsSnap.data();
      if (settings.status === "suspended") {
        return res.status(403).json({ success: false, error: "Licenca firme je suspendovana." });
      }
      if (settings.status !== "active") {
        return res.status(409).json({ success: false, error: "Licenca firme nije aktivna." });
      }
      const activeDispatchers = usersSnap.docs.filter(doc => doc.data().active !== false).length;
      const maxDispatchers = Number(settings.maxDispatchers);
      if (!Number.isInteger(maxDispatchers) || maxDispatchers < 1) {
        return res.status(409).json({ success: false, error: "Limit dispatchera nije konfigurisan u licenci." });
      }
      if (activeDispatchers >= maxDispatchers) {
        return res.status(409).json({ success: false, error: "Dostignut je limit aktivnih dispatchera za ovu licencu." });
      }
      const result = await provisionUser({
        db, admin, email, password, name, role: "dispatcher", companyId, groups,
        actorId: req.staffUser.uid
      });
      return res.status(201).json({
        success: true,
        dispatcher: { id: result.uid, email: result.email, name, groups: result.claims.groups, active: true, companyId }
      });
    } catch (err) {
      if (err.code === "auth/email-already-exists") {
        return res.status(409).json({ success: false, error: "Email je vec u upotrebi." });
      }
      if (err.code === "group-not-found") return res.status(404).json({ success: false, error: err.message });
      req.log?.error({ err, code: err.code }, "Company dispatcher create failed");
      return res.status(500).json({ success: false, error: "Dispatcher nije kreiran." });
    }
  }
);

app.put(
  "/api/company-admin/dispatchers/:uid/groups",
  rateLimit(30, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(updateUserGroupsBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await updateDispatcherGroups({
        db, admin, companyId, uid: req.params.uid, groups: req.validatedBody.groups,
        actorId: req.staffUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === "invalid-uid") return res.status(400).json({ success: false, error: err.message });
      if (["user-not-found", "group-not-found"].includes(err.code)) {
        return res.status(404).json({ success: false, error: err.message });
      }
      req.log?.error({ err, code: err.code }, "Company dispatcher groups update failed");
      return res.status(500).json({ success: false, error: "Grupe dispatchera nisu azurirane." });
    }
  }
);

app.patch(
  "/api/company-admin/dispatchers/:uid/status",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDispatcherStatusBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await setDispatcherActive({
        db, admin, companyId, uid: req.params.uid, active: req.validatedBody.active,
        actorId: req.staffUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === "invalid-uid") return res.status(400).json({ success: false, error: err.message });
      if (err.code === "user-not-found") return res.status(404).json({ success: false, error: err.message });
      if (err.code === "license-suspended") return res.status(403).json({ success: false, error: err.message });
      if (err.code === "license-unavailable") return res.status(409).json({ success: false, error: err.message });
      if (err.code === "dispatcher-limit") return res.status(409).json({ success: false, error: err.message });
      req.log?.error({ err, code: err.code }, "Company dispatcher status update failed");
      return res.status(500).json({ success: false, error: "Status dispatchera nije azuriran." });
    }
  }
);

app.post(
  "/api/company-admin/dispatchers/:uid/revoke-sessions",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDispatcherActionBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await revokeDispatcherSessions({
        db, admin, companyId, uid: req.params.uid, actorId: req.staffUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (err.code === "invalid-uid") return res.status(400).json({ success: false, error: err.message });
      if (err.code === "user-not-found") return res.status(404).json({ success: false, error: err.message });
      req.log?.error({ err, code: err.code }, "Company dispatcher session revoke failed");
      return res.status(500).json({ success: false, error: "Sesije dispatchera nisu opozvane." });
    }
  }
);

app.delete(
  "/api/company-admin/dispatchers/:uid",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDispatcherDeleteBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await deleteDispatcher({
        db,
        admin,
        companyId,
        uid: req.params.uid,
        confirmEmail: req.validatedBody.confirmEmail,
        actorId: req.staffUser.uid
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      if (["invalid-uid", "confirm-mismatch"].includes(err.code)) {
        return res.status(400).json({ success: false, code: err.code, error: err.message });
      }
      if (err.code === "user-not-found") {
        return res.status(404).json({ success: false, code: err.code, error: err.message });
      }
      if (["dispatcher-active", "dispatcher-deleting", "dispatcher-delete-incomplete"].includes(err.code)) {
        return res.status(409).json({ success: false, code: err.code, error: err.message });
      }
      req.log?.error({ err, code: err.code }, "Company dispatcher delete failed");
      return res.status(500).json({ success: false, code: "DISPATCHER_DELETE_FAILED", error: "Disponent nije obrisan." });
    }
  }
);

app.put(
  "/api/company-admin/branding",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyBrandingBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;

    const { name, primaryColor, logoUrl } = req.validatedBody;
    try {
      await db.collection("companies").doc(companyId)
        .collection("branding").doc("main")
        .set({ name, primaryColor, logoUrl });
      await _logAuditEvent(companyId, req.staffUser.uid, "branding_updated", {
        name,
        primaryColor,
        hasLogo: Boolean(logoUrl)
      }, {
        actorRole: req.staffUser.role,
        actorName: req.staffUser.name || null
      });
      return res.json({ success: true, branding: { name, primaryColor, logoUrl } });
    } catch (err) {
      req.log?.error({ err }, "Company branding update failed");
      return res.status(500).json({ success: false, error: "Brending firme nije sacuvan." });
    }
  }
);

app.post(
  "/api/company-admin/groups",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyGroupBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const { id, name, description, color } = req.validatedBody;
    const groupRef = db.collection("companies").doc(companyId).collection("groups").doc(id);
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    try {
      await db.runTransaction(async transaction => {
        const existing = await transaction.get(groupRef);
        if (existing.exists) {
          const error = new Error("Grupa sa tim ID-om već postoji.");
          error.code = "group-exists";
          throw error;
        }
        transaction.set(groupRef, {
          lineId: id,
          name,
          description,
          color,
          active: true,
          companyId,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      });
      await _logAuditEvent(companyId, req.staffUser.uid, "company_group_created", {
        groupId: id,
        name,
        color
      }, { actorRole: req.staffUser.role, actorName: req.staffUser.name || null });
      return res.status(201).json({
        success: true,
        group: { id, lineId: id, name, description, color, active: true, companyId }
      });
    } catch (err) {
      if (err.code === "group-exists") return res.status(409).json({ success: false, error: err.message });
      req.log?.error({ err }, "Company group create failed");
      return res.status(500).json({ success: false, error: "Grupa nije kreirana." });
    }
  }
);

app.put(
  "/api/company-admin/groups/:groupId",
  rateLimit(30, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyGroupUpdateBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    let groupId;
    try {
      groupId = normalizeCompanyGroupId(req.params.groupId);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    const { name, description, color } = req.validatedBody;
    const groupRef = db.collection("companies").doc(companyId).collection("groups").doc(groupId);
    try {
      if (!(await groupRef.get()).exists) return res.status(404).json({ success: false, error: "Grupa nije pronađena." });
      await groupRef.set({
        name,
        description,
        color,
        companyId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await _logAuditEvent(companyId, req.staffUser.uid, "company_group_updated", {
        groupId,
        name,
        color
      }, { actorRole: req.staffUser.role, actorName: req.staffUser.name || null });
      return res.json({
        success: true,
        group: { id: groupId, lineId: groupId, name, description, color, active: true, companyId }
      });
    } catch (err) {
      req.log?.error({ err }, "Company group update failed");
      return res.status(500).json({ success: false, error: "Grupa nije ažurirana." });
    }
  }
);

app.delete(
  "/api/company-admin/groups/:groupId",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    let groupId;
    try {
      groupId = normalizeCompanyGroupId(req.params.groupId);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    const companyRef = db.collection("companies").doc(companyId);
    const groupRef = companyRef.collection("groups").doc(groupId);
    try {
      if (!(await groupRef.get()).exists) return res.status(404).json({ success: false, error: "Grupa nije pronađena." });
      const references = await findCompanyGroupReferences(companyRef, groupId);
      if (references.length) {
        return res.status(409).json({
          success: false,
          error: "Grupa se koristi i ne može biti obrisana.",
          details: { references }
        });
      }
      await groupRef.delete();
      await _logAuditEvent(companyId, req.staffUser.uid, "company_group_deleted", { groupId }, {
        actorRole: req.staffUser.role,
        actorName: req.staffUser.name || null
      });
      return res.json({ success: true, groupId });
    } catch (err) {
      req.log?.error({ err }, "Company group delete failed");
      return res.status(500).json({ success: false, error: "Grupa nije obrisana." });
    }
  }
);

app.get(
  "/api/company-admin/drivers",
  rateLimit(40, 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const companyRef = db.collection("companies").doc(companyId);
      const [profileSnap, credSnap] = await Promise.all([
        companyRef.collection("drivers").get(),
        companyRef.collection("driver_credentials").get()
      ]);
      const eidById = new Map(
        credSnap.docs.map((doc) => [doc.id, String(doc.data()?.eid || "").trim()])
      );
      const hasLoginCodeById = new Map(
        credSnap.docs.map((doc) => [doc.id, Boolean(doc.data()?.loginCodeHash)])
      );
      const batch = db.batch();
      let backfill = 0;
      const drivers = profileSnap.docs.map((doc) => {
        const data = doc.data() || {};
        const eid = String(data.eid || eidById.get(doc.id) || "").trim();
        if (eid && !data.eid) {
          batch.update(doc.ref, { eid });
          backfill += 1;
        }
        return {
          id: doc.id,
          firstName: data.firstName || "",
          lastName: data.lastName || "",
          name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
          phone: data.phone || "",
          email: data.email || "",
          groupId: data.groupId || data.lineId || "",
          lineId: data.lineId || data.groupId || "",
          companyId,
          eid,
          active: data.active !== false,
          codeActivated: data.codeActivated === true,
          hasPersonalCode: hasLoginCodeById.get(doc.id) === true || data.codeActivated === true
        };
      });
      if (backfill) await batch.commit().catch(() => {});
      return res.json({ success: true, drivers });
    } catch (err) {
      req.log?.error({ err }, "company-admin drivers list failed");
      return res.status(500).json({ success: false, error: "Lista vozača nije učitana." });
    }
  }
);

app.post(
  "/api/company-admin/drivers/:driverId/personal-code",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDriverPersonalCodeBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const driverId = String(req.params.driverId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(driverId)) {
      return res.status(400).json({ success: false, error: "Nevažeći vozač." });
    }
    const companyCode = String(req.validatedBody.companyCode || "").trim();
    try {
      const companyRef = db.collection("companies").doc(companyId);
      const profileRef = companyRef.collection("drivers").doc(driverId);
      const credentialRef = companyRef.collection("driver_credentials").doc(driverId);
      const [profileSnap, credentialSnap] = await Promise.all([profileRef.get(), credentialRef.get()]);
      if (!profileSnap.exists || !credentialSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      }
      // CA "personal code (PIN)" must be the same secret driver login checks:
      // loginCodeHash + codeActivated=true. Writing only companyCodeHash left
      // imported drivers stuck on OTP-only verifyDriverLogin (live-review 7A.1).
      const loginCodeHash = await bcrypt.hash(companyCode, 12);
      const nowTs = admin.firestore.FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.update(credentialRef, {
        loginCodeHash,
        activationCodeHash: admin.firestore.FieldValue.delete(),
        activationExpiresAt: admin.firestore.FieldValue.delete(),
        activationUsedAt: nowTs,
        activatedAt: nowTs,
        personalCodeUpdatedAt: nowTs,
        personalCodeUpdatedBy: req.staffUser.uid
      });
      batch.update(profileRef, {
        codeActivated: true,
        personalCodeSetAt: nowTs,
        personalCodeSetBy: req.staffUser.uid
      });
      await batch.commit();
      try {
        await admin.auth().revokeRefreshTokens(driverId);
      } catch (revokeErr) {
        req.log?.warn?.({ err: revokeErr, driverId }, "Revoke after CA personal-code set failed");
      }
      await _logAuditEvent(companyId, req.staffUser.uid, "driver_personal_code_set", {
        driverId
      }, {
        actorRole: req.staffUser.role,
        actorName: req.staffUser.name || null
      });
      return res.json({
        success: true,
        driverId,
        companyCode,
        codeActivated: true,
        message: "Lični kod (PIN) je sačuvan. Prikaži ga vozaču sada — više se neće moći pročitati."
      });
    } catch (err) {
      req.log?.error({ err }, "company-admin personal-code failed");
      return res.status(500).json({ success: false, error: "Lični kod nije sačuvan." });
    }
  }
);

app.patch(
  "/api/company-admin/drivers/:driverId",
  rateLimit(30, 5 * 60 * 1000),
  requireCompanyAdmin,
  validateBody(companyDriverProfileBody),
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const driverId = String(req.params.driverId || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(driverId)) {
      return res.status(400).json({ success: false, error: "Nevažeći vozač." });
    }
    const { firstName, lastName, phone, email, groupId } = req.validatedBody;
    const companyRef = db.collection("companies").doc(companyId);
    const profileRef = companyRef.collection("drivers").doc(driverId);
    try {
      await assertCompanyGroupsExist(companyRef, [groupId]);
      const profileSnap = await profileRef.get();
      if (!profileSnap.exists) {
        return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
      }
      const previous = profileSnap.data() || {};
      const name = `${firstName} ${lastName}`.trim();
      await profileRef.update({
        firstName,
        lastName,
        name,
        phone,
        email,
        groupId,
        lineId: groupId,
        profileUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        profileUpdatedBy: req.staffUser.uid
      });
      await _logAuditEvent(companyId, req.staffUser.uid, "driver_profile_updated", {
        driverId,
        previous: {
          firstName: previous.firstName || null,
          lastName: previous.lastName || null,
          phone: previous.phone || null,
          email: previous.email || null,
          groupId: previous.groupId || previous.lineId || null
        },
        next: { firstName, lastName, phone, email, groupId }
      }, {
        actorRole: req.staffUser.role,
        actorName: req.staffUser.name || null
      });
      return res.json({
        success: true,
        driver: {
          id: driverId,
          firstName,
          lastName,
          name,
          phone,
          email,
          groupId,
          lineId: groupId,
          companyId
        }
      });
    } catch (err) {
      if (err.code === "group-not-found") {
        return res.status(404).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Company driver profile update failed");
      return res.status(500).json({ success: false, error: "Profil vozača nije sačuvan." });
    }
  }
);

// Company Admin owns the published service plan; dispatchers only consume it.
app.post(
  "/api/company-admin/service-plans/preview",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const groupId = normalizeServicePlanGroupId(req.body?.groupId);
      await assertCompanyGroupsExist(db.collection("companies").doc(companyId), [groupId]);
      const result = await previewServicePlan(req.body?.plan);
      return res.status(result.valid ? 200 : 422).json({
        success: result.valid,
        valid: result.valid,
        errors: result.errors,
        summary: result.summary
      });
    } catch (err) {
      if (["invalid-group", "group-not-found"].includes(err.code)) {
        return res.status(err.code === "group-not-found" ? 404 : 400).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Service plan preview failed");
      return res.status(500).json({ success: false, error: "Plan nije moguće proveriti." });
    }
  }
);

app.put(
  "/api/company-admin/service-plans/publish",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await publishServicePlan({
        db,
        admin,
        companyId,
        groupId: req.body?.groupId,
        actorId: req.staffUser.uid,
        plan: req.body?.plan,
        source: req.body?.source || {}
      });
      await _logAuditEvent(companyId, req.staffUser.uid, "service_plan_staged", {
        planId: result.planId,
        groupId: result.plan.groupId,
        planCode: result.plan.planCode,
        planVersion: result.plan.planVersion,
        validFrom: result.plan.validFrom,
        sourceHash: result.sourceHash,
        dutyCount: result.summary.dutyCount,
        activityCount: result.summary.activityCount
      });
      return res.json({
        success: true,
        planId: result.planId,
        status: result.status,
        sourceHash: result.sourceHash,
        summary: result.summary
      });
    } catch (err) {
      if (err.code === "validation-failed") {
        return res.status(422).json({ success: false, error: err.message, details: err.details });
      }
      if (err.code === "version-exists") {
        return res.status(409).json({ success: false, error: err.message });
      }
      if (["invalid-group", "group-not-found"].includes(err.code)) {
        return res.status(err.code === "group-not-found" ? 404 : 400).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Service plan publish failed");
      return res.status(500).json({ success: false, error: "Vozni plan nije sačuvan." });
    }
  }
);

app.post(
  "/api/company-admin/service-plans/:planId/activate",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await activateServicePlan({
        db,
        admin,
        companyId,
        groupId: req.body?.groupId,
        actorId: req.staffUser.uid,
        planId: req.params.planId
      });
      await _logAuditEvent(companyId, req.staffUser.uid, result.previousActivePlanId
        ? "service_plan_rolled_back"
        : "service_plan_activated", {
        planId: result.planId,
        groupId: req.body?.groupId,
        previousActivePlanId: result.previousActivePlanId,
        alreadyActive: result.alreadyActive
      });
      return res.json({
        success: true,
        planId: result.planId,
        status: result.status,
        previousActivePlanId: result.previousActivePlanId,
        alreadyActive: result.alreadyActive
      });
    } catch (err) {
      if (err.code === "plan-not-found") {
        return res.status(404).json({ success: false, error: err.message });
      }
      if (err.code === "invalid-status" || err.code === "invalid-plan-id") {
        return res.status(400).json({ success: false, error: err.message });
      }
      if (["invalid-group", "group-not-found"].includes(err.code)) {
        return res.status(err.code === "group-not-found" ? 404 : 400).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Service plan activate failed");
      return res.status(500).json({ success: false, error: "Katalog nije aktiviran." });
    }
  }
);

app.post(
  "/api/company-admin/monthly-plans/import/preview",
  rateLimit(20, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const parsed = groupMonthlyImportPreviewBody.safeParse(req.body);
    if (!parsed.success || parsed.data.companyId !== companyId) {
      return res.status(400).json({ success: false, code: "INVALID_MONTHLY_IMPORT", error: "Fajl mesečnog plana nije ispravan." });
    }
    try {
      const groupId = normalizeServicePlanGroupId(parsed.data.groupId);
      await assertCompanyGroupsExist(db.collection("companies").doc(companyId), [groupId]);
      const activePlan = await getActiveServicePlan({ db, companyId, groupId });
      if (!activePlan) {
        return res.status(409).json({
          success: false,
          code: "ACTIVE_SERVICE_PLAN_REQUIRED",
          error: "Grupa mora imati aktivan katalog smena pre uvoza mesečnog plana."
        });
      }
      const preview = await prepareGroupMonthlyImport({
        db,
        admin,
        companyId,
        actorId: req.staffUser.uid,
        ...parsed.data,
        groupId,
        activePlan
      });
      await _logAuditEvent(companyId, req.staffUser.uid, "group_monthly_plan_import_previewed", {
        importId: preview.id,
        groupId,
        month: parsed.data.month,
        mode: parsed.data.mode,
        sourceName: parsed.data.sourceName,
        reason: parsed.data.reason,
        summary: preview.summary
      }, { actorRole: req.staffUser.role, actorName: req.staffUser.name || null });
      return res.json({ success: true, preview });
    } catch (err) {
      if (err instanceof GroupMonthlyImportError) {
        return res.status(err.status).json({ success: false, code: err.code, error: "Mesečni plan mora biti ispravljen.", details: err.details });
      }
      if (["invalid-group", "group-not-found"].includes(err.code)) {
        return res.status(err.code === "group-not-found" ? 404 : 400).json({ success: false, code: err.code, error: err.message });
      }
      req.log?.error({ err }, "Company monthly plan import preview failed");
      return res.status(500).json({ success: false, code: "MONTHLY_IMPORT_PREVIEW_FAILED", error: "Pregled mesečnog plana nije pripremljen." });
    }
  }
);

app.put(
  "/api/company-admin/monthly-plans/import/commit",
  rateLimit(10, 5 * 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    const parsed = groupMonthlyImportCommitBody.safeParse(req.body);
    if (!parsed.success || parsed.data.companyId !== companyId) {
      return res.status(400).json({ success: false, code: "INVALID_MONTHLY_IMPORT_COMMIT", error: "Potvrda uvoza nije ispravna." });
    }
    try {
      const result = await commitGroupMonthlyImport({
        db,
        admin,
        companyId,
        actorId: req.staffUser.uid,
        importId: parsed.data.importId,
        fingerprint: parsed.data.fingerprint
      });
      await _logAuditEvent(companyId, req.staffUser.uid, "group_monthly_plan_import_committed", {
        importId: result.id,
        summary: result.summary,
        idempotent: result.idempotent
      }, { actorRole: req.staffUser.role, actorName: req.staffUser.name || null });
      return res.json({ success: true, ...result });
    } catch (err) {
      await _logAuditEvent(companyId, req.staffUser.uid, "group_monthly_plan_import_failed", {
        importId: parsed.data.importId,
        code: err.code || "MONTHLY_IMPORT_COMMIT_FAILED"
      }, { actorRole: req.staffUser.role, actorName: req.staffUser.name || null }).catch(() => {});
      if (err instanceof GroupMonthlyImportError) {
        return res.status(err.status).json({ success: false, code: err.code, error: "Mesečni plan nije objavljen.", details: err.details });
      }
      req.log?.error({ err }, "Company monthly plan import commit failed");
      return res.status(500).json({ success: false, code: "MONTHLY_IMPORT_COMMIT_FAILED", error: "Mesečni plan nije objavljen. Bezbedno pokušajte ponovo." });
    }
  }
);

app.get(
  "/api/company-admin/service-plans/history",
  rateLimit(60, 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const groupId = normalizeServicePlanGroupId(req.query.groupId);
      await assertCompanyGroupsExist(db.collection("companies").doc(companyId), [groupId]);
      const plans = await listServicePlanHistory({ db, companyId, groupId });
      return res.json({ success: true, plans });
    } catch (err) {
      if (["invalid-group", "group-not-found"].includes(err.code)) {
        return res.status(err.code === "group-not-found" ? 404 : 400).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Service plan history load failed");
      return res.status(500).json({ success: false, error: "Istoriju planova nije moguće učitati." });
    }
  }
);

app.get(
  "/api/company-admin/service-plans/:planId",
  rateLimit(60, 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const groupId = normalizeServicePlanGroupId(req.query.groupId);
      const plan = await getServicePlanVersion({ db, companyId, groupId, planId: req.params.planId });
      if (!plan) return res.status(404).json({ success: false, error: "Verzija voznog plana nije pronađena." });
      return res.json({ success: true, plan });
    } catch (err) {
      if (["invalid-group", "invalid-plan-id"].includes(err.code)) {
        return res.status(400).json({ success: false, error: err.message });
      }
      req.log?.error({ err }, "Service plan version load failed");
      return res.status(500).json({ success: false, error: "Verziju voznog plana nije moguće učitati." });
    }
  }
);

app.get(
  "/api/company-admin/audit",
  rateLimit(60, 60 * 1000),
  requireCompanyAdmin,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    try {
      const result = await listAuditEvents({
        db,
        companyId,
        filters: {
          category: req.query.category,
          actor: req.query.actor,
          action: req.query.action,
          from: req.query.from,
          to: req.query.to,
          cursor: req.query.cursor,
          limit: req.query.limit
        }
      });
      return res.json({ success: true, ...result });
    } catch (err) {
      req.log?.error({ err }, "Company audit load failed");
      return res.status(500).json({ success: false, error: "Evidenciju aktivnosti nije moguÄ‡e uÄitati." });
    }
  }
);

app.post(
  "/api/staff/audit/state-sync",
  rateLimit(30, 60 * 1000),
  requireCompanyStaff,
  async (req, res) => {
    const details = normalizeStateSyncDetails(req.body);
    await _logAuditEvent(req.staffUser.companyId, req.staffUser.uid, "state_sync", details, {
      actorRole: req.staffUser.role,
      actorName: req.staffUser.name || null,
      source: "client-reported"
    });
    return res.status(202).json({ success: true });
  }
);

app.get(
  "/api/staff/service-plans/active",
  rateLimit(60, 60 * 1000),
  requireCompanyStaff,
  async (req, res) => {
    const companyId = requireOwnCompany(req, res);
    if (!companyId) return;
    let groupId;
    try {
      groupId = normalizeServicePlanGroupId(req.query.groupId);
    } catch (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (req.staffUser.role === "dispatcher") {
      // Grupe dolaze iz tenant profila (staff-auth), ne iz token claims-a.
      const groups = req.staffUser.groups;
      if (!groups.includes(groupId)) {
        return res.status(403).json({ success: false, error: "Plan nije u dodeljenim grupama disponenta." });
      }
    }
    try {
      const plan = await getActiveServicePlan({ db, companyId, groupId });
      if (!plan) return res.status(404).json({ success: false, error: "Važeći vozni plan nije pronađen." });
      return res.json({ success: true, plan });
    } catch (err) {
      req.log?.error({ err }, "Active service plan load failed");
      return res.status(500).json({ success: false, error: "Vozni plan nije moguće učitati." });
    }
  }
);

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "Endpoint nije pronađen." });
  }
  res.setHeader("Cache-Control", "no-cache");
  const accept = String(req.headers.accept || "");
  if (!accept.includes("text/html") && req.path.includes(".")) {
    return res.status(404).end();
  }
  // Deep links: keep surface if path hints driver/staff assets already served by static
  if (req.path.startsWith("/driver")) {
    return res.sendFile(path.join(STATIC_DIR, "driver.html"));
  }
  if (req.path.startsWith("/staff")) {
    return res.sendFile(path.join(STATIC_DIR, "staff.html"));
  }
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// ─── Error handler ─────────────────────────────────────────

app.use((err, req, res, _next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ success: false, error: "CORS origin nije dozvoljen." });
  }
  req.log?.error({ err }, "Unhandled error");
  return res.status(500).json({ success: false, error: "Interna greška servera." });
});

// ─── Helpers ───────────────────────────────────────────────

function sanitizeAuditActorName(value) {
  const name = String(value || "").trim().slice(0, 120);
  if (!name) return null;
  if (!name.includes("@")) return name;
  const local = name.split("@")[0].trim();
  return local || null;
}

async function _logAuditEvent(companyId, actorId, action, details = {}, metadata = {}) {
  if (!HAS_FIREBASE) return;
  try {
    await db.collection("companies").doc(companyId)
      .collection("audit_log").add({
        action, actorId, details,
        actorRole: metadata.actorRole || null,
        actorName: sanitizeAuditActorName(metadata.actorName),
        source: metadata.source || "server",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    logger.warn({ err: err.message, companyId, action }, "Audit log greška");
  }
}

function getLocalIP() {
  let nets;
  try {
    nets = os.networkInterfaces();
  } catch (error) {
    logger.debug?.({ err: error?.message }, "Local network interfaces unavailable");
    return "localhost";
  }
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

// ─── Start ─────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  const isPublicRuntime = process.env.NODE_ENV === "production";
  const startup = buildStartupInfo({
    nodeEnv: process.env.NODE_ENV,
    hasFirebase: HAS_FIREBASE,
    hasDist: HAS_DIST,
    port: PORT,
    localIp: isPublicRuntime ? null : getLocalIP()
  });

  logger.info({
    port: PORT,
    mode: startup.mode,
    frontend: HAS_DIST ? "dist/" : "dev",
    corsOrigins: allowedOrigins
  }, "BusCommand server started");

  startup.lines.forEach((line) => console.log(line));
  if (!startup.isPublicRuntime && !HAS_FIREBASE) {
    console.log("  ℹ️  Za produkciju dodaj firebase-admin-key.json");
    console.log("     (vidi SETUP-FIREBASE.md)");
  }
});
