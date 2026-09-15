/**
 * Tenant SMTP password at-rest crypto (WIDE-37).
 * AES-256-GCM, key from server env only. Versioned ciphertext envelope.
 *
 * Envelope (string stored in Firestore `pass` after migration):
 *   bcsmtp1.<iv_b64url>.<tag_b64url>.<ct_b64url>
 *
 * AAD binds ciphertext to companyId so envelopes cannot be copied across tenants.
 */
"use strict";

const crypto = require("crypto");

const ENV_KEY = "BUSCOMMAND_SMTP_SECRET_KEY";
const VERSION = 1;
const PREFIX = "bcsmtp1.";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const ALG = "aes-256-gcm";

class SmtpSecretError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "SmtpSecretError";
    this.code = code;
  }
}

function b64urlEncode(buf) {
  return Buffer.from(buf).toString("base64url");
}

function b64urlDecode(str) {
  return Buffer.from(String(str || ""), "base64url");
}

/**
 * Parse key material from env. Accepts base64, base64url, or 64-char hex.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer}
 */
function loadSmtpSecretKey(env = process.env) {
  const raw = String(env[ENV_KEY] || "").trim();
  if (!raw) {
    throw new SmtpSecretError("SMTP_SECRET_KEY_MISSING", `${ENV_KEY} is not configured`);
  }
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    try {
      key = Buffer.from(raw, "base64");
    } catch {
      key = null;
    }
    if (!key || key.length !== KEY_BYTES) {
      try {
        key = Buffer.from(raw, "base64url");
      } catch {
        key = null;
      }
    }
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new SmtpSecretError("SMTP_SECRET_KEY_INVALID", `${ENV_KEY} must be 32 bytes (base64 or 64-hex)`);
  }
  return key;
}

function isEncryptedSmtpSecret(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypt plaintext password for Firestore persistence.
 * @param {string} plaintext
 * @param {string} companyId - bound as AAD
 * @param {{ env?: NodeJS.ProcessEnv, key?: Buffer }} [opts]
 * @returns {string} versioned envelope
 */
function encryptSmtpPassword(plaintext, companyId, opts = {}) {
  const pass = String(plaintext ?? "");
  if (!pass) {
    throw new SmtpSecretError("SMTP_PASSWORD_EMPTY", "SMTP password is empty");
  }
  const tenant = String(companyId || "").trim();
  if (!tenant) {
    throw new SmtpSecretError("SMTP_TENANT_REQUIRED", "companyId required for SMTP encryption");
  }
  const key = opts.key || loadSmtpSecretKey(opts.env || process.env);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  cipher.setAAD(Buffer.from(tenant, "utf8"));
  const ct = Buffer.concat([cipher.update(pass, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${b64urlEncode(iv)}.${b64urlEncode(tag)}.${b64urlEncode(ct)}`;
}

/**
 * Decrypt versioned envelope. Fail-closed on wrong key / tamper / corruption.
 * @param {string} envelope
 * @param {string} companyId
 * @param {{ env?: NodeJS.ProcessEnv, key?: Buffer }} [opts]
 * @returns {string} plaintext password
 */
function decryptSmtpPassword(envelope, companyId, opts = {}) {
  const raw = String(envelope || "");
  if (!isEncryptedSmtpSecret(raw)) {
    throw new SmtpSecretError("SMTP_SECRET_NOT_ENCRYPTED", "value is not an encrypted SMTP envelope");
  }
  const tenant = String(companyId || "").trim();
  if (!tenant) {
    throw new SmtpSecretError("SMTP_TENANT_REQUIRED", "companyId required for SMTP decryption");
  }
  const body = raw.slice(PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 3) {
    throw new SmtpSecretError("SMTP_SECRET_CORRUPT", "encrypted SMTP envelope is malformed");
  }
  let iv;
  let tag;
  let ct;
  try {
    iv = b64urlDecode(parts[0]);
    tag = b64urlDecode(parts[1]);
    ct = b64urlDecode(parts[2]);
  } catch {
    throw new SmtpSecretError("SMTP_SECRET_CORRUPT", "encrypted SMTP envelope is malformed");
  }
  if (iv.length !== IV_BYTES || tag.length !== 16 || ct.length < 1) {
    throw new SmtpSecretError("SMTP_SECRET_CORRUPT", "encrypted SMTP envelope is malformed");
  }
  const key = opts.key || loadSmtpSecretKey(opts.env || process.env);
  try {
    const decipher = crypto.createDecipheriv(ALG, key, iv);
    decipher.setAAD(Buffer.from(tenant, "utf8"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    // Never surface crypto internals or ciphertext.
    throw new SmtpSecretError("SMTP_SECRET_DECRYPT_FAILED", "SMTP secret could not be decrypted");
  }
}

/**
 * Resolve usable plaintext from a stored settings doc (encrypted or legacy plaintext).
 * @param {object|null|undefined} smtpDoc
 * @param {string} companyId
 * @param {{ env?: NodeJS.ProcessEnv, key?: Buffer }} [opts]
 * @returns {{ password: string, needsMigration: boolean }}
 */
function resolveSmtpPasswordFromDoc(smtpDoc, companyId, opts = {}) {
  const stored = smtpDoc?.pass;
  if (stored == null || stored === "") {
    throw new SmtpSecretError("SMTP_PASSWORD_MISSING", "SMTP password is not configured");
  }
  if (isEncryptedSmtpSecret(stored)) {
    return {
      password: decryptSmtpPassword(stored, companyId, opts),
      needsMigration: false
    };
  }
  // Legacy plaintext — readable once for migration.
  return {
    password: String(stored),
    needsMigration: true
  };
}

module.exports = {
  ENV_KEY,
  VERSION,
  PREFIX,
  ALG,
  SmtpSecretError,
  loadSmtpSecretKey,
  isEncryptedSmtpSecret,
  encryptSmtpPassword,
  decryptSmtpPassword,
  resolveSmtpPasswordFromDoc
};
