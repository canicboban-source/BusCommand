// ============================================================
// BusCommand — Unified Server (demo + produkcija)
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

const { logger } = require("./server/logger");
const { rateLimit, clearRateLimit, getClientIp } = require("./server/rate-limit");
const {
  validateBody,
  sanitizeCompanyId,
  assertCompanyIdUsable,
  driverLoginBody,
  companyStatusBody,
  hashPinBody,
  createCompanyBody,
  createUserBody
} = require("./server/validation");

const { version: APP_VERSION } = require("./package.json");

const PORT = Number(process.env.PORT) || 8766;
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "firebase-admin-key.json");
const HAS_FIREBASE = fs.existsSync(SERVICE_ACCOUNT_PATH);

const DEFAULT_CORS_ORIGINS = [
  "http://localhost:8766",
  "http://127.0.0.1:8766"
];

let admin = null;
let db    = null;

if (HAS_FIREBASE) {
  admin = require("firebase-admin");
  const serviceAccount = require(SERVICE_ACCOUNT_PATH);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
}

// Demo vozači — usklađeno sa js/core/constants.js DEMO_STATE
const DEMO_DRIVERS = [
  { id: "drv-1", name: "Alex Driver", pin: "1234", bus: "101", companyId: "demo", active: true },
  { id: "drv-2", name: "Sam Driver", pin: "1234", bus: "102", companyId: "demo", active: true }
];

const app = express();

app.set("trust proxy", 1);

const allowedOrigins = (process.env.CORS_ORIGINS || DEFAULT_CORS_ORIGINS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Not allowed by CORS"));
  },
  credentials: true
}));

app.use(pinoHttp({
  logger,
  autoLogging: { ignore: (req) => req.url === "/api/config" }
}));

app.use(express.json({ limit: "64kb" }));

const DIST_DIR = path.join(__dirname, "dist");
const HAS_DIST = fs.existsSync(path.join(DIST_DIR, "index.html"));
const STATIC_DIR = HAS_DIST ? DIST_DIR : __dirname;

app.use(express.static(STATIC_DIR, {
  etag: false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

async function requireSuperAdmin(req, res, next) {
  if (!HAS_FIREBASE) {
    return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
  }
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ success: false, error: "Nema tokena." });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.role !== "superadmin") {
      return res.status(403).json({ success: false, error: "Pristup odbijen." });
    }
    req.adminUser = decoded;
    next();
  } catch (err) {
    req.log?.warn({ err }, "SuperAdmin token verification failed");
    return res.status(401).json({ success: false, error: "Nevažeći token." });
  }
}

function parseCompanyParam(companyId) {
  if (!companyId || typeof companyId !== "string") {
    return { ok: false, error: "Nedostaje companyId." };
  }
  const id = companyId.trim().toLowerCase();
  if (!id || id.length > 64 || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return { ok: false, error: "Nevalidan companyId." };
  }
  return { ok: true, id };
}

// ─── API: Konfiguracija servera ────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    uptime: Math.floor(process.uptime()),
    mode: HAS_FIREBASE ? "production" : "demo"
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

// ─── API: Driver PIN Login ─────────────────────────────────

app.post(
  "/api/auth/driver-login",
  rateLimit(10, 5 * 60 * 1000),
  validateBody(driverLoginBody),
  async (req, res) => {
    const { companyId, driverId, pin } = req.validatedBody;
    const clientIp = getClientIp(req);

    if (companyId === "demo" && !HAS_FIREBASE) {
      return _demoDriverLogin(driverId, pin, res, clientIp);
    }

    if (!HAS_FIREBASE) {
      return res.status(503).json({
        success: false,
        error: "Produkcijski login zahtijeva Firebase. Dodajte firebase-admin-key.json ili koristite ?mode=demo."
      });
    }

    try {
      const companyRef  = db.collection("companies").doc(companyId);
      const companySnap = await companyRef.get();

      if (!companySnap.exists) {
        return res.status(404).json({ success: false, error: "Firma nije pronađena." });
      }

      const companySettings = (await companyRef.collection("settings").doc("main").get()).data() || {};
      if (companySettings.status === "suspended") {
        return res.status(403).json({
          success: false,
          error: "Pristup firmi je suspendovan. Kontaktirajte podršku."
        });
      }

      const driverRef  = companyRef.collection("drivers").doc(driverId);
      const driverSnap = await driverRef.get();

      if (!driverSnap.exists) {
        return res.status(401).json({
          success: false,
          error: "Pogrešan PIN ili vozač nije pronađen."
        });
      }

      const driver = driverSnap.data();

      if (driver.active === false) {
        return res.status(403).json({ success: false, error: "Nalog je deaktiviran." });
      }

      const pinMatch = await bcrypt.compare(String(pin), driver.pin);
      if (!pinMatch) {
        await _logAuditEvent(companyId, driverId, "driver_login_failed", { driverId, ip: clientIp });
        return res.status(401).json({ success: false, error: "Pogrešan PIN." });
      }

      const customToken = await admin.auth().createCustomToken(driverId, {
        role: "driver", companyId, name: driver.name,
        bus: driver.bus || null, driverId
      });

      await _logAuditEvent(companyId, driverId, "driver_login_success", {
        driverName: driver.name, bus: driver.bus
      });

      clearRateLimit(clientIp);

      return res.json({
        success: true,
        token: customToken,
        user: { id: driverId, name: driver.name, bus: driver.bus || null, companyId }
      });

    } catch (err) {
      req.log?.error({ err }, "Driver login greška");
      return res.status(500).json({ success: false, error: "Server greška. Pokušajte ponovo." });
    }
  }
);

