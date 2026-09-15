/**
 * WIDE-37 production-path closure — expiry SMTP + Render secret declaration.
 */
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  ENV_KEY,
  PREFIX,
  encryptSmtpPassword,
  decryptSmtpPassword,
  isEncryptedSmtpSecret,
  SmtpSecretError
} = require("../../server/smtp-secret-crypto.js");
const {
  buildEncryptedSmtpSettingsDoc
} = require("../../server/smtp-settings.js");
const { resolveExpirySmtpForSend } = require("../../server/expiry-smtp.js");
const { sendEmail } = require("../../server/email-provider.js");

function testKey() {
  return crypto.randomBytes(32);
}

function envWithKey(key = testKey()) {
  return { [ENV_KEY]: key.toString("base64") };
}

function transactionHarness(initial, beforeRead) {
  let state = { ...initial };
  const updates = [];
  return {
    ref: { path: "companies/comp-1/settings/email_smtp" },
    firestore: {
      async runTransaction(callback) {
        if (beforeRead) state = { ...state, ...beforeRead({ ...state }) };
        return callback({
          async get() {
            return { exists: true, data: () => ({ ...state }) };
          },
          update(_ref, patch) {
            updates.push({ ...patch });
            state = { ...state, ...patch };
          }
        });
      }
    },
    get state() {
      return { ...state };
    },
    updates
  };
}

function enabledSmtp(pass, extra = {}) {
  return {
    host: extra.host || "mail.example.com",
    port: extra.port || 587,
    user: extra.user || "office@example.com",
    pass,
    from: extra.from || "office@example.com",
    enabled: extra.enabled !== false
  };
}

test("expiry notification decrypts encrypted SMTP password before sendEmail", async () => {
  const env = envWithKey();
  const envelope = encryptSmtpPassword("real-smtp-pass", "comp-1", { env });
  const resolved = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => assert.fail("encrypted path must not migrate") },
    smtpRef: {},
    smtpDoc: enabledSmtp(envelope),
    companyId: "comp-1",
    opts: { env }
  });
  assert.equal(resolved.smtp.pass, "real-smtp-pass");
  assert.equal(isEncryptedSmtpSecret(resolved.smtp.pass), false);
  const sent = await sendEmail({
    smtp: resolved.smtp,
    to: "driver@example.com",
    subject: "Expiry",
    text: "body",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(sent.status, "stub_sent");
});

test("raw encrypted envelope is never passed to sendEmail", async () => {
  const env = envWithKey();
  const envelope = encryptSmtpPassword("real-smtp-pass", "comp-1", { env });
  const resolved = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(envelope),
    companyId: "comp-1",
    opts: { env }
  });
  assert.notEqual(resolved.smtp.pass, envelope);
  assert.equal(resolved.smtp.pass.startsWith(PREFIX), false);
  assert.doesNotMatch(JSON.stringify(resolved.smtp), /bcsmtp1\./);
});

test("legacy plaintext SMTP still sends and requests race-safe migration", async () => {
  const env = envWithKey();
  const legacy = enabledSmtp("legacy-plain");
  const harness = transactionHarness(legacy);
  const resolved = await resolveExpirySmtpForSend({
    firestore: harness.firestore,
    smtpRef: harness.ref,
    smtpDoc: legacy,
    companyId: "comp-1",
    opts: { env }
  });
  assert.equal(resolved.smtp.pass, "legacy-plain");
  assert.equal(harness.updates.length, 1);
  assert.equal(isEncryptedSmtpSecret(harness.state.pass), true);
  assert.equal(decryptSmtpPassword(harness.state.pass, "comp-1", { env }), "legacy-plain");
  assert.equal(harness.state.host, legacy.host);
  const sent = await sendEmail({
    smtp: resolved.smtp,
    to: "driver@example.com",
    subject: "Expiry",
    text: "body",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(sent.status, "stub_sent");
});

test("expiry legacy migration uses CAS and concurrent CA save wins", async () => {
  const env = envWithKey();
  const legacy = enabledSmtp("legacy-plain", { host: "old.example.com" });
  const newer = buildEncryptedSmtpSettingsDoc(
    {
      host: "new.example.com",
      port: 465,
      user: "new-user",
      pass: "new-secret",
      from: "new@example.com",
      enabled: true
    },
    "comp-1",
    "new-ca",
    { env }
  );
  const harness = transactionHarness(legacy, () => newer);
  const resolved = await resolveExpirySmtpForSend({
    firestore: harness.firestore,
    smtpRef: harness.ref,
    smtpDoc: legacy,
    companyId: "comp-1",
    opts: { env }
  });
  assert.equal(resolved.smtp.pass, "legacy-plain");
  assert.equal(harness.updates.length, 0);
  assert.deepEqual(harness.state, newer);
});

test("missing BUSCOMMAND_SMTP_SECRET_KEY fails closed for encrypted SMTP", async () => {
  const env = envWithKey();
  const envelope = encryptSmtpPassword("hidden-pass", "comp-1", { env });
  const resolved = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(envelope),
    companyId: "comp-1",
    opts: { env: {} }
  });
  assert.equal(resolved.smtp, null);
  assert.ok(resolved.error instanceof SmtpSecretError);
});

