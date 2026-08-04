/**
 * Lost-item lifecycle helpers (§16 / Ch14).
 */
"use strict";

const LOST_ITEM_STATUSES = Object.freeze(["in_depot", "stays_on_bus", "returned"]);
const DRIVER_CREATE_STATUSES = Object.freeze(["in_depot", "stays_on_bus"]);
const OPEN_STATUSES = Object.freeze(["in_depot", "stays_on_bus"]);

const LEGACY_STATUS_MAP = Object.freeze({
  status_in_depot: "in_depot",
  "U depou": "in_depot",
  "Im Depot": "in_depot",
  status_returned: "returned",
  returned_to_owner: "returned",
  stays_on_bus: "stays_on_bus",
  in_depot: "in_depot",
  returned: "returned"
});

const PHOTO_MAX_BYTES = 350_000;
const PHOTO_ALLOWED = Object.freeze({
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47]
});

function normalizeLostItemStatus(value) {
  if (typeof value !== "string") return null;
  const key = value.trim();
  return LEGACY_STATUS_MAP[key] || (LOST_ITEM_STATUSES.includes(key) ? key : null);
}

function isOpenLostItemStatus(status) {
  return OPEN_STATUSES.includes(normalizeLostItemStatus(status));
}

function canTransitionLostItemStatus(from, to) {
  const current = normalizeLostItemStatus(from);
  const next = normalizeLostItemStatus(to);
  if (!current || !next) return false;
  if (current === next) return true;
  if (current === "returned") return false;
  if (next === "returned") return isOpenLostItemStatus(current);
  if (OPEN_STATUSES.includes(next) && OPEN_STATUSES.includes(current)) return true;
  return false;
}

function buildFoundAtFields({ clientCreatedAt = null, date = null, time = null, now = new Date() } = {}) {
  let foundAt = null;
  if (clientCreatedAt) {
    const parsed = new Date(clientCreatedAt);
    if (!Number.isNaN(parsed.getTime())) foundAt = parsed.toISOString();
  }
  if (!foundAt && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const hhmm = typeof time === "string" && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "12:00";
    const parsed = new Date(`${date}T${hhmm}:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) foundAt = parsed.toISOString();
  }
  if (!foundAt) foundAt = now.toISOString();
  const foundDate = foundAt.slice(0, 10);
  const foundTime = foundAt.slice(11, 16);
  return {
    foundAt,
    date: foundDate,
    time: foundTime
  };
}

function looksLikeJpegWithExif(buffer) {
  // APP1 marker 0xFFE1 commonly carries EXIF — reject as defense in depth.
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  for (let i = 0; i < Math.min(buffer.length - 1, 128 * 1024); i += 1) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xe1) return true;
  }
  return false;
}

function validateLostItemPhoto(photo) {
  if (photo == null || photo === "") return { ok: true, photo: null };
  if (typeof photo !== "object") return { ok: false, reason: "invalid_photo" };
  const contentType = String(photo.contentType || "").toLowerCase();
  const magic = PHOTO_ALLOWED[contentType];
  if (!magic) return { ok: false, reason: "unsupported_type" };
  const raw = String(photo.dataBase64 || photo.base64 || "").replace(/\s+/g, "");
  if (!raw || raw.length > Math.ceil(PHOTO_MAX_BYTES * 1.4)) {
    return { ok: false, reason: "too_large" };
  }
  let buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    return { ok: false, reason: "invalid_base64" };
  }
  if (!buffer.length || buffer.length > PHOTO_MAX_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  for (let i = 0; i < magic.length; i += 1) {
    if (buffer[i] !== magic[i]) return { ok: false, reason: "magic_mismatch" };
  }
  if (contentType === "image/jpeg" && looksLikeJpegWithExif(buffer)) {
    return { ok: false, reason: "exif_present" };
  }
  return {
    ok: true,
    photo: {
      contentType,
      sizeBytes: buffer.length,
      dataBase64: buffer.toString("base64")
    }
  };
}

function publicLostItemPhoto(photo) {
  if (!photo || typeof photo !== "object") return null;
  if (!photo.contentType || !photo.dataBase64) return null;
  return {
    contentType: photo.contentType,
    sizeBytes: photo.sizeBytes || null,
    dataUrl: `data:${photo.contentType};base64,${photo.dataBase64}`
  };
}

module.exports = {
  LOST_ITEM_STATUSES,
  DRIVER_CREATE_STATUSES,
  OPEN_STATUSES,
  PHOTO_MAX_BYTES,
  normalizeLostItemStatus,
  isOpenLostItemStatus,
  canTransitionLostItemStatus,
  buildFoundAtFields,
  validateLostItemPhoto,
  publicLostItemPhoto,
  looksLikeJpegWithExif
};
