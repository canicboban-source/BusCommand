/**
 * SMS provider adapter. Production stays closed until a real provider is chosen.
 * Stub accepts plaintext OTP for the delivery contract but never logs or returns it.
 */
const crypto = require("crypto");

function createSmsProvider({ env = process.env } = {}) {
  const configured = String(env.SMS_PROVIDER || "").trim().toLowerCase();
  const mode = configured || (env.NODE_ENV === "production" ? "none" : "stub");

  return {
    mode,
    async sendActivationSms({ phone, companyId, driverId, portalUrl, otp, code }) {
      const hasPhone = Boolean(phone && String(phone).trim());
      const plaintext = String(otp || code || "").trim();
      const hasOtp = Boolean(plaintext);
      const otpDigits = plaintext.length;
      if (mode === "none") {
        return {
          status: "skipped",
          reason: "provider_not_configured",
          providerMessageId: null
        };
      }
      if (mode === "stub") {
        if (!hasPhone) {
          return {
            status: "stub_no_phone",
            reason: "missing_phone",
            providerMessageId: null
          };
        }
        if (!hasOtp) {
          return {
            status: "error",
            reason: "missing_otp",
            providerMessageId: null
          };
        }
        return {
          status: "stub_queued",
          reason: null,
          providerMessageId: `stub-${crypto.randomUUID()}`,
          meta: {
            companyId,
            driverId,
            portalUrl: portalUrl || "/driver.html",
            phoneLast4: String(phone).replace(/\D/g, "").slice(-4),
            otpDigits
          }
        };
      }
      return {
        status: "error",
        reason: "unknown_provider",
        providerMessageId: null
      };
    },

    async sendShiftConfirmationSms({ phone, companyId, driverId, targetDate, label }) {
      const hasPhone = Boolean(phone && String(phone).trim());
      if (mode === "none") {
        return { status: "skipped", reason: "provider_not_configured", providerMessageId: null };
      }
      if (mode === "stub") {
        if (!hasPhone) {
          return { status: "stub_no_phone", reason: "missing_phone", providerMessageId: null };
        }
        return {
          status: "stub_queued",
          reason: null,
          providerMessageId: `stub-confirm-${crypto.randomUUID()}`,
          meta: {
            companyId,
            driverId,
            targetDate,
            label: label || "next_shift",
            phoneLast4: String(phone).replace(/\D/g, "").slice(-4)
          }
        };
      }
      return { status: "error", reason: "unknown_provider", providerMessageId: null };
    }
  };
}

module.exports = { createSmsProvider };
