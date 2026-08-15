/**
 * Driver activation OTP — crypto-secure 6-digit codes, 24h TTL, bcrypt at rest.
 * Plaintext codes exist only ephemerally for SMS send / unit tests.
 */
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const ACTIVATION_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_DIGITS = 6;
const PERSONAL_CODE_RE = /^\d{5,12}$/;
const OTP_RE = /^\d{6}$/;

function generateActivationOtp() {
  const n = crypto.randomInt(0, 10 ** OTP_DIGITS);
  return String(n).padStart(OTP_DIGITS, "0");
}

function activationExpiresAt(from = new Date()) {
  return new Date(from.getTime() + ACTIVATION_TTL_MS);
}

function toExpiryDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActivationExpired(credentials, now = new Date()) {
  const expires = toExpiryDate(credentials?.activationExpiresAt);
  return !expires || expires.getTime() <= now.getTime();
}

function isActivationConsumed(credentials) {
  return Boolean(credentials?.activationUsedAt);
}

async function hashSecret(value, cost) {
  return bcrypt.hash(String(value), cost);
}

async function verifyActivationOtp(credentials, otp, now = new Date()) {
  if (!credentials?.activationCodeHash) return false;
  if (isActivationConsumed(credentials)) return false;
  if (isActivationExpired(credentials, now)) return false;
  if (!OTP_RE.test(String(otp || "").trim())) return false;
  return bcrypt.compare(String(otp).trim(), credentials.activationCodeHash);
}

function isValidPersonalLoginCode(code) {
  return PERSONAL_CODE_RE.test(String(code || "").trim());
}

module.exports = {
  ACTIVATION_TTL_MS,
  OTP_DIGITS,
  PERSONAL_CODE_RE,
  OTP_RE,
  generateActivationOtp,
  activationExpiresAt,
  toExpiryDate,
  isActivationExpired,
  isActivationConsumed,
  hashSecret,
  verifyActivationOtp,
  isValidPersonalLoginCode
};
