/**
 * BusCommand — Pilot Request Email Service
 * Securely delivers 30-day pilot applications to info@buscommand.com.
 * Supports explicit dependency-injected transport for tests and production SMTP via nodemailer.
 */
'use strict';

let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch {
  /* nodemailer not installed in some minimal test harnesses */
}

const TARGET_EMAIL = 'info@buscommand.com';
let _injectedTransport = null;

function setPlatformTransport(transport) {
  _injectedTransport = transport;
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function sanitizeHeader(str) {
  if (str == null) return '';
  return String(str).replace(/[\r\n]+/g, ' ').trim();
}

function isPlatformSmtpConfigured(env = process.env) {
  const host = (env.PLATFORM_SMTP_HOST || '').trim();
  const user = (env.PLATFORM_SMTP_USER || '').trim();
  const pass = (env.PLATFORM_SMTP_PASS || '').trim();
  return Boolean(host && user && pass);
}

function createPlatformTransport(env = process.env) {
  if (!nodemailer) return null;
  const host = (env.PLATFORM_SMTP_HOST || '').trim();
  const port = Number(env.PLATFORM_SMTP_PORT) || 465;
  const user = (env.PLATFORM_SMTP_USER || '').trim();
  const pass = (env.PLATFORM_SMTP_PASS || '').trim();
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

function buildPilotEmailContent(data) {
  const company = sanitizeHeader(data.companyName || '—');
  const contact = sanitizeHeader(data.contactName || '—');
  const email = sanitizeHeader(data.email || '—');
  const phone = sanitizeHeader(data.phone || '—');
  const fleet = sanitizeHeader(data.fleetSize || data.tier || '—');
  const lang = sanitizeHeader(data.lang || 'sr').toUpperCase();
  let timestamp;
  try {
    timestamp = data.timestamp ? new Date(data.timestamp).toISOString() : new Date().toISOString();
  } catch {
    timestamp = new Date().toISOString();
  }
  const source = sanitizeHeader(data.source || 'BusCommand landing — 30-day pilot');
  const message = data.message ? String(data.message).trim() : '';

  const subject = sanitizeHeader(`[BusCommand Pilot] Nova prijava: ${company} (${fleet} vozila)`);

  const text = [
    '=== NOVA PRIJAVA ZA 30-DNEVNI PILOT ===',
    '',
    `Kompanija:      ${company}`,
    `Kontakt osoba:  ${contact}`,
    `Poslovni email: ${email}`,
    `Telefon:        ${phone}`,
    `Veličina flote: ${fleet}`,
    `Jezik prijave:  ${lang}`,
    `Vreme:          ${timestamp}`,
    `Izvor:          ${source}`,
    '',
    message ? `Poruka / Napomena:\n${message}\n` : '',
    '======================================='
  ].filter(Boolean).join('\n');

  const html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #334155;">
    <div style="border-bottom: 2px solid #3b82f6; padding-bottom: 16px; margin-bottom: 20px;">
      <h2 style="margin: 0; color: #60a5fa; font-size: 20px; font-weight: 700;">BusCommand — Zahtev za 30-dnevni pilot</h2>
      <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Zvanična kontakt adresa: info@buscommand.com</p>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px;">
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; width: 140px; border-bottom: 1px solid #1e293b;">Kompanija:</td>
        <td style="padding: 8px 12px; color: #f8fafc; font-weight: 600; border-bottom: 1px solid #1e293b;">${escapeHtml(company)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Kontakt osoba:</td>
        <td style="padding: 8px 12px; color: #f8fafc; font-weight: 600; border-bottom: 1px solid #1e293b;">${escapeHtml(contact)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Poslovni email:</td>
        <td style="padding: 8px 12px; color: #38bdf8; font-weight: 600; border-bottom: 1px solid #1e293b;"><a href="mailto:${escapeHtml(email)}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(email)}</a></td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Telefon:</td>
        <td style="padding: 8px 12px; color: #f8fafc; border-bottom: 1px solid #1e293b;">${escapeHtml(phone)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Vozni park / Paket:</td>
        <td style="padding: 8px 12px; color: #34d399; font-weight: 600; border-bottom: 1px solid #1e293b;">${escapeHtml(fleet)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Jezik / Izvor:</td>
        <td style="padding: 8px 12px; color: #cbd5e1; border-bottom: 1px solid #1e293b;">${escapeHtml(lang)} · ${escapeHtml(source)}</td>
      </tr>
      <tr>
        <td style="padding: 8px 12px; color: #94a3b8; border-bottom: 1px solid #1e293b;">Vreme:</td>
        <td style="padding: 8px 12px; color: #cbd5e1; border-bottom: 1px solid #1e293b;">${escapeHtml(timestamp)}</td>
      </tr>
    </table>

    ${message ? `<div style="background: #1e293b; padding: 14px; border-radius: 8px; margin-bottom: 20px;">
      <div style="font-size: 12px; color: #94a3b8; margin-bottom: 6px; font-weight: 600;">NAPOMENA / PORUKA:</div>
      <div style="font-size: 13px; color: #f1f5f9; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>` : ''}

    <div style="font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 12px;">
      Ova prijava je poslata preko zvanične BusCommand landing forme (30-dnevni pilot, 5 garancija).
    </div>
  </div>`;

  return { subject, text, html };
}

async function sendPilotEmail({ data, env = process.env, transportOverride = null }) {
  const { subject, text, html } = buildPilotEmailContent(data);
  const from = sanitizeHeader(env.PLATFORM_SMTP_FROM || '"BusCommand Pilot" <info@buscommand.com>');
  const replyTo = sanitizeHeader(data.email);

  const activeTransport = transportOverride || _injectedTransport;

  if (activeTransport) {
    try {
      const info = await activeTransport.sendMail({
        from,
        to: TARGET_EMAIL,
        replyTo,
        subject,
        text,
        html
      });
      return { status: 'sent', messageId: info?.messageId || 'override' };
    } catch (err) {
      return { status: 'error', error: String(err?.message || err).slice(0, 300) };
    }
  }

  if (!isPlatformSmtpConfigured(env)) {
    return {
      status: 'smtp_not_configured',
      error: 'Platform SMTP credentials (PLATFORM_SMTP_HOST/USER/PASS) not configured on server'
    };
  }

  const transport = createPlatformTransport(env);
  if (!transport) {
    return { status: 'no_transport', error: 'Failed to create SMTP transport' };
  }

  try {
    const info = await transport.sendMail({
      from,
      to: TARGET_EMAIL,
      replyTo,
      subject,
      text,
      html
    });
    return { status: 'sent', messageId: info.messageId };
  } catch (err) {
    return { status: 'error', error: String(err?.message || err).slice(0, 300) };
  }
}

module.exports = {
  TARGET_EMAIL,
  escapeHtml,
  sanitizeHeader,
  isPlatformSmtpConfigured,
  setPlatformTransport,
  createPlatformTransport,
  buildPilotEmailContent,
  sendPilotEmail
};
