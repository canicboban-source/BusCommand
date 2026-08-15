"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveRuntimeEnv,
  parseCorsOrigins,
  assertOriginsWellFormed,
  evaluateCorsOrigin,
  buildCorsAllowlist,
  isForbiddenProductionOrigin
} = require("../../server/cors-policy");

const STAGING_ORIGIN = "https://bc-staging.example";

test("staging runtime comes from BUSCOMMAND_ENV", () => {
  assert.equal(resolveRuntimeEnv({ BUSCOMMAND_ENV: "staging", NODE_ENV: "production" }), "staging");
  assert.equal(resolveRuntimeEnv({ BUSCOMMAND_QA_HARNESS: "1", NODE_ENV: "production" }), "development");
});

test("invalid non-empty BUSCOMMAND_ENV throws", () => {
  assert.throws(
    () => resolveRuntimeEnv({ BUSCOMMAND_ENV: "preview" }),
    (err) => err.code === "runtime-env-invalid"
  );
});

test("parseCorsOrigins trims and dedupes exact origins", () => {
  assert.deepEqual(
    parseCorsOrigins(` ${STAGING_ORIGIN} , ${STAGING_ORIGIN} `),
    [STAGING_ORIGIN]
  );
});

test("staging allowlist accepts exact synthetic origin and rejects production", () => {
  const policy = buildCorsAllowlist({
    BUSCOMMAND_ENV: "staging",
    NODE_ENV: "production",
    CORS_ORIGINS: STAGING_ORIGIN
  });
  assert.equal(
    evaluateCorsOrigin(STAGING_ORIGIN, {
      runtime: policy.runtime,
      configuredOrigins: policy.configuredOrigins,
      nodeEnv: "production"
    }).allowed,
    true
  );
  assert.equal(
    evaluateCorsOrigin("https://buscommand.com", {
      runtime: policy.runtime,
      configuredOrigins: policy.configuredOrigins,
      nodeEnv: "production"
    }).allowed,
    false
  );
  assert.equal(
    evaluateCorsOrigin("https://www.buscommand.com", {
      runtime: policy.runtime,
      configuredOrigins: policy.configuredOrigins,
      nodeEnv: "production"
    }).allowed,
    false
  );
});

test("lookalike and subdomain attacks are denied in staging", () => {
  const configuredOrigins = [STAGING_ORIGIN];
  for (const origin of [
    "https://buscommand.com.evil.example",
    "https://evil-bc-staging.example",
    "https://bc-staging.example.evil.example"
  ]) {
    assert.equal(
      evaluateCorsOrigin(origin, {
        runtime: "staging",
        configuredOrigins,
        nodeEnv: "production"
      }).allowed,
      false,
      origin
    );
  }
});

test("staging CORS config rejects production hosts and wildcards", () => {
  assert.throws(
    () => assertOriginsWellFormed(["https://buscommand.com"], { runtime: "staging" }),
    (err) => err.code === "cors-staging-production-forbidden"
  );
  assert.throws(
    () => assertOriginsWellFormed(["https://*.example"], { runtime: "staging" }),
    (err) => err.code === "cors-wildcard-forbidden"
  );
  assert.equal(isForbiddenProductionOrigin("https://www.buscommand.com"), true);
});

test("localhost only outside staging/production", () => {
  assert.equal(
    evaluateCorsOrigin("http://localhost:5173", {
      runtime: "development",
      configuredOrigins: [],
      nodeEnv: "development"
    }).allowed,
    true
  );
  assert.equal(
    evaluateCorsOrigin("http://localhost:5173", {
      runtime: "staging",
      configuredOrigins: [STAGING_ORIGIN],
      nodeEnv: "production"
    }).allowed,
    false
  );
});

test("missing origin is allowed for non-browser calls", () => {
  assert.equal(
    evaluateCorsOrigin(undefined, {
      runtime: "staging",
      configuredOrigins: [],
      nodeEnv: "production"
    }).allowed,
    true
  );
});
