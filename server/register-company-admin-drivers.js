"use strict";

/**
 * Production Company Admin driver create/list HTTP routes (D24.1.1).
 * Mounted by api-server and executable tests — same handlers.
 */

const { createManualCompanyDriver, listCompanyDriversForAdmin } = require("./company-admin-driver-ops");

function registerCompanyAdminDriverRoutes(app, deps) {
  const {
    rateLimit,
    requireCompanyAdmin,
    requireOwnCompany,
    validateBody,
    companyDriverCreateBody,
    db,
    FieldValue,
    bcryptHash,
    randomUUID,
    logAudit,
    generateActivationOtp,
    activationExpiresAt,
    smsProvider
  } = deps;

  app.post(
    "/api/company-admin/drivers",
    rateLimit(8, 5 * 60 * 1000),
    requireCompanyAdmin,
    validateBody(companyDriverCreateBody),
    async (req, res) => {
      const companyId = requireOwnCompany(req, res);
      if (!companyId) return;
      const body = req.validatedBody;
      try {
        const otp = generateActivationOtp();
        const created = await createManualCompanyDriver({
          db,
          FieldValue,
          randomUUID,
          companyId,
          body,
          activationCodeHash: await bcryptHash(otp, 12),
          activationExpiresAt: activationExpiresAt().toISOString()
        });

        const sms = await smsProvider.sendActivationSms({
          phone: body.phone,
          companyId,
          driverId: created.driverId,
          portalUrl: `/driver.html?company=${encodeURIComponent(companyId)}`,
          otp
        });

        await logAudit(companyId, req.staffUser.uid, "driver_manual_created", {
          driverId: created.driverId,
          groupId: body.groupId,
          knownGroupCount: (created.driver.knownGroupIds || []).length,
          codeActivated: false,
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
          driver: created.driver,
          activation: {
            otpTtlHours: 24,
            smsProvider: smsProvider.mode,
            smsStatus: sms.status
          },
          message: "Vozač je kreiran. Aktivacioni kod je prosleđen SMS servisu."
        });
      } catch (err) {
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
          // Do not echo the colliding EID or any driverId.
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
        req.log?.error({ err }, "company-admin manual driver create failed");
        return res.status(500).json({ success: false, error: "Vozač nije kreiran." });
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