test("wrong key and corrupted ciphertext fail closed", async () => {
  const envA = envWithKey();
  const envB = envWithKey();
  const envelope = encryptSmtpPassword("hidden-pass", "comp-1", { env: envA });
  const wrongKey = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(envelope),
    companyId: "comp-1",
    opts: { env: envB }
  });
  assert.equal(wrongKey.smtp, null);

  const body = envelope.slice(PREFIX.length);
  const [ivB64, tagB64, ctB64] = body.split(".");
  const tag = Buffer.from(tagB64, "base64url");
  tag[0] = tag[0] ^ 0xff;
  const tampered = `${PREFIX}${ivB64}.${tag.toString("base64url")}.${ctB64}`;
  const corrupt = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(tampered),
    companyId: "comp-1",
    opts: { env: envA }
  });
  assert.equal(corrupt.smtp, null);
});

test("expiry helper errors never include password, ciphertext, or key", async () => {
  const key = testKey();
  const env = envWithKey(key);
  const envelope = encryptSmtpPassword("super-secret-password", "comp-1", { env });
  const resolved = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(envelope),
    companyId: "comp-1",
    opts: { env: envWithKey() }
  });
  assert.equal(resolved.smtp, null);
  const dumped = [
    JSON.stringify(resolved),
    String(resolved.error || ""),
    resolved.error?.message || "",
    resolved.error?.code || "",
    resolved.error?.stack || ""
  ].join(" ");
  assert.doesNotMatch(dumped, /super-secret-password/);
  assert.doesNotMatch(dumped, /bcsmtp1\./);
  assert.doesNotMatch(dumped, new RegExp(key.toString("base64")));
});

test("invalid SMTP on one tenant does not prevent resolving another tenant", async () => {
  const env = envWithKey();
  const bad = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp("bcsmtp1.not.valid.ciphertext"),
    companyId: "bad-tenant",
    opts: { env }
  });
  const goodEnvelope = encryptSmtpPassword("ok-pass", "good-tenant", { env });
  const good = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => {} },
    smtpRef: {},
    smtpDoc: enabledSmtp(goodEnvelope),
    companyId: "good-tenant",
    opts: { env }
  });
  assert.equal(bad.smtp, null);
  assert.equal(good.smtp.pass, "ok-pass");
});

test("expiry cron uses WIDE-37 prepare/CAS helpers and never sendEmail(smtpCfg)", () => {
  const src = readFileSync(resolve("scripts/run-expiry-notifications.js"), "utf8");
  assert.match(src, /resolveExpirySmtpForSend/);
  assert.doesNotMatch(src, /sendEmail\(\{\s*smtp:\s*smtpCfg/);
  assert.doesNotMatch(src, /smtpRef\.set\(/);
  const helper = readFileSync(resolve("server/expiry-smtp.js"), "utf8");
  assert.match(helper, /prepareSmtpForSend/);
  assert.match(helper, /migrateLegacySmtpPasswordIfUnchanged/);
});

test("Render declares BUSCOMMAND_SMTP_SECRET_KEY for web and expiry cron only", () => {
  const yaml = readFileSync(resolve("render.yaml"), "utf8");
  const web = yaml.match(/- type: web\r?\n\s{4}name: buscommand[\s\S]*?(?=\n\s{2}- type:|$)/);
  const confirm = yaml.match(/name: buscommand-confirm-dispatch[\s\S]*?(?=\n\s{2}- type:|$)/);
  const expiry = yaml.match(/name: buscommand-expiry-notifications[\s\S]*$/);
  assert.ok(web, "web service block");
  assert.ok(confirm, "confirm cron block");
  assert.ok(expiry, "expiry cron block");
  assert.match(web[0], /key: BUSCOMMAND_SMTP_SECRET_KEY\r?\n\s+sync: false/);
  assert.match(expiry[0], /key: BUSCOMMAND_SMTP_SECRET_KEY\r?\n\s+sync: false/);
  assert.doesNotMatch(confirm[0], /BUSCOMMAND_SMTP_SECRET_KEY/);
  assert.doesNotMatch(yaml, /VITE_[A-Z0-9_]*SMTP/);
  assert.doesNotMatch(yaml, /key: BUSCOMMAND_SMTP_SECRET_KEY[\s\S]{0,40}value:/);
});

test("legacy plaintext still sends when encryption key is missing", async () => {
  const resolved = await resolveExpirySmtpForSend({
    firestore: { runTransaction: async () => assert.fail("missing key must not rewrite") },
    smtpRef: {},
    smtpDoc: enabledSmtp("legacy-plain"),
    companyId: "comp-1",
    opts: { env: {} }
  });
  assert.equal(resolved.smtp.pass, "legacy-plain");
  assert.ok(resolved.error instanceof SmtpSecretError);
});

test("confirmation scheduler still uses the same CAS helper (source contract)", () => {
  const src = readFileSync(resolve("server/confirmation-scheduler.js"), "utf8");
  assert.match(src, /prepareSmtpForSend/);
  assert.match(src, /migrateLegacySmtpPasswordIfUnchanged/);
  assert.doesNotMatch(src, /smtpRef\.set\(prepared\.migrateDoc/);
});
