// ============================================================
// FleetPulse — API SERVER
// Node.js + Express backend
// Servira statičke fajlove + API endpointi za auth i admin
// ============================================================

const express  = require("express");
const admin    = require("firebase-admin");
const bcrypt   = require("bcrypt");
const path     = require("path");
const fs       = require("fs");
const cors     = require("cors");

const PORT = 8766;

// ─── FIREBASE ADMIN INIT ──────────────────────────────────
// Potreban fajl: firebase-admin-key.json (preuzmi iz Firebase Console)
// Vidi: SETUP-FIREBASE.md — korak 6

const SERVICE_ACCOUNT_PATH = path.join(__dirname, "firebase-admin-key.json");

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("\n❌ GREŠKA: firebase-admin-key.json nije pronađen!");
  console.error("   Pogledaj SETUP-FIREBASE.md — korak 6 za instrukcije.\n");
  process.exit(1);
}

const serviceAccount = require(SERVICE_ACCOUNT_PATH);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ─── EXPRESS APP ──────────────────────────────────────────

const app = express();

// CORS — dozvoli localhost za dev
app.use(cors({ origin: "http://localhost:" + PORT }));
app.use(express.json());

// Serviranje statičkih fajlova (index.html, app.js, style.css...)
app.use(express.static(path.join(__dirname), {
  etag:         false,
  lastModified: false,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  }
}));

// ─── MIDDLEWARE: Rate Limiting (jednostavan) ───────────────

const _loginAttempts = new Map(); // IP -> { count, resetAt }

function rateLimit(maxAttempts = 5, windowMs = 5 * 60 * 1000) {
  return (req, res, next) => {
    const ip  = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const rec = _loginAttempts.get(ip);

    if (rec && now < rec.resetAt) {
      if (rec.count >= maxAttempts) {
        return res.status(429).json({
          success: false,
          error:   "Previše pokušaja. Pokušajte za " +
                   Math.ceil((rec.resetAt - now) / 60000) + " minuta."
        });
      }
      rec.count++;
    } else {
      _loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
    }
    next();
  };
}

function clearRateLimit(ip) {
  _loginAttempts.delete(ip);
}

// ─── MIDDLEWARE: Verify SuperAdmin ────────────────────────

async function requireSuperAdmin(req, res, next) {
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
    return res.status(401).json({ success: false, error: "Nevažeći token." });
  }
}

// ─── API: Driver PIN Login ─────────────────────────────────
// POST /api/auth/driver-login
// Body: { companyId, driverId, pin }
// Vraća: { success, token (Firebase custom token), user }

app.post("/api/auth/driver-login", rateLimit(10, 5 * 60 * 1000), async (req, res) => {
  const { companyId, driverId, pin } = req.body;

  if (!companyId || !driverId || !pin) {
    return res.json({ success: false, error: "Nedostaju podaci za prijavu." });
  }

  try {
    // 1. Provjeri da li firma postoji i ima aktivnu licencu
    const companyRef = db.collection("companies").doc(companyId);
    const companySnap = await companyRef.get();

    if (!companySnap.exists) {
      return res.json({ success: false, error: "Firma nije pronađena." });
    }

    const companySettings = (await companyRef.collection("settings").doc("main").get()).data() || {};
    if (companySettings.status === "suspended") {
      return res.json({ success: false, error: "Pristup firmi je suspendovan. Kontaktirajte podršku." });
    }

    // 2. Uzmi vozača iz baze
    const driverRef = companyRef.collection("drivers").doc(driverId);
    const driverSnap = await driverRef.get();

    if (!driverSnap.exists) {
      // Ne otkrivaj da vozač ne postoji — ista poruka kao pogrešan PIN
      return res.json({ success: false, error: "Pogrešan PIN ili vozač nije pronađen." });
    }

    const driver = driverSnap.data();

    if (!driver.active) {
      return res.json({ success: false, error: "Nalog je deaktiviran." });
    }

    // 3. Provjeri PIN hash (bcrypt)
    const pinMatch = await bcrypt.compare(String(pin), driver.pin);

    if (!pinMatch) {
      // Audit log — neuspješan pokušaj
      await _logAuditEvent(companyId, driverId, "driver_login_failed", {
        driverId,
        ip: req.ip
      });
      return res.json({ success: false, error: "Pogrešan PIN." });
    }

    // 4. Generiši Firebase Custom Token s custom claims
    const customToken = await admin.auth().createCustomToken(driverId, {
      role:       "driver",
      companyId:  companyId,
      name:       driver.name,
      bus:        driver.bus || null,
      driverId:   driverId
    });

    // 5. Audit log — uspješna prijava
    await _logAuditEvent(companyId, driverId, "driver_login_success", {
      driverName: driver.name,
      bus:        driver.bus
    });

    // 6. Oslobodi rate limit za ovaj IP
    clearRateLimit(req.ip);

    return res.json({
      success: true,
      token: customToken,
      user: {
        id:        driverId,
        name:      driver.name,
        bus:       driver.bus || null,
        companyId: companyId
      }
    });

  } catch (err) {
    console.error("❌ Driver login greška:", err);
    return res.json({ success: false, error: "Server greška. Pokušajte ponovo." });
  }
});

