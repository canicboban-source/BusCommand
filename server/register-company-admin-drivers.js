"use strict";

/**
 * Production Company Admin driver create/list/reset HTTP routes (D24.1.1 / FIX-02).
 * Mounted by api-server and executable tests — same handlers.
 */

const {
  createManualCompanyDriver,
  resetCompanyDriverActivation,
  listCompanyDriversForAdmin
} = require("./company-admin-driver-ops");
const {
  generateActivationOtp,
  activationExpiresAt,
  hashSecret
} = require("./driver-activation-otp");
const { createSmsProvider } = require("./sms-provider");

const DRIVER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVATION_HASH_COST = 12;

function smsDeliverySafe(sms) {
  return {
    otpTtlHours: 24,
    smsProvider: sms?.mode || sms?.smsProvider || null,
    smsStatus: sms?.status || "error"
  };
}

async function deliverActivationSms(smsProvider, payload) {
  try {
    const sms = await smsProvider.sendActivationSms(payload);
    if (!sms || typeof sms !== "object") {
      return { status: "error", reason: "invalid_sms_result" };
    }
    return sms;
  } catch {
    return { status: "error", reason: "sms_exception" };
  }
}

function mapCreateError(err, res) {
  if (err?.code === "group-not-found") {
    return res.status(400).json({ success: false, error: err.message || "Grupa nije pronađena." });
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
  return null;
}

function registerCompanyAdminDriverRoutes(app, deps) {
  const {
    rateLimit,
    requireCompanyAdmin,
    requireOwnCompany,
    validateBody,
    companyDriverCreateBody,
    companyDriverResetActivationBody,
    db,
    FieldValue,
    bcryptHash,
    randomUUID,
    logAudit,
    revokeRefreshTokens
  } = deps;
  const smsProvider = deps.smsProvider || createSmsProvider();
  const makeOtp = deps.generateActivationOtp || generateActivationOtp;

  app.post(
    "/api/company-admin/drivers",
    rateLimit(8, 5 * 60 * 1000),
    requireCompanyAdmin,
    validateBody(companyDriverCreateBody),
    async (req, res) => {
      const companyId = requireOwnCompany(req, res);
      if (!companyId) return;
      const body = req.validatedBody;
      let otp = makeOtp();
      try {
        const created = await createManualCompanyDriver({
          db,
          FieldValue,
          bcryptHash,
          randomUUID,
          companyId,
          body,
          actorUid: req.staffUser.uid,
          activation: {
            activationCodeHash: await hashSecret(otp, ACTIVATION_HASH_COST),
            activationExpiresAt: activationExpiresAt().toISOString()
          }
        });

        const sms = await deliverActivationSms(smsProvider, {
          phone: body.phone,
          companyId,
          driverId: created.driverId,
          portalUrl: `/driver.html?company=${encodeURIComponent(companyId)}`,
          otp
        });
        otp = null;

        await logAudit(companyId, req.staffUser.uid, "driver_manual_created", {
          driverId: created.driverId,
          groupId: body.groupId,
          knownGroupCount: (created.driver.knownGroupIds || []).length,
          smsStatus: sms.status,
          smsProvider: smsProvider.mode
        }, {
          actorRole: req.staffUser.role,
          actorName: req.staffUser.name || null
        });

        return res.status(201).json({
          success: true,
          driverId: created.driverId,
          codeActivated: false,
          activation: smsDeliverySafe({ ...sms, mode: smsProvider.mode }),
          driver: created.driver
        });
      } catch (err) {
        otp = null;
        const mapped = mapCreateError(err, res);
        if (mapped) return mapped;
        req.log?.error({ err }, "company-admin manual driver create failed");
        return res.status(500).json({ success: false, error: "Vozač nije kreiran." });
      }
    }
  );

  app.post(
    "/api/company-admin/drivers/:driverId/reset-activation",
    rateLimit(8, 10 * 60 * 1000),
    requireCompanyAdmin,
    validateBody(companyDriverResetActivationBody),
    async (req, res) => {
      const companyId = requireOwnCompany(req, res);
      if (!companyId) return;
      const driverId = String(req.params.driverId || "").trim();
      if (!DRIVER_ID_RE.test(driverId)) {
        return res.status(400).json({ success: false, error: "Nevažeći vozač." });
      }
      let otp = null;
      try {
        const reset = await resetCompanyDriverActivation({
          db,
          FieldValue,
          companyId,
          driverId,
          generateOtp: makeOtp
        });
        otp = reset.otp;

        if (typeof revokeRefreshTokens === "function") {
          try {
            await revokeRefreshTokens(driverId);
          } catch (revokeErr) {
            req.log?.warn?.({ err: revokeErr, driverId }, "Revoke after CA activation reset failed");
          }
        }

        const sms = await deliverActivationSms(smsProvider, {
          phone: reset.phone,
          companyId,
          driverId,
          portalUrl: `/driver.html?company=${encodeURIComponent(companyId)}`,
          otp
        });
        otp = null;

        await logAudit(companyId, req.staffUser.uid, "driver_activation_reset_requested", {
          driverId,
          smsStatus: sms.status,
          smsProvider: smsProvider.mode
        }, {
          actorRole: req.staffUser.role,
          actorName: req.staffUser.name || null
        });

        return res.json({
          success: true,
          driverId,
          codeActivated: false,
          activation: smsDeliverySafe({ ...sms, mode: smsProvider.mode })
        });
      } catch (err) {
        otp = null;
        if (err?.code === "not-found") {
          return res.status(404).json({ success: false, error: "Vozač nije pronađen." });
        }
        req.log?.error({ err }, "company-admin driver activation reset failed");
        return res.status(500).json({ success: false, error: "Aktivacioni kod nije mogao biti poslat." });
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
        const listed = await listCompanyDriversForAdmin({ db, companyId });
        return res.json({
          success: true,
          drivers: listed.drivers,
          legacyCredentialProfiles: listed.legacyCredentialProfiles || []
        });
      } catch (err) {
        req.log?.error({ err }, "company-admin drivers list failed");
        return res.status(500).json({ success: false, error: "Lista vozača nije učitana." });
      }
    }
  );
}

module.exports = { registerCompanyAdminDriverRoutes };