function _demoDriverLogin(driverId, pin, res, ip) {
  const driver = DEMO_DRIVERS.find((d) => d.id === driverId);
  if (!driver || String(pin) !== driver.pin) {
    return res.status(401).json({ success: false, error: "Pogrešan PIN." });
  }
  clearRateLimit(ip);
  return res.json({
    success: true,
    token: null,
    demo: true,
    user: { id: driver.id, name: driver.name, bus: driver.bus, companyId: "demo" }
  });
}

// ─── API: Licenca ──────────────────────────────────────────

app.get("/api/license/:companyId", async (req, res) => {
  const parsed = parseCompanyParam(req.params.companyId);
  if (!parsed.ok) {
    return res.status(400).json({ success: false, error: parsed.error });
  }
  const { id: companyId } = parsed;

  if (companyId === "demo" || !HAS_FIREBASE) {
    return res.json({
      success: true, plan: "trial", status: "active",
      daysRemaining: 30, features: {}, maxDrivers: 50, maxDispatchers: 5
    });
  }

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
    return res.status(500).json({ success: false, error: "Greška pri provjeri licence." });
  }
});

// ─── API: SuperAdmin ───────────────────────────────────────

app.get("/api/admin/companies", requireSuperAdmin, async (req, res) => {
  try {
    const companiesSnap = await db.collection("companies").get();

    const companies = await Promise.all(companiesSnap.docs.map(async (doc) => {
      const [profileSnap, settingsSnap] = await Promise.all([
        doc.ref.collection("profile").doc("main").get(),
        doc.ref.collection("settings").doc("main").get()
      ]);
      const profile = profileSnap.exists ? profileSnap.data() : doc.data();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};

      return {
        id: doc.id,
        name: profile.name || doc.id,
        country: profile.country,
        status: settings.status || "unknown",
        plan: settings.plan || "trial",
        email: profile.contactEmail
      };
    }));

    return res.json({ success: true, companies });

  } catch (err) {
    req.log?.error({ err }, "Admin companies greška");
    return res.status(500).json({ success: false, error: "Greška." });
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
  "/api/admin/hash-pin",
  requireSuperAdmin,
  validateBody(hashPinBody),
  async (req, res) => {
    const { pin } = req.validatedBody;

    try {
      const hash = await bcrypt.hash(String(pin), 12);
      return res.json({ success: true, hash });
    } catch (err) {
      req.log?.error({ err }, "hash-pin greška");
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
      const ref = db.collection("companies").doc(companyId);
      if ((await ref.get()).exists) {
        return res.status(409).json({ success: false, error: "Firma već postoji." });
      }

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 30);

      await ref.collection("profile").doc("main").set({
        name, slug: companyId, country: body.country || "AT",
        contactEmail: body.contactEmail || ("admin@" + companyId + ".com"),
        timezone: "Europe/Vienna", defaultLanguage: "de", status: "active",
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await ref.collection("branding").doc("main").set({
        name, primaryColor: "#3b82f6", logo: null, appTitle: name + " Fleet"
      });
      await ref.collection("settings").doc("main").set({
        plan: "trial", status: "active", maxDrivers: 50, maxDispatchers: 5,
        trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
        features: { liveMap: true, pdfSchedules: true, excelImport: true,
          sosAlarm: true, multiLanguage: true, reports: true }
      });
      await ref.collection("settings").doc("sos").set({
        sosActive: false, sosDriver: "", sosBus: ""
      });

      await _logAuditEvent("superadmin", req.adminUser.uid, "company_created", { companyId, name });

      return res.status(201).json({ success: true, companyId, name });

    } catch (err) {
      req.log?.error({ err }, "create-company greška");
      return res.status(500).json({ success: false, error: "Greška pri kreiranju firme." });
    }
  }
);

app.post(
  "/api/admin/create-user",
  requireSuperAdmin,
  validateBody(createUserBody),
  async (req, res) => {
    const { email, password, name, role, companyId } = req.validatedBody;

    try {
      const userRecord = await admin.auth().createUser({
        email, password, displayName: name || email
      });

      const claims = { role, name: name || email };
      if (companyId) claims.companyId = companyId;
      await admin.auth().setCustomUserClaims(userRecord.uid, claims);

      if (companyId && role !== "superadmin") {
        const companyRef = db.collection("companies").doc(companyId);
        if (!(await companyRef.get()).exists) {
          await admin.auth().deleteUser(userRecord.uid);
          return res.status(404).json({ success: false, error: "Firma nije pronađena." });
        }
        await companyRef.collection("users").doc(userRecord.uid).set({
          id: userRecord.uid, email, name: name || email,
          role, companyId, active: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      await _logAuditEvent(companyId || "superadmin", req.adminUser.uid, "user_created", {
        uid: userRecord.uid, email, role, companyId
      });

      return res.status(201).json({ success: true, uid: userRecord.uid, email });

    } catch (err) {
      req.log?.error({ err, code: err.code }, "create-user greška");
      if (err.code === "auth/email-already-exists") {
        return res.status(409).json({ success: false, error: "Email već postoji." });
      }
      return res.status(500).json({ success: false, error: "Greška pri kreiranju korisnika." });
    }
  }
);

// ─── SPA fallback ──────────────────────────────────────────

app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ success: false, error: "Endpoint nije pronađen." });
  }
  res.sendFile(path.join(STATIC_DIR, "index.html"));
});

