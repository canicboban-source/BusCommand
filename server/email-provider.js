/**
 * Email provider adapter — per-tenant SMTP.
 * Modes: stub (local/dev, logs but does not send), smtp (production, uses nodemailer).
 * SMTP credentials are stored per-tenant in Firestore settings/main.emailSmtp.
 * BusCommand never sends from its own address — the company's SMTP server is the sender.
 */
"use strict";

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch {
  /* nodemailer not installed in test harness — stub mode only */
}

function isStubMode(env) {
  if (String(env.BUSCOMMAND_QA_HARNESS || "").trim() === "1") return true;
  if (String(env.BUSCOMMAND_FORCE_EMAIL_STUB || "").trim() === "1") return true;
  if (String(env.PLAYWRIGHT_TEST || env.PW_TEST || "").trim()) return true;
  return false;
}

/**
 * Build a nodemailer transport from tenant SMTP settings.
 * @param {object} smtp - { host, port, user, pass, from }
 * @returns {object|null} nodemailer transport or null if not configured
 */
function createTransport(smtp) {
  if (!nodemailer) return null;
  const host = String(smtp?.host || "").trim();
  const port = Number(smtp?.port) || 587;
  const user = String(smtp?.user || "").trim();
  const pass = String(smtp?.pass || "").trim();
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 8000,
    socketTimeout: 15000
  });
}

/**
 * Send an email via the tenant's SMTP server.
 * @param {object} params - { smtp, to, subject, text, html, env }
 * @returns {Promise<{status: string, messageId?: string, error?: string}>}
 */
async function sendEmail({ smtp, to, subject, text, html, env = process.env }) {
  const recipient = String(to || "").trim();
  if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
    return { status: "invalid_recipient" };
  }
  const from = String(smtp?.from || "").trim();
  if (!from) {
    return { status: "no_from_address" };
  }

  if (isStubMode(env)) {
    // Log only — never send in test/harness mode
    return {
      status: "stub_sent",
      messageId: `stub-${Date.now()}`,
      to: recipient,
      from,
      subject: String(subject || "").slice(0, 80)
    };
  }

  const transport = createTransport(smtp);
  if (!transport) {
    return { status: "no_transport" };
  }

  try {
    const info = await transport.sendMail({
      from,
      to: recipient,
      subject: String(subject || "").slice(0, 200),
      text: String(text || ""),
      html: html || undefined
    });
    return { status: "sent", messageId: info.messageId };
  } catch (err) {
    return { status: "error", error: String(err.message || err).slice(0, 300) };
  }
}

/**
 * Build a shift confirmation email body.
 * @param {object} params - { driverName, targetDate, shiftLabel, startTime, endTime, busNumber, companyName }
 * @param {string} lang - "en", "de", "sr"
 * @returns {{subject: string, text: string, html: string}}
 */
