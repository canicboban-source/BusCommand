/**
 * Driver live location helpers (§13 / Ch12).
 * liveGps defaults OFF. Retention (O2) is open — no historical trail is stored.
 */
"use strict";

const LOCATION_MIN_INTERVAL_MS = 30_000;
const LOCATION_MAX_AGE_MS = 5 * 60_000;
const COORD_PRECISION = 5; // ~1.1 m — operational, not survey-grade

function isLiveGpsEnabled(settingsMain) {
  return settingsMain?.features?.liveGps === true;
}

function sanitizeCoordinate(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  const factor = 10 ** COORD_PRECISION;
  return Math.round(number * factor) / factor;
}

function sanitizeLocationPayload(body = {}, now = new Date()) {
  const lat = sanitizeCoordinate(body.lat ?? body.latitude, -90, 90);
  const lng = sanitizeCoordinate(body.lng ?? body.longitude, -180, 180);
  if (lat === null || lng === null) {
    return { ok: false, reason: "invalid_coordinates" };
  }
  const accuracy = Number(body.accuracy);
  const recordedAt = body.recordedAt ? new Date(body.recordedAt) : now;
  if (Number.isNaN(recordedAt.getTime())) {
    return { ok: false, reason: "invalid_recorded_at" };
  }
  if (recordedAt.getTime() > now.getTime() + 60_000) {
    return { ok: false, reason: "future_timestamp" };
  }
  if (now.getTime() - recordedAt.getTime() > LOCATION_MAX_AGE_MS) {
    return { ok: false, reason: "stale_sample" };
  }
  return {
    ok: true,
    location: {
      lat,
      lng,
      accuracy: Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 5000
        ? Math.round(accuracy)
        : null,
      recordedAt: recordedAt.toISOString(),
      // Current point only — never a trail (O2 retention still open).
      purpose: "active_shift_ops"
    }
  };
}

function shouldAcceptLocationSample(previous, now = new Date(), minIntervalMs = LOCATION_MIN_INTERVAL_MS) {
  if (!previous?.updatedAt && !previous?.recordedAt) return true;
  const prior = new Date(previous.updatedAt || previous.recordedAt);
  if (Number.isNaN(prior.getTime())) return true;
  return now.getTime() - prior.getTime() >= minIntervalMs;
}

function publicLastLocation(location) {
  if (!location || typeof location !== "object") return null;
  const lat = sanitizeCoordinate(location.lat ?? location.latitude, -90, 90);
  const lng = sanitizeCoordinate(location.lng ?? location.longitude, -180, 180);
  if (lat === null || lng === null) return null;
  return {
    lat,
    lng,
    accuracy: location.accuracy ?? null,
    recordedAt: location.recordedAt || location.updatedAt || null
  };
}

/** Pre-shift login reminder stub (§14) — no push provider yet. */
function buildLoginReminderStub({ policy, now = new Date() } = {}) {
  if (!policy || policy.status === "active" || policy.status === "grace") {
    return null;
  }
  const startIso = policy?.nextShift?.startAt || policy?.upcomingShift?.startAt || null;
  if (!startIso) return null;
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return null;
  const minutesUntil = Math.round((startMs - now.getTime()) / 60_000);
  if (minutesUntil < 0 || minutesUntil > 180) return null;
  return {
    kind: "login_reminder_stub",
    channel: "none",
    minutesUntil,
    shiftStartsAt: startIso,
    status: "not_dispatched"
  };
}

module.exports = {
  LOCATION_MIN_INTERVAL_MS,
  LOCATION_MAX_AGE_MS,
  COORD_PRECISION,
  isLiveGpsEnabled,
  sanitizeLocationPayload,
  shouldAcceptLocationSample,
  publicLastLocation,
  buildLoginReminderStub
};
