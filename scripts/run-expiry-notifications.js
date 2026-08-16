/**
 * Cron script — scans all companies for driver compliance expiries
 * (license/CPC/medical) and sends email warnings via tenant SMTP.
 *
 * Thresholds: 30 days, 7 days, 1 day, and expired.
 * Each driver gets at most one email per threshold per field.
 *
 * Run daily (e.g. 08:00 CET) via Render cron or external scheduler.
 * Calls the internal API endpoint — same auth as confirmation-dispatch.
 */
"use strict";

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const EXPIRY_FIELDS = [
  { key: "licenseExpiry", label: "Driving licence", labelDe: "Führerschein", labelSr: "Vozačka dozvola" },
  { key: "cpcExpiry", label: "CPC certificate", labelDe: "CPC-Zertifikat", labelSr: "CPC sertifikat" },
  { key: "medicalExpiry", label: "Medical check", labelDe: "Ärztliche Untersuchung", labelSr: "Medicinski pregled" }
];
const THRESHOLDS = [30, 7, 1, 0];

function daysUntil(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.floor((target.getTime() - today.getTime()) / 86400000);
}

async function runExpiryNotifications() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
  if (!serviceAccount.project_id) {
    console.error("FIREBASE_SERVICE_ACCOUNT not configured");
    process.exit(1);
  }
  initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore();

  const { sendEmail, buildExpiryWarningEmail } = require("../server/email-provider");
  const companiesSnap = await db.collection("companies").get();
  let totalSent = 0;
  let totalSkipped = 0;

  for (const companyDoc of companiesSnap.docs) {
    const companyId = companyDoc.id;
    const companyData = companyDoc.data() || {};
    const companyName = companyData.name || companyId;

    // Load SMTP config
    const smtpSnap = await companyDoc.ref.collection("settings").doc("email_smtp").get();
    const smtpCfg = smtpSnap.exists ? smtpSnap.data() : null;
    if (!smtpCfg?.enabled || !smtpCfg?.host || !smtpCfg?.pass) {
      continue; // no SMTP configured or disabled
    }

    // Load CA contact email for notifications
    const settingsSnap = await companyDoc.ref.collection("settings").doc("main").get();
    const settingsMain = settingsSnap.exists ? settingsSnap.data() : {};
    const caEmail = settingsMain.contactEmail || settingsMain.billingEmail || null;
    const lang = String(settingsMain.defaultLanguage || "en");

    // Scan all drivers
    const driversSnap = await companyDoc.ref.collection("drivers").get();
    for (const driverDoc of driversSnap.docs) {
      const driver = driverDoc.data() || {};
      const driverEmail = driver.email || "";
      const driverName = driver.name || `${driver.firstName || ""} ${driver.lastName || ""}`.trim() || driverDoc.id;
      if (!driverEmail && !caEmail) continue;

      for (const field of EXPIRY_FIELDS) {
        const expiryDate = String(driver[field.key] || "").trim();
        if (!expiryDate) continue;

        const days = daysUntil(expiryDate);
        if (days === null) continue;

        // Check if we already sent for this threshold
        const threshold = THRESHOLDS.find((t) => days <= t && days > (t === 0 ? -999 : THRESHOLDS[THRESHOLDS.indexOf(t) + 1] ?? -999));
        if (threshold === undefined) continue;

        const notifKey = `${field.key}_${threshold}d`;
        const notifRef = companyDoc.ref.collection("expiry_notifications").doc(`${driverDoc.id}_${notifKey}`);
        const notifSnap = await notifRef.get();
        if (notifSnap.exists) continue; // already sent

        const fieldLabel = lang === "de" ? field.labelDe : lang === "sr" ? field.labelSr : field.label;
        const mail = buildExpiryWarningEmail({
          driverName,
          fieldName: fieldLabel,
          expiryDate,
          daysLeft: days,
          companyName
        }, lang);

        let sent = false;
        // Send to driver if they have email
        if (driverEmail) {
          const result = await sendEmail({ smtp: smtpCfg, to: driverEmail, subject: mail.subject, text: mail.text, html: mail.html });
          if (result.status === "sent" || result.status === "stub_sent") sent = true;
        }
        // Also send to CA if different from driver email
        if (caEmail && caEmail !== driverEmail) {
          const caResult = await sendEmail({ smtp: smtpCfg, to: caEmail, subject: mail.subject, text: mail.text, html: mail.html });
          if (caResult.status === "sent" || caResult.status === "stub_sent") sent = true;
        }

        if (sent) {
          await notifRef.set({
            driverId: driverDoc.id,
            field: field.key,
            threshold: notifKey,
            expiryDate,
            sentAt: new Date().toISOString()
          });
          totalSent += 1;
        } else {
          totalSkipped += 1;
        }
      }
    }
  }

  console.log(`Expiry notifications: ${totalSent} sent, ${totalSkipped} skipped`);
  process.exit(0);
}

runExpiryNotifications().catch((err) => {
  console.error("Expiry notification cron failed:", err);
  process.exit(1);
});
