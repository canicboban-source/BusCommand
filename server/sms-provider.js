/**
 * SMS provider adapter.
 * Modes: stub (local/dev), none (prod default), twilio, seven (HTTP REST, no SDK).
 * Never logs or returns plaintext OTP.
 */
const crypto = require("crypto");

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  else if (!digits.startsWith("+")) digits = `+${digits.replace(/\D/g, "")}`;
  // E.164: + and 8–15 digits total country+subscriber (ITU-T E.164).
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) return "";
  return digits;
}

function forceStubProvider(env) {
  // Unit tests may exercise seven/twilio with a mocked fetch; only block live paths in harness/E2E.
  if (String(env.BUSCOMMAND_QA_HARNESS || "").trim() === "1") return true;
  if (String(env.BUSCOMMAND_FORCE_SMS_STUB || "").trim() === "1") return true;
  if (String(env.PLAYWRIGHT_TEST || env.PW_TEST || "").trim()) return true;
  return false;
}

function absolutePortalUrl(portalUrl, env) {
  const pathOrUrl = String(portalUrl || "/driver.html").trim() || "/driver.html";
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = String(env.APP_PUBLIC_URL || env.BUSCOMMAND_PUBLIC_URL || "https://www.buscommand.com")
    .trim()
    .replace(/\/$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function phoneMeta(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.slice(-4);
}

function activationBody(plaintext, portalUrl, env) {
  const link = absolutePortalUrl(portalUrl, env);
  return (
    `BusCommand aktivacioni kod: ${plaintext}. ` +
    `Otvori: ${link} ` +
    `Kod vazi 24h.`
  );
}

async function twilioSend({ env, to, body, fetchImpl }) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN || "").trim();
  const from = normalizePhone(env.TWILIO_FROM_NUMBER || env.TWILIO_PHONE_NUMBER || "");
  const toNorm = normalizePhone(to);
  if (!accountSid || !authToken || !from) {
    return { status: "error", reason: "missing_twilio_credentials", providerMessageId: null };
  }
  if (!toNorm) {
    return { status: "error", reason: "missing_phone", providerMessageId: null };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams({ To: toNorm, From: from, Body: body });
  const doFetch = fetchImpl || fetch;

  let res;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
  } catch {
    return { status: "error", reason: "twilio_network_error", providerMessageId: null };
  }

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok) {
    const code = payload.code != null ? String(payload.code) : String(res.status);
    const reason = code === "572006"
      ? "twilio_trial_requires_upgrade_for_custom_body"
      : `twilio_${code}`;
    return {
      status: "error",
      reason,
      providerMessageId: payload.sid || null
    };
  }

  return {
    status: "sent",
    reason: null,
    providerMessageId: payload.sid || null
  };
}

async function sevenSend({ env, to, body, fetchImpl }) {
  const apiKey = String(env.SEVEN_API_KEY || env.SEVEN_IO_API_KEY || "").trim();
  // AT/RS often reject unregistered alphanumeric senders (e.g. BusCommand → REJECTED).
  const from = String(env.SEVEN_FROM || env.SEVEN_SENDER || "SMS").trim() || "SMS";
  const toNorm = normalizePhone(to);
  if (!apiKey) {
    return { status: "error", reason: "missing_seven_credentials", providerMessageId: null };
  }
  if (!toNorm) {
    return { status: "error", reason: "missing_phone", providerMessageId: null };
  }

  const doFetch = fetchImpl || fetch;
  const form = new URLSearchParams({
    to: toNorm,
    text: body,
    from,
    json: "1"
  });

  let res;
  try {
    res = await doFetch("https://gateway.seven.io/api/sms", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });
  } catch {
    return { status: "error", reason: "seven_network_error", providerMessageId: null };
  }

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  // seven.io: success often 100; also may return { success: "100", messages: [...] }
  const successCode = payload.success != null ? String(payload.success) : "";
  const msgId =
    payload.messages?.[0]?.id ||
    payload.msg_id ||
    payload.id ||
    null;

  if (!res.ok || (successCode && successCode !== "100" && successCode !== "0")) {
    const code = successCode || (payload.code != null ? String(payload.code) : String(res.status));
    return {
      status: "error",
      reason: `seven_${code}`,
      providerMessageId: msgId ? String(msgId) : null
    };
  }

  return {
    status: "sent",
    reason: null,
    providerMessageId: msgId ? String(msgId) : null
  };
}

