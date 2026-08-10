"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseServiceAccountJson,
  validateHttpsPublicOrigin,
  validateStagingFirebase,
  validateStagingAppPublicUrl,
  validateRuntimeBeforeListen,
  STAGING_FIREBASE_PROJECT_ID
} = require("../../server/runtime-isolation");
const { resolveRuntimeEnv } = require("../../server/cors-policy");

const STAGING_ORIGIN = "https://bc-staging.example";

function assertNoSecretLeak(err) {
  const text = `${err && err.message}|${err && err.code}|${String(err)}`;
  assert.doesNotMatch(text, /private_key/i);
  assert.doesNotMatch(text, /BEGIN PRIVATE/);
  assert.doesNotMatch(text, /"type"\s*:\s*"service_account"/);
  assert.doesNotMatch(text, /bc-staging\.example/);
  assert.doesNotMatch(text, /AIza/);
}

test("invalid BUSCOMMAND_ENV fails closed", () => {
  assert.throws(
    () => resolveRuntimeEnv({ BUSCOMMAND_ENV: "preview" }),
    (err) => err.code === "runtime-env-invalid"
  );
  assert.throws(
    () => validateRuntimeBeforeListen({ BUSCOMMAND_ENV: "stage" }),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "runtime-env-invalid";
    }
  );
});

test("staging + missing credential fails before listen", () => {
  assert.throws(
    () => validateRuntimeBeforeListen({
      BUSCOMMAND_ENV: "staging",
      NODE_ENV: "production",
      CORS_ORIGINS: STAGING_ORIGIN,
      APP_PUBLIC_URL: STAGING_ORIGIN
    }),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "staging-firebase-credential-missing";
    }
  );
});

test("staging + malformed JSON fails", () => {
  assert.throws(
    () => validateStagingFirebase({
      FIREBASE_SERVICE_ACCOUNT_JSON: "{not-json"
    }),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "staging-firebase-credential-invalid";
    }
  );
  const parsed = parseServiceAccountJson("{not-json");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "staging-firebase-credential-invalid");
});

test("staging + wrong project_id fails", () => {
  assert.throws(
    () => validateStagingFirebase({
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        type: "service_account",
        project_id: "some-other-project"
      })
    }),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "staging-firebase-project-mismatch";
    }
  );
});

test("staging + correct project_id validator passes", () => {
  const account = validateStagingFirebase({
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: STAGING_FIREBASE_PROJECT_ID
    })
  });
  assert.equal(account.project_id, STAGING_FIREBASE_PROJECT_ID);
});

test("staging QA harness allows test-only bypass without credentials", () => {
  const result = validateRuntimeBeforeListen({
    BUSCOMMAND_ENV: "staging",
    NODE_ENV: "production",
    BUSCOMMAND_QA_HARNESS: "1",
    CORS_ORIGINS: STAGING_ORIGIN
  });
  assert.equal(result.runtime, "staging");
  assert.equal(result.qaBypass, true);
  assert.equal(result.hasFirebase, false);
  assert.equal(result.serviceAccount, null);
});

test("NODE_ENV alone does not enable QA bypass", () => {
  assert.throws(
    () => validateRuntimeBeforeListen({
      BUSCOMMAND_ENV: "staging",
      NODE_ENV: "test",
      CORS_ORIGINS: STAGING_ORIGIN,
      APP_PUBLIC_URL: STAGING_ORIGIN
    }),
    (err) => err.code === "staging-firebase-credential-missing"
  );
});

test("APP_PUBLIC_URL missing/invalid/prod/mismatch fail; matching origin passes", () => {
  assert.equal(validateHttpsPublicOrigin("").ok, false);
  assert.equal(validateHttpsPublicOrigin("https://buscommand.com").code, "staging-app-public-url-production-forbidden");
  assert.equal(validateHttpsPublicOrigin("https://bc-staging.example/path").ok, false);
  assert.equal(validateHttpsPublicOrigin("https://bc-staging.example?x=1").ok, false);

  assert.throws(
    () => validateStagingAppPublicUrl({ APP_PUBLIC_URL: "" }, [STAGING_ORIGIN]),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "staging-app-public-url-missing";
    }
  );
  assert.throws(
    () => validateStagingAppPublicUrl({ APP_PUBLIC_URL: "https://www.buscommand.com" }, [STAGING_ORIGIN]),
    (err) => err.code === "staging-app-public-url-production-forbidden"
  );
  assert.throws(
    () => validateStagingAppPublicUrl({ APP_PUBLIC_URL: STAGING_ORIGIN }, ["https://other.example"]),
    (err) => {
      assertNoSecretLeak(err);
      return err.code === "staging-app-public-url-cors-mismatch";
    }
  );
  assert.equal(
    validateStagingAppPublicUrl({ APP_PUBLIC_URL: STAGING_ORIGIN }, [STAGING_ORIGIN]),
    STAGING_ORIGIN
  );
});

test("full staging validateRuntimeBeforeListen passes with matching config", () => {
  const result = validateRuntimeBeforeListen({
    BUSCOMMAND_ENV: "staging",
    NODE_ENV: "production",
    CORS_ORIGINS: STAGING_ORIGIN,
    APP_PUBLIC_URL: STAGING_ORIGIN,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account",
      project_id: "buscommand-preview"
    })
  });
  assert.equal(result.hasFirebase, true);
  assert.equal(result.serviceAccount.project_id, "buscommand-preview");
  assert.equal(result.appPublicUrl, STAGING_ORIGIN);
});

test("development/production contracts remain available without staging requirements", () => {
  const dev = validateRuntimeBeforeListen({
    BUSCOMMAND_ENV: "development",
    NODE_ENV: "development"
  });
  assert.equal(dev.runtime, "development");
  assert.equal(dev.hasFirebase, false);

  const prod = validateRuntimeBeforeListen({
    BUSCOMMAND_ENV: "production",
    NODE_ENV: "production",
    CORS_ORIGINS: "https://www.buscommand.com"
  });
  assert.equal(prod.runtime, "production");
  assert.equal(prod.hasFirebase, false);
});

test("api-server process exits before listen on staging credential failure", async () => {
  const { spawn } = require("node:child_process");
  const path = require("node:path");
  const root = path.join(__dirname, "../..");
  const child = spawn(process.execPath, ["api-server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "18771",
      NODE_ENV: "production",
      BUSCOMMAND_ENV: "staging",
      CORS_ORIGINS: STAGING_ORIGIN,
      APP_PUBLIC_URL: STAGING_ORIGIN
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const code = await new Promise((resolve) => {
    child.on("exit", (exitCode) => resolve(exitCode));
    setTimeout(() => {
      child.kill("SIGTERM");
      resolve(-1);
    }, 8000);
  });
  assert.equal(code, 1);
  assert.match(stderr, /Runtime configuration invalid/);
  assert.match(stderr, /staging-firebase-credential-missing/);
  assert.doesNotMatch(stderr, /private_key/i);
  assert.doesNotMatch(stderr, /BEGIN PRIVATE/);
  assert.doesNotMatch(stderr, /"type"\s*:\s*"service_account"/);
});
