/**
 * Expiry-notification SMTP adapter (WIDE-37).
 * Decrypts tenant SMTP via the same helpers as confirmation dispatch;
 * never persists decrypted plaintext.
 */
"use strict";

const { isEncryptedSmtpSecret, SmtpSecretError } = require("./smtp-secret-crypto");
const {
  prepareSmtpForSend,
  migrateLegacySmtpPasswordIfUnchanged
} = require("./smtp-settings");

function legacyPlaintextSmtp(smtpDoc) {
  const stored = smtpDoc?.pass;
  if (typeof stored !== "string" || !stored || isEncryptedSmtpSecret(stored)) return null;
  if (!smtpDoc.enabled || !smtpDoc.host) return null;
  return {
    host: smtpDoc.host,
    port: smtpDoc.port,
    user: smtpDoc.user,
    pass: stored,
    from: smtpDoc.from,
    enabled: smtpDoc.enabled
  };
}

/**
 * Prepare in-memory SMTP for expiry send.
 * Encrypted envelopes are decrypted; legacy plaintext is CAS-migrated when possible.
 *
 * @returns {Promise<{ smtp: object|null, error: Error|null }>}
 */
async function resolveExpirySmtpForSend({
  firestore,
  smtpRef,
  smtpDoc,
  companyId,
  opts = {}
}) {
  let prepared;
  try {
    prepared = prepareSmtpForSend(smtpDoc, companyId, opts);
  } catch (err) {
    if (err instanceof SmtpSecretError) {
      // Missing key while still holding legacy plaintext: send, skip rewrite.
      return { smtp: legacyPlaintextSmtp(smtpDoc), error: err };
    }
    throw err;
  }

  if (prepared.migrateDoc) {
    try {
      await migrateLegacySmtpPasswordIfUnchanged(
        firestore,
        smtpRef,
        smtpDoc.pass,
        prepared.migrateDoc
      );
    } catch {
      /* migration rewrite best-effort; in-memory send may still proceed */
    }
  }

  if (!prepared.smtp?.pass || !prepared.smtp?.host) {
    return { smtp: null, error: prepared.error || null };
  }
  return { smtp: prepared.smtp, error: null };
}

module.exports = {
  resolveExpirySmtpForSend
};
