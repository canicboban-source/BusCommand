/**
 * Super Admin tenant settings patch helpers (§18 / Ch15).
 */
"use strict";

const { z } = require("zod");

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

const tenantSettingsPatchSchema = z.object({
  plan: z.enum(["trial", "standard", "enterprise"]).optional(),
  maxDrivers: z.number().int().min(1).max(5000).optional(),
  maxDispatchers: z.number().int().min(1).max(500).optional(),
  trialEndsAt: z.union([
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

  if (data.plan) {
    patch.plan = data.plan;
    audit.plan = data.plan;
  }
  if (typeof data.maxDrivers === "number") {
    patch.maxDrivers = data.maxDrivers;
    audit.maxDrivers = data.maxDrivers;
  }
  if (typeof data.maxDispatchers === "number") {
    patch.maxDispatchers = data.maxDispatchers;
    audit.maxDispatchers = data.maxDispatchers;
  }
  if (Object.prototype.hasOwnProperty.call(data, "trialEndsAt")) {
    if (data.trialEndsAt == null || data.trialEndsAt === "") {
      patch.trialEndsAt = null;
      audit.trialEndsAt = null;
    } else {
      const date = new Date(data.trialEndsAt);
      if (Number.isNaN(date.getTime())) {
        return { ok: false, error: "Nevažeći datum isteka trial-a." };
      }
      // Allow past dates (SA may end trial immediately).
      patch.trialEndsAt = date;
      audit.trialEndsAt = date.toISOString();
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
  if (typeof patch.maxDrivers === "number") next.maxDrivers = patch.maxDrivers;
  if (typeof patch.maxDispatchers === "number") next.maxDispatchers = patch.maxDispatchers;
  if (Object.prototype.hasOwnProperty.call(patch, "trialEndsAt")) {
    next.trialEndsAt = patch.trialEndsAt
      ? adminTimestampFromDate(patch.trialEndsAt)
      : null;
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