function buildShiftConfirmationEmail({ driverName, targetDate, shiftLabel, startTime, endTime, busNumber, companyName }, lang = "en") {
  const labels = {
    en: {
      subject: `Shift confirmation — ${targetDate}`,
      greeting: `Hello ${driverName},`,
      body: `Your shift for ${targetDate} has been published:`,
      shift: `Shift: ${shiftLabel}`,
      time: `Time: ${startTime || "—"} – ${endTime || "—"}`,
      bus: `Bus: ${busNumber || "—"}`,
      action: `Please confirm your shift in the BusCommand Driver App.`,
      footer: `— ${companyName || "BusCommand"}`
    },
    de: {
      subject: `Schichtbestätigung — ${targetDate}`,
      greeting: `Hallo ${driverName},`,
      body: `Ihre Schicht für ${targetDate} wurde veröffentlicht:`,
      shift: `Schicht: ${shiftLabel}`,
      time: `Zeit: ${startTime || "—"} – ${endTime || "—"}`,
      bus: `Bus: ${busNumber || "—"}`,
      action: `Bitte bestätigen Sie Ihre Schicht in der BusCommand Driver App.`,
      footer: `— ${companyName || "BusCommand"}`
    },
    sr: {
      subject: `Potvrda smene — ${targetDate}`,
      greeting: `Zdravo ${driverName},`,
      body: `Vaša smena za ${targetDate} je objavljena:`,
      shift: `Smena: ${shiftLabel}`,
      time: `Vreme: ${startTime || "—"} – ${endTime || "—"}`,
      bus: `Autobus: ${busNumber || "—"}`,
      action: `Molimo potvrdite smenu u BusCommand Driver aplikaciji.`,
      footer: `— ${companyName || "BusCommand"}`
    }
  };
  const l = labels[lang] || labels.en;
  const text = `${l.greeting}\n\n${l.body}\n${l.shift}\n${l.time}\n${l.bus}\n\n${l.action}\n\n${l.footer}`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
    <h2 style="color:#1e293b;margin:0 0 16px;">${l.subject}</h2>
    <p>${l.greeting}</p>
    <p>${l.body}</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr><td style="padding:4px 0;color:#64748b;">${l.shift.split(":")[0]}:</td><td style="padding:4px 0;font-weight:600;">${shiftLabel || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">${l.time.split(":")[0]}:</td><td style="padding:4px 0;font-weight:600;">${startTime || "—"} – ${endTime || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#64748b;">${l.bus.split(":")[0]}:</td><td style="padding:4px 0;font-weight:600;">${busNumber || "—"}</td></tr>
    </table>
    <p style="background:#f1f5f9;padding:12px;border-radius:8px;">${l.action}</p>
    <p style="color:#94a3b8;font-size:0.85rem;margin-top:24px;">${l.footer}</p>
  </div>`;
  return { subject: l.subject, text, html };
}

/**
 * Build a compliance expiry warning email.
 * @param {object} params - { driverName, fieldName, expiryDate, daysLeft, companyName }
 * @param {string} lang
 */
function buildExpiryWarningEmail({ driverName, fieldName, expiryDate, daysLeft, companyName }, lang = "en") {
  const labels = {
    en: {
      subject: daysLeft <= 0 ? `URGENT: ${fieldName} expired` : `${fieldName} expires in ${daysLeft} days`,
      greeting: `Hello ${driverName},`,
      body: daysLeft <= 0
        ? `Your ${fieldName} has expired on ${expiryDate}.`
        : `Your ${fieldName} expires on ${expiryDate} (${daysLeft} days left).`,
      action: `Please renew it as soon as possible and inform your company admin.`,
      footer: `— ${companyName || "BusCommand"}`
    },
    de: {
      subject: daysLeft <= 0 ? `DRINGEND: ${fieldName} abgelaufen` : `${fieldName} läuft in ${daysLeft} Tagen ab`,
      greeting: `Hallo ${driverName},`,
      body: daysLeft <= 0
        ? `Ihr ${fieldName} ist am ${expiryDate} abgelaufen.`
        : `Ihr ${fieldName} läuft am ${expiryDate} ab (${daysLeft} Tage verbleibend).`,
      action: `Bitte erneuern Sie es so bald wie möglich und informieren Sie Ihren Administrator.`,
      footer: `— ${companyName || "BusCommand"}`
    },
    sr: {
      subject: daysLeft <= 0 ? `HitNO: ${fieldName} istekao` : `${fieldName} ističe za ${daysLeft} dana`,
      greeting: `Zdravo ${driverName},`,
      body: daysLeft <= 0
        ? `Vaš ${fieldName} je istekao ${expiryDate}.`
        : `Vaš ${fieldName} ističe ${expiryDate} (preostalo ${daysLeft} dana).`,
      action: `Molimo obnovite ga što pre i obavestite administratora firme.`,
      footer: `— ${companyName || "BusCommand"}`
    }
  };
  const l = labels[lang] || labels.en;
  const text = `${l.greeting}\n\n${l.body}\n\n${l.action}\n\n${l.footer}`;
  const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
    <h2 style="color:${daysLeft <= 0 ? "#dc2626" : "#f59e0b"};margin:0 0 16px;">${l.subject}</h2>
    <p>${l.greeting}</p>
    <p>${l.body}</p>
    <p style="background:${daysLeft <= 0 ? "#fef2f2" : "#fffbeb"};padding:12px;border-radius:8px;">${l.action}</p>
    <p style="color:#94a3b8;font-size:0.85rem;margin-top:24px;">${l.footer}</p>
  </div>`;
  return { subject: l.subject, text, html };
}

module.exports = {
  sendEmail,
  createTransport,
  buildShiftConfirmationEmail,
  buildExpiryWarningEmail,
  isStubMode
};