// ─── API: Provjeri licencu firme ──────────────────────────
// GET /api/license/:companyId
// Vraća plan, status, daysRemaining

app.get("/api/license/:companyId", async (req, res) => {
  const { companyId } = req.params;

  try {
    const settingsSnap = await db
      .collection("companies").doc(companyId)
      .collection("settings").doc("main").get();

    if (!settingsSnap.exists) {
      return res.json({ success: false, error: "Firma nije pronađena." });
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
      plan:           s.plan || "trial",
      status:         s.status || "active",
      daysRemaining,
      features:       s.features || {},
      maxDrivers:     s.maxDrivers || 10,
      maxDispatchers: s.maxDispatchers || 2
    });

  } catch (err) {
    console.error("❌ License check greška:", err);
    return res.json({ success: false, error: "Greška pri provjeri licence." });
  }
});

// ─── API: SuperAdmin — Lista firmi ────────────────────────
// GET /api/admin/companies    (zahtijeva SuperAdmin token)

app.get("/api/admin/companies", requireSuperAdmin, async (req, res) => {
  try {
    const companiesSnap = await db.collection("companies").get();
    const companies = [];

    for (const doc of companiesSnap.docs) {
      const profile = doc.data();
      const settingsSnap = await doc.ref.collection("settings").doc("main").get();
      const settings = settingsSnap.exists ? settingsSnap.data() : {};

      companies.push({
        id:      doc.id,
        name:    profile.name,
        country: profile.country,
        status:  settings.status || "unknown",
        plan:    settings.plan   || "trial",
        email:   profile.contactEmail
      });
    }

    return res.json({ success: true, companies });

  } catch (err) {
    console.error("❌ Admin companies greška:", err);
    return res.json({ success: false, error: "Greška." });
  }
});

// ─── API: SuperAdmin — Suspend / Aktiviraj firmu ──────────
// POST /api/admin/company/:companyId/status
// Body: { status: "active" | "suspended", reason }

app.post("/api/admin/company/:companyId/status", requireSuperAdmin, async (req, res) => {
  const { companyId } = req.params;
  const { status, reason } = req.body;

  if (!["active", "suspended"].includes(status)) {
    return res.json({ success: false, error: "Nevažeći status." });
  }

  try {
    await db.collection("companies").doc(companyId)
      .collection("settings").doc("main").update({
        status,
        suspendedAt:   status === "suspended" ? admin.firestore.FieldValue.serverTimestamp() : null,
        suspendReason: status === "suspended" ? (reason || null) : null
      });

    await _logAuditEvent("superadmin", req.adminUser.uid, "company_status_changed", {
      companyId, status, reason
    });

    return res.json({ success: true });

  } catch (err) {
    console.error("❌ Status update greška:", err);
    return res.json({ success: false, error: "Greška." });
  }
});

// ─── API: PIN Hash — Pomoćni endpoint za kreiranje vozača ─
// POST /api/admin/hash-pin    (samo za dev/admin setup)
// Body: { pin }

app.post("/api/admin/hash-pin", requireSuperAdmin, async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.json({ success: false, error: "Nedostaje PIN." });

  try {
    const hash = await bcrypt.hash(String(pin), 12);
    return res.json({ success: true, hash });
  } catch (err) {
    return res.json({ success: false, error: "Greška." });
  }
});

// ─── SPA FALLBACK ─────────────────────────────────────────
// Sve ostale rute → index.html

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ─── PRIVATE HELPERS ──────────────────────────────────────

async function _logAuditEvent(companyId, actorId, action, details = {}) {
  try {
    await db.collection("companies").doc(companyId)
      .collection("audit_log").add({
        action,
        actorId,
        details,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
  } catch (err) {
    // Audit log ne smije rušiti glavnu logiku
    console.warn("Audit log greška:", err.message);
  }
}

// ─── START SERVER ─────────────────────────────────────────

app.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("===========================================");
  console.log("  ✅ FleetPulse Server pokrenut!");
  console.log("  Otvorite u browser:");
  console.log("  http://localhost:" + PORT);
  console.log("===========================================");
  console.log("  API endpointi:");
  console.log("  POST /api/auth/driver-login");
  console.log("  GET  /api/license/:companyId");
  console.log("  GET  /api/admin/companies   [SuperAdmin]");
  console.log("===========================================");
  console.log("  Pritisnite Ctrl+C da zaustavite server.");
  console.log("");
});
