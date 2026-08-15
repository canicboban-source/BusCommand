"use strict";

/**
 * Pre-listen runtime isolation checks for BusCommand.
 * Staging is fail-closed for Firebase Admin + APP_PUBLIC_URL unless QA harness.
 * Errors never include credential/env values.
 */

const {
  buildCorsAllowlist,
  isForbiddenProductionOrigin,
  resolveRuntimeEnv
} = require("./cors-policy");

const STAGING_FIREBASE_PROJECT_ID = "buscommand-preview";

function configError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function isQaHarness(env = process.env) {
  return String(env.BUSCOMMAND_QA_HARNESS || "").trim() === "1";
}

function parseServiceAccountJson(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: false, code: "staging-firebase-credential-missing" };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, code: "staging-firebase-credential-invalid" };
    }
    return { ok: true, serviceAccount: parsed };
  } catch {
    return { ok: false, code: "staging-firebase-credential-invalid" };
  }
}

function validateHttpsPublicOrigin(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { ok: false, code: "staging-app-public-url-missing" };
  }
  const value = String(raw).trim();
  let url;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, code: "staging-app-public-url-invalid" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, code: "staging-app-public-url-invalid" };
  }
  if (url.username || url.password) {
    return { ok: false, code: "staging-app-public-url-invalid" };
  }
  if (url.search || url.hash) {
    return { ok: false, code: "staging-app-public-url-invalid" };
  }
  // Exact origin only — no path other than empty/"/" and no trailing-slash form.
  if (value !== url.origin) {
    return { ok: false, code: "staging-app-public-url-invalid" };
  }
  if (isForbiddenProductionOrigin(url.origin)) {
    return { ok: false, code: "staging-app-public-url-production-forbidden" };
  }
  return { ok: true, origin: url.origin };
}

function validateStagingFirebase(env = process.env) {
  const parsed = parseServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!parsed.ok) {
    throw configError(parsed.code, "Staging Firebase Admin configuration is invalid");
  }
  const projectId = String(parsed.serviceAccount.project_id || "").trim();
  if (projectId !== STAGING_FIREBASE_PROJECT_ID) {
    throw configError(
      "staging-firebase-project-mismatch",
      "Staging Firebase Admin configuration is invalid"
    );
  }
  return parsed.serviceAccount;
}

function validateStagingAppPublicUrl(env = process.env, corsOrigins = []) {
  const checked = validateHttpsPublicOrigin(env.APP_PUBLIC_URL);
  if (!checked.ok) {
    throw configError(checked.code, "Staging APP_PUBLIC_URL configuration is invalid");
  }
  if (!corsOrigins.includes(checked.origin)) {
    throw configError(
      "staging-app-public-url-cors-mismatch",
      "Staging APP_PUBLIC_URL configuration is invalid"
    );
  }
  return checked.origin;
}

/**
 * Full pre-listen validation.
 * @returns {{
 *  runtime: string,
 *  qaBypass: boolean,
 *  corsPolicy: object,
 *  hasFirebase: boolean,
 *  serviceAccount: object|null,
 *  appPublicUrl: string|null
 * }}
 */
function validateRuntimeBeforeListen(env = process.env, options = {}) {
  // resolveRuntimeEnv throws on invalid non-empty BUSCOMMAND_ENV
  const runtime = resolveRuntimeEnv(env);
  const corsPolicy = buildCorsAllowlist(env);
  const qaBypass = isQaHarness(env);
  const keyFileExists = options.keyFileExists === true;

  if (runtime !== "staging") {
    const hasFirebase = !qaBypass && Boolean(
      env.FIREBASE_SERVICE_ACCOUNT_JSON
      || env.GOOGLE_APPLICATION_CREDENTIALS
      || keyFileExists
    );
    return {
      runtime,
      qaBypass,
      corsPolicy,
      hasFirebase,
      serviceAccount: null,
      appPublicUrl: null
    };
  }

  if (qaBypass) {
    return {
      runtime,
      qaBypass: true,
      corsPolicy,
      hasFirebase: false,
      serviceAccount: null,
      appPublicUrl: null
    };
  }

  const serviceAccount = validateStagingFirebase(env);
  const appPublicUrl = validateStagingAppPublicUrl(env, corsPolicy.configuredOrigins);

  return {
    runtime,
    qaBypass: false,
    corsPolicy,
    hasFirebase: true,
    serviceAccount,
    appPublicUrl
  };
}

module.exports = {
  STAGING_FIREBASE_PROJECT_ID,
  isQaHarness,
  parseServiceAccountJson,
  validateHttpsPublicOrigin,
  validateStagingFirebase,
  validateStagingAppPublicUrl,
  validateRuntimeBeforeListen
};
