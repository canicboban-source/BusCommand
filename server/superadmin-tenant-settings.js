/**
 * Super Admin tenant settings patch helpers (§18 / Ch15).
 */
"use strict";

const { z } = require("zod");
const {
  LICENSE_TYPES,
  normalizeLicenseType,
  maxDriversForType,
  maxDispatchersForType
} = require("./license-packages");

const EDITABLE_FEATURE_KEYS = Object.freeze([
  "supportSession",
  "shiftConfirmationScheduler",
  "liveGps",
  "liveMap",
  "sosAlarm",
  "reports",
  "pdfSchedules",
  "excelImport",
  "multiLanguage"
]);

const planEnum = z.enum([
  ...LICENSE_TYPES,
  "trial",
  "standard"
]);

const tenantSettingsPatchSchema = z.object({
  plan: planEnum.optional(),
  licenseType: planEnum.optional(),
  licenseStatus: z.enum(["trial", "active", "expired", "suspended"]).optional(),
  maxDrivers: z.number().int().min(1).max(5000).optional(),
  maxDispatchers: z.number().int().min(1).max(500).optional(),
  trialEndsAt: z.union([
    z.string().trim().min(10).max(40),
    z.null()
  ]).optional(),
  trialValidUntil: z.union([
    z.string().trim().min(10).max(40),
    z.null()
  ]).optional(),
  features: z.record(z.boolean()).optional()
}).refine((body) => Object.keys(body).length > 0, { message: "empty_patch" });

function sanitizeFeaturePatch(features) {
  if (!features || typeof features !== "object") return {};
  const next = {};
  for (const key of EDITABLE_FEATURE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(features, key)) {
      next[key] = features[key] === true;
    }
  }
  return next;
}

function buildTenantSettingsPatch(body, { now = new Date() } = {}) {
  const parsed = tenantSettingsPatchSchema.safeParse(body || {});
  if (!parsed.success) {
    return { ok: false, error: "Nevažeća podešavanja firme.", details: parsed.error.flatten() };
  }
  const data = parsed.data;
  const patch = {};
  const audit = {};

  const rawType = data.licenseType || data.plan;
  if (rawType) {
    const licenseType = normalizeLicenseType(rawType);
    patch.plan = licenseType;
    patch.licenseType = licenseType;
    audit.plan = licenseType;
    audit.licenseType = licenseType;
    if (typeof data.maxDrivers !== "number") {
      const pkgMax = maxDriversForType(licenseType);
      patch.maxDrivers = pkgMax == null ? 5000 : pkgMax;
      audit.maxDrivers = patch.maxDrivers;
    }
    if (typeof data.maxDispatchers !== "number") {
      patch.maxDispatchers = maxDispatchersForType(licenseType);
      audit.maxDispatchers = patch.maxDispatchers;
    }
  }
  if (data.licenseStatus) {
    patch.licenseStatus = data.licenseStatus;
    audit.licenseStatus = data.licenseStatus;
  }
  if (typeof data.maxDrivers === "number") {
    patch.maxDrivers = data.maxDrivers;
    audit.maxDrivers = data.maxDrivers;
  }
  if (typeof data.maxDispatchers === "number") {
    patch.maxDispatchers = data.maxDispatchers;
    audit.maxDispatchers = data.maxDispatchers;
  }
  const trialRaw = Object.prototype.hasOwnProperty.call(data, "trialValidUntil")
    ? data.trialValidUntil
    : Object.prototype.hasOwnProperty.call(data, "trialEndsAt")
      ? data.trialEndsAt
      : undefined;
  if (trialRaw !== undefined) {
    if (trialRaw == null || trialRaw === "") {
      patch.trialEndsAt = null;
      patch.trialValidUntil = null;
      audit.trialEndsAt = null;
      audit.trialValidUntil = null;
    } else {
      const date = new Date(trialRaw);
      if (Number.isNaN(date.getTime())) {
        return { ok: false, error: "Nevažeći datum isteka trial-a." };
      }
      patch.trialEndsAt = date;
      patch.trialValidUntil = date;
      audit.trialEndsAt = date.toISOString();
      audit.trialValidUntil = date.toISOString();
    }
  }
  if (data.features) {
    const features = sanitizeFeaturePatch(data.features);
    if (Object.keys(features).length) {
      patch.features = features;
      audit.features = features;
    }
  }
  if (!Object.keys(patch).length) {
    return { ok: false, error: "Nema dozvoljenih polja za izmenu." };
  }
  audit.patchedAt = now.toISOString();
  return { ok: true, patch, audit };
}

function applyTenantSettingsPatch(existing, patch, { adminTimestampFromDate }) {
  const next = { ...(existing || {}) };
  if (patch.plan) next.plan = patch.plan;
  if (patch.licenseType) next.licenseType = patch.licenseType;
  if (patch.licenseStatus) next.licenseStatus = patch.licenseStatus;
  if (typeof patch.maxDrivers === "number") next.maxDrivers = patch.maxDrivers;
  if (typeof patch.maxDispatchers === "number") next.maxDispatchers = patch.maxDispatchers;
  if (Object.prototype.hasOwnProperty.call(patch, "trialEndsAt")) {
    const stamp = patch.trialEndsAt ? adminTimestampFromDate(patch.trialEndsAt) : null;
    next.trialEndsAt = stamp;
    next.trialValidUntil = stamp;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "trialValidUntil")
    && !Object.prototype.hasOwnProperty.call(patch, "trialEndsAt")) {
    next.trialValidUntil = patch.trialValidUntil
      ? adminTimestampFromDate(patch.trialValidUntil)
      : null;
    next.trialEndsAt = next.trialValidUntil;
  }
  if (patch.features) {
    next.features = { ...(existing?.features || {}), ...patch.features };
  }
  return next;
}

module.exports = {
  EDITABLE_FEATURE_KEYS,
  tenantSettingsPatchSchema,
  sanitizeFeaturePatch,
  buildTenantSettingsPatch,
  applyTenantSettingsPatch
};
