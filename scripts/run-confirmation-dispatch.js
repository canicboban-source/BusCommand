#!/usr/bin/env node
/**
 * Render cron entry — POST confirmation dispatch with shared secret.
 * Env: CONFIRMATION_JOB_SECRET, CONFIRMATION_DISPATCH_URL (required — no domain fallback).
 * Staging (BUSCOMMAND_ENV=staging): production buscommand.com URLs are rejected.
 */
"use strict";

const runtime = String(process.env.BUSCOMMAND_ENV || "").trim().toLowerCase();
const url = String(process.env.CONFIRMATION_DISPATCH_URL || "").trim();
const secret = process.env.CONFIRMATION_JOB_SECRET || process.env.CRON_SECRET || "";

if (!secret) {
  console.error("CONFIRMATION_JOB_SECRET missing");
  process.exit(1);
}

if (!url) {
  console.error("CONFIRMATION_DISPATCH_URL missing (no default host fallback)");
  process.exit(1);
}

if (runtime === "staging" && /buscommand\.com/i.test(url)) {
  console.error("CONFIRMATION_DISPATCH_URL must not target buscommand.com when BUSCOMMAND_ENV=staging");
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
  console.error(err && err.message ? err.message : "dispatch failed");
  process.exit(1);
});
