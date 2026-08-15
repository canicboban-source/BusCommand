/**
 * Poglavlje 6 — shift confirmation scheduler (enqueue + dispatch).
 * Feature flag: companies/{id}/settings/main.features.shiftConfirmationScheduler (default false).
 * Delivery stays in-app / SMS stub until a real provider is chosen.
 */
const {
  outboxDocId,
  confirmationDocId,
  buildOutboxEntries,
  planOutboxUpsert,
  planInvalidateOutbox,
  planDispatchAttempt,
  shouldRetry
} = require("./confirmation-outbox");
const { createSmsProvider } = require("./sms-provider");

function isSchedulerEnabled(settingsMain) {
  return settingsMain?.features?.shiftConfirmationScheduler === true;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  const { timingSafeEqual } = require("crypto");
  return timingSafeEqual(left, right);
}

function createConfirmationScheduler({
  db,
  admin,
  hasFirebase,
  logAudit,
  env = process.env,
  smsProvider = null
}) {
  const sms = smsProvider || createSmsProvider({ env });

  async function loadSettingsMain(companyRef) {
    const snap = await companyRef.collection("settings").doc("main").get();
    return snap.exists ? snap.data() : {};
  }

  async function enqueueFromPolicy({ companyId, driverId, policy, now = new Date() }) {
    if (!policy || policy.status !== "active" || !policy.confirmationTargets?.length) {
      return { enqueued: 0, skipped: 0 };
    }
    const companyRef = db().collection("companies").doc(companyId);
    const settings = await loadSettingsMain(companyRef);
    if (!isSchedulerEnabled(settings)) {
      return { enqueued: 0, skipped: 0, disabled: true };
    }

    const entries = buildOutboxEntries({
      companyId,
      driverId,
      sourceShiftDate: policy.shift.date,
      timezone: policy.timezone,
      targets: policy.confirmationTargets,
      now
    });

    let enqueued = 0;
    let skipped = 0;
    const batch = db().batch();
    for (const entry of entries) {
      const ref = companyRef.collection("confirmation_outbox").doc(outboxDocId(driverId, entry.targetDate));
      const snap = await ref.get();
      const existing = snap.exists ? snap.data() : null;
      const plan = planOutboxUpsert(existing, entry, now);
      if (plan.action === "skip") {
        skipped += 1;
        continue;
      }
      batch.set(ref, {
        ...plan.patch,
        createdAtServer: existing?.createdAtServer || admin().firestore.FieldValue.serverTimestamp(),
        updatedAtServer: admin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      enqueued += 1;
    }
    if (enqueued) await batch.commit();
    return { enqueued, skipped };
  }

  async function markConfirmed({ companyId, driverId, dates = [], fingerprints = {} }) {
    if (!dates.length) return;
    const companyRef = db().collection("companies").doc(companyId);
    const batch = db().batch();
    const nowIso = new Date().toISOString();
    for (const date of dates) {
      const ref = companyRef.collection("confirmation_outbox").doc(outboxDocId(driverId, date));
      batch.set(ref, {
        status: "confirmed",
        confirmedAt: nowIso,
        fingerprint: fingerprints[date] || null,
        updatedAt: nowIso,
        updatedAtServer: admin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    }
    await batch.commit();
  }

  /**
   * Staff mutate / resolve: delete shift_confirmations and cancel outbox rows
   * for the affected (driverId, date) pairs so UI cannot show a stale confirm.
   * Re-enqueue happens on the next active work-session when the scheduler flag
   * is on (enqueueFromPolicy).
   */
  async function invalidateShiftConfirmations({
    companyId,
    entries = [],
    reason = "plan_changed",
    now = new Date()
  } = {}) {
    if (!hasFirebase() || !companyId || !entries.length) {
      return { cancelled: 0, deletedConfirmations: 0 };
    }
    const companyRef = db().collection("companies").doc(companyId);
    const unique = new Map();
    for (const entry of entries) {
      const driverId = String(entry?.driverId || "").trim();
      const date = String(entry?.date || entry?.targetDate || "").slice(0, 10);
      if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      unique.set(`${driverId}|${date}`, { driverId, date });
    }
    if (!unique.size) return { cancelled: 0, deletedConfirmations: 0 };

    const pairs = [...unique.values()];
    const outboxRefs = pairs.map((row) =>
      companyRef.collection("confirmation_outbox").doc(outboxDocId(row.driverId, row.date))
    );
    const confirmRefs = pairs.map((row) =>
      companyRef.collection("shift_confirmations").doc(confirmationDocId(row.driverId, row.date))
    );
    const [outboxSnaps, confirmSnaps] = await Promise.all([
      db().getAll(...outboxRefs),
      db().getAll(...confirmRefs)
    ]);

    const batch = db().batch();
    let cancelled = 0;
    let deletedConfirmations = 0;
    outboxSnaps.forEach((snap) => {
      if (!snap.exists) return;
      const plan = planInvalidateOutbox(snap.data(), reason, now);
      if (plan.action === "skip") return;
      batch.set(snap.ref, {
        ...plan.patch,
        updatedAtServer: admin().firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      cancelled += 1;
    });
    confirmSnaps.forEach((snap) => {
      if (!snap.exists) return;
      batch.delete(snap.ref);
      deletedConfirmations += 1;
    });
    if (cancelled || deletedConfirmations) await batch.commit();

    if (logAudit && (cancelled || deletedConfirmations)) {
      await logAudit(companyId, "system", "shift_confirmations_invalidated", {
        reason: String(reason).slice(0, 120),
        cancelled,
        deletedConfirmations,
        entries: pairs.slice(0, 40)
      }).catch(() => {});
    }
    return { cancelled, deletedConfirmations, entries: pairs.length };
  }

  async function deliverOne(doc, data, now = new Date()) {
    // In-app is always the primary channel; SMS stub only when phone present and provider not none.
    const channel = "in_app";
    let smsResult = null;
    if (sms.mode !== "none" && typeof sms.sendShiftConfirmationSms === "function" && data.phone) {
      smsResult = await sms.sendShiftConfirmationSms({
        phone: data.phone,
        companyId: data.companyId,
        driverId: data.driverId,
        targetDate: data.targetDate,
        label: data.label
      });
    }
    const ok = true; // in-app delivery = outbox visible on next work-session
    const patch = planDispatchAttempt(data, {
      ok,
      channel: smsResult?.status === "stub_queued" ? "in_app+sms_stub" : channel
    }, now);
    await doc.ref.set({
      ...patch,
      smsStatus: smsResult?.status || null,
      updatedAtServer: admin().firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return patch;
  }

  async function writeDispatchHealth(companyRef, patch, now = new Date()) {
    await companyRef.collection("ops").doc("confirmation_dispatch").set({
      ...patch,
      lastRunAt: now.toISOString(),
      updatedAt: now.toISOString(),
      updatedAtServer: admin().firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async function dispatchCompany(companyId, { limit = 50, now = new Date() } = {}) {
    const companyRef = db().collection("companies").doc(companyId);
    const settings = await loadSettingsMain(companyRef);
    if (!isSchedulerEnabled(settings)) {
      await writeDispatchHealth(companyRef, {
        schedulerEnabled: false,
        processed: 0,
        delivered: 0,
        failed: 0,
        skippedInactiveSession: 0,
        skippedRetryWindow: 0
      }, now);
      return { companyId, processed: 0, delivered: 0, failed: 0, disabled: true };
    }

    const snap = await companyRef.collection("confirmation_outbox")
      .where("status", "in", ["pending", "failed"])
      .limit(Math.min(100, Math.max(1, limit)))
      .get();

    let processed = 0;
    let delivered = 0;
    let failed = 0;
    let terminalFailed = 0;
    let skippedInactiveSession = 0;
    let skippedRetryWindow = 0;
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.status === "failed" && !shouldRetry(data, now)) {
        skippedRetryWindow += 1;
        if (data.terminalFailure === true) terminalFailed += 1;
        continue;
      }
      // Only deliver while driver session is still active (last previous shift window)
      const sessionSnap = await companyRef.collection("driver_sessions").doc(data.driverId).get();
      if (!sessionSnap.exists || sessionSnap.data().status !== "active") {
        skippedInactiveSession += 1;
        continue;
      }
      const result = await deliverOne(doc, { ...data, companyId }, now);
      processed += 1;
      if (result.status === "delivered") delivered += 1;
      else {
        failed += 1;
        if (result.terminalFailure === true) terminalFailed += 1;
      }
    }

    await writeDispatchHealth(companyRef, {
      schedulerEnabled: true,
      processed,
      delivered,
      failed,
      terminalFailed,
      skippedInactiveSession,
      skippedRetryWindow,
      scanned: snap.size
    }, now);

    return {
      companyId,
      processed,
      delivered,
      failed,
      terminalFailed,
      skippedInactiveSession,
      skippedRetryWindow,
      scanned: snap.size
    };
  }

  async function dispatchAll({ companyIds = null, limitPerCompany = 50, now = new Date() } = {}) {
    if (!hasFirebase()) return { success: false, error: "firebase_unavailable", results: [] };
    let ids = companyIds;
    if (!ids) {
      const companies = await db().collection("companies").limit(100).get();
      ids = companies.docs.map((doc) => doc.id);
    }
    const results = [];
    for (const companyId of ids) {
      results.push(await dispatchCompany(companyId, { limit: limitPerCompany, now }));
    }
    if (logAudit) {
      await logAudit("system", "confirmation_scheduler", "confirmation_dispatch_run", {
        companies: results.length,
        processed: results.reduce((sum, row) => sum + (row.processed || 0), 0),
        delivered: results.reduce((sum, row) => sum + (row.delivered || 0), 0),
        failed: results.reduce((sum, row) => sum + (row.failed || 0), 0),
        disabled: results.filter((row) => row.disabled).length,
        skippedInactiveSession: results.reduce((sum, row) => sum + (row.skippedInactiveSession || 0), 0)
      });
    }
    return { success: true, results };
  }

  function registerRoutes(app, { rateLimit }) {
    app.post("/api/internal/jobs/confirmation-dispatch", rateLimit(10, 60_000), async (req, res) => {
      const secret = env.CONFIRMATION_JOB_SECRET || env.CRON_SECRET || "";
      const header = String(req.headers["x-job-secret"] || req.headers.authorization?.replace(/^Bearer\s+/i, "") || "");
      if (!secret || !timingSafeEqualString(header, secret)) {
        return res.status(401).json({ success: false, error: "Nevažeći job secret." });
      }
      if (!hasFirebase()) {
        return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
      }
      try {
        const body = req.body || {};
        const companyIds = Array.isArray(body.companyIds) ? body.companyIds.map(String).slice(0, 50) : null;
        const result = await dispatchAll({
          companyIds,
          limitPerCompany: Number(body.limitPerCompany) || 50
        });
        return res.json(result);
      } catch (error) {
        req.log?.error?.({ err: error }, "Confirmation dispatch failed");
        return res.status(500).json({ success: false, error: "Dispatch nije uspeo." });
      }
    });
  }

  return {
    isSchedulerEnabled,
    enqueueFromPolicy,
    markConfirmed,
    invalidateShiftConfirmations,
    dispatchCompany,
    dispatchAll,
    registerRoutes
  };
}

module.exports = {
  isSchedulerEnabled,
  createConfirmationScheduler
};
