/**
 * L7 Super Admin support session — time-boxed, audited, read-only, no impersonation.
 * Feature flag: companies/{id}/settings/main.features.supportSession (default false).
 * Never reads driver_credentials or login secrets.
 */
const crypto = require("crypto");
const { z } = require("zod");

const SUPPORT_TTL_MS = 60 * 60 * 1000;
const SUPPORT_CATEGORIES = Object.freeze(["incident", "onboarding", "billing"]);
const REASON_MIN = 20;
const REASON_MAX = 500;

const startSupportSessionBody = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  reason: z.string().trim().min(REASON_MIN).max(REASON_MAX)
});

function newSupportSessionId() {
  return `sup_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isFeatureEnabled(settingsMain) {
  return settingsMain?.features?.supportSession === true;
}

function publicSessionView(session, sessionId) {
  if (!session) return null;
  return {
    id: sessionId || session.id || null,
    status: session.status,
    category: session.category,
    reason: session.reason,
    scope: session.scope || "read_only",
    startedAt: toDate(session.startedAt)?.toISOString() || null,
    expiresAt: toDate(session.expiresAt)?.toISOString() || null,
    endedAt: toDate(session.endedAt)?.toISOString() || null,
    startedByUid: session.startedByUid || null,
    endedByUid: session.endedByUid || null,
    endedByRole: session.endedByRole || null
  };
}

function createSupportSessionHandlers({
  db,
  admin,
  hasFirebase,
  logAudit,
  parseCompanyParam
}) {
  async function loadSettingsMain(companyRef) {
    const snap = await companyRef.collection("settings").doc("main").get();
    return snap.exists ? snap.data() : {};
  }

  async function expireSession(companyRef, sessionId, data, now = new Date()) {
    const batch = db().batch();
    batch.update(companyRef.collection("support_sessions").doc(sessionId), {
      status: "expired",
      endedAt: admin().firestore.Timestamp.fromDate(now),
      endedByUid: "system",
      endedByRole: "system"
    });
    batch.set(companyRef.collection("settings").doc("support"), {
      active: false,
      sessionId: null,
      expiresAt: null,
      category: null,
      reasonPreview: null,
      startedByUid: null,
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    await logAudit(companyRef.id, "system", "support_session_expired", {
      sessionId,
      category: data.category || null
    }, { actorRole: "system", source: "server" });
  }

  async function findActiveSession(companyRef, now = new Date()) {
    const snap = await companyRef.collection("support_sessions")
      .where("status", "==", "active")
      .limit(5)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const expiresAt = toDate(data.expiresAt);
      if (expiresAt && expiresAt.getTime() <= now.getTime()) {
        await expireSession(companyRef, doc.id, data, now);
        continue;
      }
      return { id: doc.id, data };
    }
    return null;
  }

  async function endSession({ companyRef, sessionId, data, endedByUid, endedByRole, now = new Date() }) {
    const batch = db().batch();
    batch.update(companyRef.collection("support_sessions").doc(sessionId), {
      status: "ended",
      endedAt: admin().firestore.Timestamp.fromDate(now),
      endedByUid,
      endedByRole
    });
    batch.set(companyRef.collection("settings").doc("support"), {
      active: false,
      sessionId: null,
      expiresAt: null,
      category: null,
      reasonPreview: null,
      startedByUid: null,
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await batch.commit();
    await logAudit(companyRef.id, endedByUid, "support_session_ended", {
      sessionId,
      category: data.category || null,
      endedByRole
    }, { actorRole: endedByRole, source: "server" });
  }

  async function startSupportSession(req, res) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    const parsedCompany = parseCompanyParam(req.params.companyId);
    if (!parsedCompany.ok) return res.status(400).json({ success: false, error: parsedCompany.error });
    const body = startSupportSessionBody.safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({
        success: false,
        error: "Nevažeći podaci. Kategorija i razlog (min. 20 karaktera) su obavezni."
      });
    }

    try {
      const companyRef = db().collection("companies").doc(parsedCompany.id);
      const companySnap = await companyRef.get();
      if (!companySnap.exists) return res.status(404).json({ success: false, error: "Firma nije pronađena." });

      const settings = await loadSettingsMain(companyRef);
      if (!isFeatureEnabled(settings)) {
        return res.status(403).json({
          success: false,
          code: "SUPPORT_SESSION_DISABLED",
          error: "Support session nije uključen za ovu firmu (feature flag)."
        });
      }

      const existing = await findActiveSession(companyRef);
      if (existing) {
        return res.status(409).json({
          success: false,
          code: "SUPPORT_SESSION_ACTIVE",
          error: "Već postoji aktivna support sesija. Završite je pre nove.",
          session: publicSessionView(existing.data, existing.id)
        });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + SUPPORT_TTL_MS);
      const sessionId = newSupportSessionId();
      const reason = body.data.reason.trim();
      const sessionDoc = {
        status: "active",
        category: body.data.category,
        reason,
        scope: "read_only",
        startedAt: admin().firestore.Timestamp.fromDate(now),
        expiresAt: admin().firestore.Timestamp.fromDate(expiresAt),
        startedByUid: req.adminUser.uid,
        endedAt: null,
        endedByUid: null,
        endedByRole: null
      };

      const batch = db().batch();
      batch.set(companyRef.collection("support_sessions").doc(sessionId), sessionDoc);
      batch.set(companyRef.collection("settings").doc("support"), {
        active: true,
        sessionId,
        expiresAt: admin().firestore.Timestamp.fromDate(expiresAt),
        category: body.data.category,
        reasonPreview: reason.slice(0, 80),
        startedByUid: req.adminUser.uid,
        updatedAt: admin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      await batch.commit();

      await logAudit(parsedCompany.id, req.adminUser.uid, "support_session_started", {
        sessionId,
        category: body.data.category,
        reasonPreview: reason.slice(0, 80),
        expiresAt: expiresAt.toISOString(),
        scope: "read_only"
      }, { actorRole: "superadmin", source: "server" });

      return res.status(201).json({
        success: true,
        session: publicSessionView(sessionDoc, sessionId)
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Support session start failed");
      return res.status(500).json({ success: false, error: "Support sesija nije pokrenuta." });
    }
  }

  async function getActiveSupportSessionAdmin(req, res) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    const parsedCompany = parseCompanyParam(req.params.companyId);
    if (!parsedCompany.ok) return res.status(400).json({ success: false, error: parsedCompany.error });
    try {
      const companyRef = db().collection("companies").doc(parsedCompany.id);
      const active = await findActiveSession(companyRef);
      return res.json({
        success: true,
        session: active ? publicSessionView(active.data, active.id) : null
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "Support session get failed");
      return res.status(500).json({ success: false, error: "Status support sesije nije dostupan." });
    }
  }

  async function endSupportSessionAdmin(req, res) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) return res.status(400).json({ success: false, error: "Nedostaje sessionId." });
    const companyParsed = parseCompanyParam(req.body?.companyId || req.query?.companyId);
    if (!companyParsed.ok) {
      return res.status(400).json({ success: false, error: "companyId je obavezan za završetak sesije." });
    }
    try {
      const companyRef = db().collection("companies").doc(companyParsed.id);
      const sessionRef = companyRef.collection("support_sessions").doc(sessionId);
      const sessionSnap = await sessionRef.get();
      if (!sessionSnap.exists) return res.status(404).json({ success: false, error: "Sesija nije pronađena." });
      const data = sessionSnap.data();
      if (data.status !== "active") {
        return res.status(409).json({ success: false, error: "Sesija nije aktivna." });
      }
      const expiresAt = toDate(data.expiresAt);
      if (expiresAt && expiresAt.getTime() <= Date.now()) {
        await expireSession(companyRef, sessionId, data);
        return res.status(409).json({ success: false, error: "Sesija je istekla." });
      }
      await endSession({
        companyRef,
        sessionId,
        data,
        endedByUid: req.adminUser.uid,
        endedByRole: "superadmin"
      });
      return res.json({ success: true, session: publicSessionView({ ...data, status: "ended" }, sessionId) });
    } catch (error) {
      req.log?.error?.({ err: error }, "Support session end (SA) failed");
      return res.status(500).json({ success: false, error: "Support sesija nije završena." });
    }
  }

  async function getSupportSessionCompanyAdmin(req, res) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    try {
      const companyRef = db().collection("companies").doc(req.staffUser.companyId);
      const active = await findActiveSession(companyRef);
      return res.json({
        success: true,
        session: active ? publicSessionView(active.data, active.id) : null
      });
    } catch (error) {
      req.log?.error?.({ err: error }, "CA support session get failed");
      return res.status(500).json({ success: false, error: "Status support sesije nije dostupan." });
    }
  }

  async function endSupportSessionCompanyAdmin(req, res) {
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    try {
      const companyRef = db().collection("companies").doc(req.staffUser.companyId);
      const active = await findActiveSession(companyRef);
      if (!active) {
        return res.status(404).json({ success: false, error: "Nema aktivne support sesije." });
      }
      await endSession({
        companyRef,
        sessionId: active.id,
        data: active.data,
        endedByUid: req.staffUser.uid,
        endedByRole: "company_admin"
      });
      return res.json({ success: true, session: publicSessionView({ ...active.data, status: "ended" }, active.id) });
    } catch (error) {
      req.log?.error?.({ err: error }, "CA support session end failed");
      return res.status(500).json({ success: false, error: "Support sesija nije završena." });
    }
  }

  return {
    startSupportSession,
    getActiveSupportSessionAdmin,
    endSupportSessionAdmin,
    getSupportSessionCompanyAdmin,
    endSupportSessionCompanyAdmin
  };
}

module.exports = {
  SUPPORT_TTL_MS,
  SUPPORT_CATEGORIES,
  REASON_MIN,
  REASON_MAX,
  startSupportSessionBody,
  newSupportSessionId,
  isFeatureEnabled,
  publicSessionView,
  createSupportSessionHandlers
};
