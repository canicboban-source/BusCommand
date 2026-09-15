/**
 * Tenant SMTP settings persistence helpers (WIDE-37).
 * Encrypts password at rest; migrates legacy plaintext; strips secrets from API views.
 */
"use strict";

const {
  encryptSmtpPassword,
  resolveSmtpPasswordFromDoc,
  isEncryptedSmtpSecret,
  SmtpSecretError
} = require("./smtp-secret-crypto");

/**
 * Build Firestore document payload for CA SMTP save (password always encrypted).
 * @param {object} fields - validated { host, port, user, pass, from, enabled }
 * @param {string} companyId
 * @param {string} actorUid
 * @param {{ env?: NodeJS.ProcessEnv, key?: Buffer, now?: () => string }} [opts]
 */
function buildEncryptedSmtpSettingsDoc(fields, companyId, actorUid, opts = {}) {
  const encrypted = encryptSmtpPassword(fields.pass, companyId, opts);
  return {
    host: fields.host,
    port: fields.port,
    user: fields.user,
    pass: encrypted,
    from: fields.from,
    enabled: Boolean(fields.enabled),
    updatedAt: (opts.now || (() => new Date().toISOString()))(),
    updatedBy: actorUid
  };
}

/**
 * Public API shape — never includes pass / ciphertext.
 * @param {object|null|undefined} data
 */
function toPublicSmtpSettings(data) {
  if (!data || typeof data !== "object") return null;
  const hasPassword = Boolean(data.pass);
  return {
    host: data.host ?? null,
    port: data.port ?? null,
    user: data.user ?? null,
    from: data.from ?? null,
    enabled: Boolean(data.enabled),
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
    hasPassword,
    passwordEncrypted: hasPassword ? isEncryptedSmtpSecret(data.pass) : false
  };
}

/**
 * Audit metadata for SMTP updates — never includes password or ciphertext.
 */
function smtpAuditMeta({ host, port, from, enabled, pass }) {
  return {
    host,
    port,
    from,
    enabled: Boolean(enabled),
    hasPassword: Boolean(pass)
  };
}

/**
 * Resolve smtp config for sending: decrypt (or accept legacy plaintext) and
 * optionally return a migrated encrypted doc for rewrite.
 * @returns {{ smtp: object, migrateDoc: object|null }}
 */
function prepareSmtpForSend(smtpDoc, companyId, opts = {}) {
  if (!smtpDoc || !smtpDoc.enabled || !smtpDoc.host) {
    return { smtp: null, migrateDoc: null };
  }
  let resolved;
  try {
    resolved = resolveSmtpPasswordFromDoc(smtpDoc, companyId, opts);
  } catch (err) {
    if (err instanceof SmtpSecretError) {
      return { smtp: null, migrateDoc: null, error: err };
    }
    throw err;
  }
  const smtp = {
    host: smtpDoc.host,
    port: smtpDoc.port,
    user: smtpDoc.user,
    pass: resolved.password,
    from: smtpDoc.from,
    enabled: smtpDoc.enabled
  };
  let migrateDoc = null;
  if (resolved.needsMigration) {
    migrateDoc = {
      ...smtpDoc,
      pass: encryptSmtpPassword(resolved.password, companyId, opts),
      migratedAt: (opts.now || (() => new Date().toISOString()))(),
      migratedFrom: "plaintext"
    };
  }
  return { smtp, migrateDoc };
}

module.exports = {
  buildEncryptedSmtpSettingsDoc,
  toPublicSmtpSettings,
  smtpAuditMeta,
  prepareSmtpForSend,
  SmtpSecretError
};