async function dispatchSms(mode, { env, to, body, fetchImpl }) {
  if (mode === "twilio") return twilioSend({ env, to, body, fetchImpl });
  if (mode === "seven" || mode === "seven.io" || mode === "sms77") {
    return sevenSend({ env, to, body, fetchImpl });
  }
  return { status: "error", reason: "unknown_provider", providerMessageId: null };
}

function createSmsProvider({ env = process.env, fetchImpl } = {}) {
  const configured = String(env.SMS_PROVIDER || "").trim().toLowerCase();
  let mode = configured || (env.NODE_ENV === "production" ? "none" : "stub");
  // Automated tests / QA harness never hit live SMS (seven/twilio).
  if (forceStubProvider(env) && mode !== "none") mode = "stub";
  const normalizedMode =
    mode === "seven.io" || mode === "sms77" ? "seven" : mode;

  return {
    mode: normalizedMode,
    async sendActivationSms({ phone, companyId, driverId, portalUrl, otp, code }) {
      const hasPhone = Boolean(phone && String(phone).trim());
      const plaintext = String(otp || code || "").trim();
      const hasOtp = Boolean(plaintext);
      const otpDigits = plaintext.length;

      if (normalizedMode === "none") {
        return {
          status: "skipped",
          reason: "provider_not_configured",
          providerMessageId: null
        };
      }

      if (normalizedMode === "stub") {
        if (!hasPhone) {
          return { status: "stub_no_phone", reason: "missing_phone", providerMessageId: null };
        }
        if (!hasOtp) {
          return { status: "error", reason: "missing_otp", providerMessageId: null };
        }
        return {
          status: "stub_queued",
          reason: null,
          providerMessageId: `stub-${crypto.randomUUID()}`,
          meta: {
            companyId,
            driverId,
            portalUrl: portalUrl || "/driver.html",
            phoneLast4: phoneMeta(phone),
            otpDigits
          }
        };
      }

      if (normalizedMode === "twilio" || normalizedMode === "seven") {
        if (!hasPhone) {
          return { status: "error", reason: "missing_phone", providerMessageId: null };
        }
        if (!hasOtp) {
          return { status: "error", reason: "missing_otp", providerMessageId: null };
        }
        const body = activationBody(plaintext, portalUrl, env);
        const result = await dispatchSms(normalizedMode, {
          env,
          to: phone,
          body,
          fetchImpl
        });
        return {
          ...result,
          meta: {
            companyId,
            driverId,
            phoneLast4: phoneMeta(phone),
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
      if (normalizedMode === "none") {
        return { status: "skipped", reason: "provider_not_configured", providerMessageId: null };
      }
      if (normalizedMode === "stub") {
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
            phoneLast4: phoneMeta(phone)
          }
        };
      }
      if (normalizedMode === "twilio" || normalizedMode === "seven") {
        if (!hasPhone) {
          return { status: "error", reason: "missing_phone", providerMessageId: null };
        }
        const datePart = targetDate ? ` za ${targetDate}` : "";
        const body = `BusCommand: potvrdi smenu${datePart}. Otvori driver aplikaciju.`;
        const result = await dispatchSms(normalizedMode, {
          env,
          to: phone,
          body,
          fetchImpl
        });
        return {
          ...result,
          meta: {
            companyId,
            driverId,
            targetDate,
            label: label || "next_shift",
            phoneLast4: phoneMeta(phone)
          }
        };
      }
      return { status: "error", reason: "unknown_provider", providerMessageId: null };
    }
  };
}

module.exports = { createSmsProvider, normalizePhone, absolutePortalUrl };
