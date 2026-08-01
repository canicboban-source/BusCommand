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
  parseCompanyParam
}) {
  function supportMarker(active, values = {}) {
    return {
      active,
      sessionId: active ? values.sessionId : null,
      expiresAt: active ? values.expiresAt : null,
      category: active ? values.category : null,
      reasonPreview: active ? values.reasonPreview : null,
      startedByUid: active ? values.startedByUid : null,
      updatedAt: admin().firestore.FieldValue.serverTimestamp()
    };
  }

  function writeAudit(transaction, companyRef, actorId, action, details, metadata = {}) {
    transaction.set(companyRef.collection("audit_log").doc(), {
      action,
      actorId,
      details,
      actorRole: metadata.actorRole || null,
      actorName: metadata.actorName || null,
      source: metadata.source || "server",
      timestamp: admin().firestore.FieldValue.serverTimestamp()
    });
  }

  async function expireSession(companyRef, sessionId, data, now = new Date()) {
    const sessionRef = companyRef.collection("support_sessions").doc(sessionId);
    const supportRef = companyRef.collection("settings").doc("support");
    return db().runTransaction(async (transaction) => {
      const [sessionSnap, supportSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(supportRef)
      ]);
      if (!sessionSnap.exists || sessionSnap.data().status !== "active") return false;
      const current = sessionSnap.data();
      const expiresAt = toDate(current.expiresAt);
      if (!expiresAt || expiresAt.getTime() > now.getTime()) return false;

      transaction.update(sessionRef, {
        status: "expired",
        endedAt: admin().firestore.Timestamp.fromDate(now),
        endedByUid: "system",
        endedByRole: "system"
      });
      if (supportSnap.exists && supportSnap.data().sessionId === sessionId) {
        transaction.set(supportRef, supportMarker(false), { merge: true });
      }
      writeAudit(transaction, companyRef, "system", "support_session_expired", {
        sessionId,
        category: current.category || data?.category || null
      }, { actorRole: "system", source: "server" });
      return true;
    });
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

  async function endSession({ companyRef, sessionId, endedByUid, endedByRole, now = new Date() }) {
    const sessionRef = companyRef.collection("support_sessions").doc(sessionId);
    const supportRef = companyRef.collection("settings").doc("support");
    return db().runTransaction(async (transaction) => {
      const [sessionSnap, supportSnap] = await Promise.all([
        transaction.get(sessionRef),
        transaction.get(supportRef)
      ]);
      if (!sessionSnap.exists) return { kind: "not_found" };
      const data = sessionSnap.data();
      if (data.status !== "active") return { kind: "not_active", data };

      const expiresAt = toDate(data.expiresAt);
      const expired = expiresAt && expiresAt.getTime() <= now.getTime();
      const status = expired ? "expired" : "ended";
      const actorId = expired ? "system" : endedByUid;
      const actorRole = expired ? "system" : endedByRole;
      transaction.update(sessionRef, {
        status,
        endedAt: admin().firestore.Timestamp.fromDate(now),
        endedByUid: actorId,
        endedByRole: actorRole
      });
      if (supportSnap.exists && supportSnap.data().sessionId === sessionId) {
        transaction.set(supportRef, supportMarker(false), { merge: true });
      }
      writeAudit(
        transaction,
        companyRef,
        actorId,
        expired ? "support_session_expired" : "support_session_ended",
        { sessionId, category: data.category || null, ...(expired ? {} : { endedByRole }) },
        { actorRole, source: "server" }
      );
      return { kind: status, data: { ...data, status, endedAt: now, endedByUid: actorId, endedByRole: actorRole } };
    });
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
      const settingsRef = companyRef.collection("settings").doc("main");
      const supportRef = companyRef.collection("settings").doc("support");
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

      const outcome = await db().runTransaction(async (transaction) => {
        const [companySnap, settingsSnap, supportSnap] = await Promise.all([
          transaction.get(companyRef),
          transaction.get(settingsRef),
          transaction.get(supportRef)
        ]);
        if (!companySnap.exists) return { kind: "company_not_found" };
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        if (!isFeatureEnabled(settings)) return { kind: "disabled" };

        const support = supportSnap.exists ? supportSnap.data() : {};
        const markerExpiresAt = toDate(support.expiresAt);
        const markerActive = support.active === true && Boolean(support.sessionId);
        if (markerActive && (!markerExpiresAt || markerExpiresAt.getTime() > now.getTime())) {
          const activeRef = companyRef.collection("support_sessions").doc(support.sessionId);
          const activeSnap = await transaction.get(activeRef);
          return {
            kind: "active",
            session: activeSnap.exists ? publicSessionView(activeSnap.data(), activeSnap.id) : null
          };
        }

        let expiredSnap = null;
        if (markerActive && markerExpiresAt && markerExpiresAt.getTime() <= now.getTime()) {
          expiredSnap = await transaction.get(
            companyRef.collection("support_sessions").doc(support.sessionId)
          );
        }

        if (expiredSnap?.exists && expiredSnap.data().status === "active") {
          transaction.update(expiredSnap.ref, {
            status: "expired",
            endedAt: admin().firestore.Timestamp.fromDate(now),
            endedByUid: "system",
            endedByRole: "system"
          });
          writeAudit(transaction, companyRef, "system", "support_session_expired", {
            sessionId: expiredSnap.id,
            category: expiredSnap.data().category || null
          }, { actorRole: "system", source: "server" });
        }

        transaction.set(companyRef.collection("support_sessions").doc(sessionId), sessionDoc);
        transaction.set(supportRef, supportMarker(true, {
          sessionId,
          expiresAt: admin().firestore.Timestamp.fromDate(expiresAt),
          category: body.data.category,
          reasonPreview: reason.slice(0, 80),
          startedByUid: req.adminUser.uid
        }), { merge: true });
        writeAudit(transaction, companyRef, req.adminUser.uid, "support_session_started", {
          sessionId,
          category: body.data.category,
          reasonPreview: reason.slice(0, 80),
          expiresAt: expiresAt.toISOString(),
          scope: "read_only"
        }, { actorRole: "superadmin", source: "server" });
        return { kind: "created" };
      });

      if (outcome.kind === "company_not_found") {
        return res.status(404).json({ success: false, error: "Firma nije pronađena." });
      }
      if (outcome.kind === "disabled") {
        return res.status(403).json({
          success: false,
          code: "SUPPORT_SESSION_DISABLED",
          error: "Support session nije uključen za ovu firmu (feature flag)."
        });
      }
      if (outcome.kind === "active") {
        return res.status(409).json({
          success: false,
          code: "SUPPORT_SESSION_ACTIVE",
          error: "Već postoji aktivna support sesija. Završite je pre nove.",
          session: outcome.session
        });
      }
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
      const outcome = await endSession({
        companyRef,
        sessionId,
        endedByUid: req.adminUser.uid,
        endedByRole: "superadmin"
      });
      if (outcome.kind === "not_found") {
        return res.status(404).json({ success: false, error: "Sesija nije pronađena." });
      }
      if (outcome.kind === "not_active") {
        return res.status(409).json({ success: false, error: "Sesija nije aktivna." });
      }
      if (outcome.kind === "expired") {
        return res.status(409).json({ success: false, error: "Sesija je istekla." });
      }
      return res.json({ success: true, session: publicSessionView(outcome.data, sessionId) });
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
      const outcome = await endSession({
        companyRef,
        sessionId: active.id,
        endedByUid: req.staffUser.uid,
        endedByRole: "company_admin"
      });
      if (outcome.kind === "not_found") {
        return res.status(404).json({ success: false, error: "Nema aktivne support sesije." });
      }
      if (outcome.kind === "not_active" || outcome.kind === "expired") {
        return res.status(409).json({ success: false, error: "Support sesija više nije aktivna." });
      }
      return res.json({ success: true, session: publicSessionView(outcome.data, active.id) });
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
