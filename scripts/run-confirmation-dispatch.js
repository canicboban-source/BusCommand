#!/usr/bin/env node
/**
 * Render cron entry — POST confirmation dispatch with shared secret.
 * Env: CONFIRMATION_JOB_SECRET, CONFIRMATION_DISPATCH_URL (optional)
 */
const url = process.env.CONFIRMATION_DISPATCH_URL
  || "https://buscommand-preview.onrender.com/api/internal/jobs/confirmation-dispatch";
const secret = process.env.CONFIRMATION_JOB_SECRET || process.env.CRON_SECRET || "";

if (!secret) {
  console.error("CONFIRMATION_JOB_SECRET missing");
  process.exit(1);
}

fetch(url, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-job-secret": secret
  },
  body: "{}"
}).then(async (res) => {
  const text = await res.text();
  console.log(res.status, text.slice(0, 500));
  process.exit(res.ok ? 0 : 1);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
