"use strict";

/**
 * Exact-origin CORS policy for BusCommand runtimes.
 * No wildcard. No suffix/domain guessing. Staging never admits production hosts.
 */

const PRODUCTION_HOST_RE = /^(?:www\.)?buscommand\.com$/i;

function resolveRuntimeEnv(env = process.env) {
  const raw = env.BUSCOMMAND_ENV;
  if (raw !== undefined && String(raw).trim() !== "") {
    const explicit = String(raw).trim().toLowerCase();
    if (explicit === "staging" || explicit === "production" || explicit === "development") {
      return explicit;
    }
    const err = new Error("Invalid BUSCOMMAND_ENV");
    err.code = "runtime-env-invalid";
    throw err;
  }
  // Empty BUSCOMMAND_ENV keeps prior development/test contract unless NODE_ENV=production.
  if (String(env.BUSCOMMAND_QA_HARNESS || "").trim() === "1") {
    return "development";
  }
  if (String(env.NODE_ENV || "").trim() === "production") {
    return "production";
  }
  return "development";
}

function parseCorsOrigins(raw) {
  return [...new Set(
    String(raw || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  )];
}

function isForbiddenProductionOrigin(origin) {
  try {
    const { hostname } = new URL(origin);
    return PRODUCTION_HOST_RE.test(hostname) || hostname.toLowerCase().endsWith(".buscommand.com");
  } catch {
    return false;
  }
}

function assertOriginsWellFormed(origins, { runtime } = {}) {
  for (const origin of origins) {
    if (origin.includes("*")) {
      const err = new Error("CORS origin wildcards are forbidden");
      err.code = "cors-wildcard-forbidden";
      throw err;
    }
    let url;
    try {
      url = new URL(origin);
    } catch {
      const err = new Error("CORS origin is not a valid absolute URL");
      err.code = "cors-origin-invalid";
      throw err;
    }
    if (url.origin !== origin) {
      const err = new Error("CORS origin must be an exact origin (scheme://host[:port])");
      err.code = "cors-origin-not-exact";
      throw err;
    }
    if (runtime === "staging" && isForbiddenProductionOrigin(origin)) {
      const err = new Error("Staging CORS must not allow production buscommand.com origins");
      err.code = "cors-staging-production-forbidden";
      throw err;
    }
  }
}

function isLocalDevCorsOrigin(origin, { runtime, nodeEnv } = {}) {
  if (runtime === "staging" || runtime === "production") return false;
  if (String(nodeEnv || "").trim() === "production" && runtime !== "development") return false;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

/**
 * @returns {{ allowed: boolean, reason: string }}
 */
function evaluateCorsOrigin(origin, {
  runtime,
  configuredOrigins,
  nodeEnv
} = {}) {
  if (!origin) {
    return { allowed: true, reason: "no-origin" };
  }
  const origins = Array.isArray(configuredOrigins) ? configuredOrigins : [];
  if (origins.includes(origin)) {
    return { allowed: true, reason: "exact-allowlist" };
  }
  if (isLocalDevCorsOrigin(origin, { runtime, nodeEnv })) {
    return { allowed: true, reason: "local-dev" };
  }
  return { allowed: false, reason: "deny" };
}

function buildCorsAllowlist(env = process.env) {
  const runtime = resolveRuntimeEnv(env);
  const configuredOrigins = parseCorsOrigins(env.CORS_ORIGINS);
  assertOriginsWellFormed(configuredOrigins, { runtime });
  if ((runtime === "staging" || runtime === "production") && configuredOrigins.length === 0) {
    // Fail-closed for browser calls; server-to-server (no Origin) still works.
    return { runtime, configuredOrigins: [], failClosedEmpty: true };
  }
  return { runtime, configuredOrigins, failClosedEmpty: false };
}

module.exports = {
  resolveRuntimeEnv,
  parseCorsOrigins,
  assertOriginsWellFormed,
  isForbiddenProductionOrigin,
  isLocalDevCorsOrigin,
  evaluateCorsOrigin,
  buildCorsAllowlist
};
