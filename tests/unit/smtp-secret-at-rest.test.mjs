/**
 * WIDE-37 — SMTP secret at-rest hardening tests.
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
  resolveSmtpPasswordFromDoc,
  loadSmtpSecretKey,
  SmtpSecretError
} = require("../../server/smtp-secret-crypto.js");
const {
  buildEncryptedSmtpSettingsDoc,
  toPublicSmtpSettings,
  smtpAuditMeta,
  prepareSmtpForSend
} = require("../../server/smtp-settings.js");
const { sendEmail } = require("../../server/email-provider.js");

function testKey() {
  return crypto.randomBytes(32);
}

function envWithKey(key = testKey()) {
  return { [ENV_KEY]: key.toString("base64") };
}

test("encrypt/decrypt round trip with AAD tenant binding", () => {
  const key = testKey();
  const env = envWithKey(key);
  const enc = encryptSmtpPassword("s3cret-pass!", "comp-a", { env });
  assert.equal(isEncryptedSmtpSecret(enc), true);
  assert.ok(enc.startsWith(PREFIX));
  assert.notEqual(enc.includes("s3cret-pass!"), true);
  const plain = decryptSmtpPassword(enc, "comp-a", { env });
  assert.equal(plain, "s3cret-pass!");
});

test("ciphertext differs from plaintext and is non-deterministic", () => {
  const env = envWithKey();
  const a = encryptSmtpPassword("same-password", "tenant-1", { env });
  const b = encryptSmtpPassword("same-password", "tenant-1", { env });
  assert.notEqual(a, "same-password");
  assert.notEqual(a, b, "IV must randomize ciphertext");
  assert.equal(decryptSmtpPassword(a, "tenant-1", { env }), "same-password");
  assert.equal(decryptSmtpPassword(b, "tenant-1", { env }), "same-password");
});

test("tampered auth tag fails closed", () => {
  const env = envWithKey();
  const enc = encryptSmtpPassword("secret", "comp-1", { env });
  const body = enc.slice(PREFIX.length);
  const [ivB64, tagB64, ctB64] = body.split(".");
  const tag = Buffer.from(tagB64, "base64url");
  tag[0] = tag[0] ^ 0xff;
  const tampered = `${PREFIX}${ivB64}.${tag.toString("base64url")}.${ctB64}`;
  assert.throws(
    () => decryptSmtpPassword(tampered, "comp-1", { env }),
    (err) => err instanceof SmtpSecretError && err.code === "SMTP_SECRET_DECRYPT_FAILED"
  );
});

test("wrong key fails closed", () => {
  const envA = envWithKey(testKey());
  const envB = envWithKey(testKey());
  const enc = encryptSmtpPassword("secret", "comp-1", { env: envA });
  assert.throws(
    () => decryptSmtpPassword(enc, "comp-1", { env: envB }),
    (err) => err instanceof SmtpSecretError && err.code === "SMTP_SECRET_DECRYPT_FAILED"
  );
});

test("wrong companyId AAD fails closed", () => {
  const env = envWithKey();
  const enc = encryptSmtpPassword("secret", "comp-a", { env });
  assert.throws(
    () => decryptSmtpPassword(enc, "comp-b", { env }),
    (err) => err instanceof SmtpSecretError && err.code === "SMTP_SECRET_DECRYPT_FAILED"
  );
});

test("corrupt envelope fails closed", () => {
  const env = envWithKey();
  assert.throws(
    () => decryptSmtpPassword("bcsmtp1.not.valid", "comp-1", { env }),
    (err) => err instanceof SmtpSecretError
  );
  assert.throws(
    () => decryptSmtpPassword("plaintext-not-envelope", "comp-1", { env }),
    (err) => err instanceof SmtpSecretError && err.code === "SMTP_SECRET_NOT_ENCRYPTED"
  );
});

test("legacy plaintext resolve marks needsMigration and encrypt rewrite works", () => {
  const env = envWithKey();
  const legacy = {
    host: "mail.example.com",
    port: 587,
    user: "office@example.com",
    pass: "legacy-plain",
    from: "office@example.com",
    enabled: true
  };
  const resolved = resolveSmtpPasswordFromDoc(legacy, "comp-1", { env });
  assert.equal(resolved.password, "legacy-plain");
  assert.equal(resolved.needsMigration, true);

  const prepared = prepareSmtpForSend(legacy, "comp-1", { env });
  assert.equal(prepared.smtp.pass, "legacy-plain");
  assert.ok(prepared.migrateDoc);
  assert.equal(isEncryptedSmtpSecret(prepared.migrateDoc.pass), true);
  assert.equal(prepared.migrateDoc.migratedFrom, "plaintext");
  assert.equal(
    decryptSmtpPassword(prepared.migrateDoc.pass, "comp-1", { env }),
    "legacy-plain"
  );
});

test("buildEncryptedSmtpSettingsDoc never stores plaintext password", () => {
  const env = envWithKey();
  const doc = buildEncryptedSmtpSettingsDoc(
    {
      host: "smtp.example.com",
      port: 465,
      user: "u@example.com",
      pass: "plain-secret",
      from: "u@example.com",
      enabled: true
    },
    "comp-9",
    "uid-ca",
    { env }
  );
  assert.equal(isEncryptedSmtpSecret(doc.pass), true);
  assert.doesNotMatch(JSON.stringify(doc), /plain-secret/);
  assert.equal(decryptSmtpPassword(doc.pass, "comp-9", { env }), "plain-secret");
});

test("toPublicSmtpSettings never returns pass or ciphertext", () => {
  const env = envWithKey();
  const doc = buildEncryptedSmtpSettingsDoc(
    {
      host: "smtp.example.com",
      port: 587,
      user: "u@example.com",
      pass: "plain-secret",
      from: "u@example.com",
      enabled: true
    },
    "comp-9",
    "uid-ca",
    { env }
  );
  const pub = toPublicSmtpSettings(doc);
  assert.equal("pass" in pub, false);
  assert.equal(pub.hasPassword, true);
  assert.equal(pub.passwordEncrypted, true);
  assert.doesNotMatch(JSON.stringify(pub), /plain-secret/);
  assert.doesNotMatch(JSON.stringify(pub), /bcsmtp1\./);
});

test("smtpAuditMeta never includes password", () => {
  const meta = smtpAuditMeta({
    host: "h",
    port: 587,
    from: "a@b.c",
    enabled: true,
    pass: "super-secret-password"
  });
  assert.equal(meta.hasPassword, true);
  assert.equal("pass" in meta, false);
  assert.doesNotMatch(JSON.stringify(meta), /super-secret-password/);
});

test("SMTP send path still works in stub mode with decrypted smtp object", async () => {
  const env = envWithKey();
  const enc = encryptSmtpPassword("secret", "comp-1", { env });
  const prepared = prepareSmtpForSend(
    {
      host: "mail.test.com",
      port: 587,
      user: "office@test.com",
      pass: enc,
      from: "office@test.com",
      enabled: true
    },
    "comp-1",
    { env }
  );
  assert.equal(prepared.migrateDoc, null);
  const result = await sendEmail({
    smtp: prepared.smtp,
    to: "driver@example.com",
    subject: "Test",
    text: "Hello",
    env: { BUSCOMMAND_FORCE_EMAIL_STUB: "1" }
  });
  assert.equal(result.status, "stub_sent");
});

test("missing env key fails closed on encrypt", () => {
  assert.throws(
    () => encryptSmtpPassword("x", "comp", { env: {} }),
    (err) => err instanceof SmtpSecretError && err.code === "SMTP_SECRET_KEY_MISSING"
  );
});

test("loadSmtpSecretKey accepts hex and base64", () => {
  const bytes = testKey();
  assert.equal(loadSmtpSecretKey({ [ENV_KEY]: bytes.toString("hex") }).equals(bytes), true);
  assert.equal(loadSmtpSecretKey({ [ENV_KEY]: bytes.toString("base64") }).equals(bytes), true);
});

test("API routes encrypt on save and strip secrets on GET (source contract)", () => {
  const src = readFileSync(resolve("api-server.js"), "utf8");
  assert.match(src, /buildEncryptedSmtpSettingsDoc/);
  assert.match(src, /toPublicSmtpSettings/);
  assert.match(src, /smtpAuditMeta/);
  assert.match(src, /isEncryptedSmtpSecret/);
  const postIdx = src.indexOf('"/api/company-admin/email-smtp"');
  assert.ok(postIdx > 0);
  const postSlice = src.slice(postIdx, postIdx + 2500);
  assert.match(postSlice, /buildEncryptedSmtpSettingsDoc/);
  assert.doesNotMatch(postSlice, /\.set\(\{\s*host, port, user, pass, from/);
});

test("confirmation scheduler decrypts via prepareSmtpForSend (source contract)", () => {
  const src = readFileSync(resolve("server/confirmation-scheduler.js"), "utf8");
  assert.match(src, /prepareSmtpForSend/);
  assert.match(src, /migrateDoc/);
});

test("CA-only email-smtp routes remain gated (source contract)", () => {
  const src = readFileSync(resolve("api-server.js"), "utf8");
  const matches = [...src.matchAll(/\/api\/company-admin\/email-smtp[\s\S]{0,400}requireCompanyAdmin/g)];
  assert.ok(matches.length >= 1);
  assert.match(src, /requireCompanyAdmin[\s\S]{0,200}validateBody\(companyEmailSmtpBody\)/);
});