// ─── Error handler ─────────────────────────────────────────

app.use((err, req, res, next) => {
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ success: false, error: "CORS origin nije dozvoljen." });
  }
  req.log?.error({ err }, "Unhandled error");
  return res.status(500).json({ success: false, error: "Interna greška servera." });
});

// ─── Helpers ───────────────────────────────────────────────

async function _logAuditEvent(companyId, actorId, action, details = {}) {
  if (!HAS_FIREBASE) return;
  try {
    await db.collection("companies").doc(companyId)
      .collection("audit_log").add({
        action, actorId, details,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    logger.warn({ err: err.message, companyId, action }, "Audit log greška");
  }
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}

// ─── Start ─────────────────────────────────────────────────

app.listen(PORT, "0.0.0.0", () => {
  const localIP = getLocalIP();
  const modeLabel = HAS_FIREBASE ? "PRODUKCIJA (+ demo)" : "DEMO (bez Firebase ključa)";

  logger.info({
    port: PORT,
    mode: modeLabel,
    frontend: HAS_DIST ? "dist/" : "dev",
    corsOrigins: allowedOrigins
  }, "BusCommand server started");

  console.log("");
  console.log("===========================================");
  console.log("  BusCommand Server v30.1");
  console.log("  Frontend: " + (HAS_DIST ? "dist/ (Vite build)" : "js/main.js (dev bundle)"));
  console.log("  Režim: " + modeLabel);
  console.log("===========================================");
  console.log("  Lokalno:    http://localhost:" + PORT);
  console.log("  Demo URL:   http://localhost:" + PORT + "/?mode=demo");
  console.log("  Demo admin:  admin@demo.com / demo123");
  console.log("  Demo dispo:  demo@buscommand.com / demo123");
  console.log("  Demo driver: Alex Driver ili Sam Driver, PIN 1234");
  console.log("  Produkcija: http://localhost:" + PORT + "/?mode=production&company=ID");
  if (localIP !== "localhost") {
    console.log("  Telefon:    http://" + localIP + ":" + PORT);
  }
  console.log("===========================================");
  if (!HAS_FIREBASE) {
    console.log("  ℹ️  Za produkciju dodaj firebase-admin-key.json");
    console.log("     (vidi SETUP-FIREBASE.md)");
  }
  console.log("");
});
