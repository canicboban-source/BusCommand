/**
 * BusCommand license packages (Ultimate v3.1 Phase 2).
 * MICRO 8 · STARTER 15 · PRO 50 · FLEET MASTER 200 · ENTERPRISE unlimited
 */
"use strict";

const LICENSE_TYPES = Object.freeze(["micro", "starter", "pro", "fleet_master", "enterprise"]);

const PACKAGES = Object.freeze({
  micro: { licenseType: "micro", maxDrivers: 8, maxDispatchers: 1, maxBuses: 5, label: "MICRO" },
  starter: { licenseType: "starter", maxDrivers: 15, maxDispatchers: 2, maxBuses: 8, label: "STARTER" },
  pro: { licenseType: "pro", maxDrivers: 50, maxDispatchers: 5, maxBuses: 25, label: "PRO" },
  fleet_master: { licenseType: "fleet_master", maxDrivers: 200, maxDispatchers: 15, maxBuses: 100, label: "FLEET MASTER" },
  enterprise: { licenseType: "enterprise", maxDrivers: null, maxDispatchers: 50, maxBuses: null, label: "ENTERPRISE" }
});

/** Map legacy plan values → package type. */
function normalizeLicenseType(raw) {
  const value = String(raw || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (LICENSE_TYPES.includes(value)) return value;
  if (value === "standard" || value === "trial") return "pro";
  if (value === "fleet" || value === "fleetmaster") return "fleet_master";
  return "pro";
}

function packageForType(licenseType) {
  return PACKAGES[normalizeLicenseType(licenseType)] || PACKAGES.pro;
}

function maxDriversForType(licenseType) {
  return packageForType(licenseType).maxDrivers;
}

function maxDispatchersForType(licenseType) {
  const pkg = packageForType(licenseType);
  return pkg.maxDispatchers != null ? pkg.maxDispatchers : 50;
}

/** Informational only — not enforced server-side on bus creation. */
function maxBusesForType(licenseType) {
  const pkg = packageForType(licenseType);
  return pkg.maxBuses != null ? pkg.maxBuses : 2000;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") {
    try { return value.toMillis(); } catch { /* fall through */ }
  }
  if (typeof value.toDate === "function") {
    try { return value.toDate().getTime(); } catch { /* fall through */ }
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Derive licenseStatus + days from settings doc (supports legacy plan/trialEndsAt).
 * @returns {{
 *   licenseType: string,
 *   licenseStatus: "trial"|"active"|"expired"|"suspended",
 *   trialValidUntil: string|null,
 *   plan: string,
 *   maxDrivers: number|null,
 *   daysRemaining: number|null,
 *   packageLabel: string
 * }}
 */
function resolveLicenseSnapshot(settings = {}, { now = Date.now() } = {}) {
  const licenseType = normalizeLicenseType(settings.licenseType || settings.plan);
  const pkg = packageForType(licenseType);
  const maxDrivers = Object.prototype.hasOwnProperty.call(settings, "maxDrivers")
    && settings.maxDrivers != null
    ? Number(settings.maxDrivers)
    : pkg.maxDrivers;
  const trialMs = toMillis(settings.trialValidUntil || settings.trialEndsAt);
  const trialValidUntil = trialMs != null ? new Date(trialMs).toISOString() : null;
  const statusRaw = String(settings.status || settings.licenseStatus || "active").toLowerCase();

  let licenseStatus = "active";
  let daysRemaining = null;

  const explicitStatus = String(settings.licenseStatus || "").toLowerCase();
  const legacyTrialPlan = String(settings.plan || "").toLowerCase() === "trial";

  if (statusRaw === "suspended" || explicitStatus === "suspended") {
    licenseStatus = "suspended";
  } else if (explicitStatus === "expired") {
    licenseStatus = "expired";
    daysRemaining = 0;
  } else if (explicitStatus === "trial" || legacyTrialPlan) {
    if (trialMs != null && trialMs < now) {
      licenseStatus = "expired";
      daysRemaining = 0;
    } else {
      licenseStatus = "trial";
      daysRemaining = trialMs != null ? Math.max(0, Math.ceil((trialMs - now) / 86400000)) : null;
    }
  } else {
    licenseStatus = "active";
    const subEnd = toMillis(settings.billing?.currentPeriodEnd);
    if (subEnd != null) {
      daysRemaining = Math.max(0, Math.ceil((subEnd - now) / 86400000));
      if (subEnd < now) licenseStatus = "expired";
    } else if (trialMs != null && explicitStatus !== "active") {
      // Legacy docs with trialEndsAt but no licenseStatus stay on trial countdown.
      if (trialMs < now) {
        licenseStatus = "expired";
        daysRemaining = 0;
      } else {
        licenseStatus = "trial";
        daysRemaining = Math.max(0, Math.ceil((trialMs - now) / 86400000));
      }
    }
  }

  return {
    licenseType,
    licenseStatus,
    trialValidUntil,
    plan: licenseType,
    maxDrivers: Number.isFinite(maxDrivers) ? maxDrivers : null,
    daysRemaining,
    packageLabel: pkg.label
  };
}

function defaultTrialEnd(days = 30) {
  const end = new Date();
  end.setDate(end.getDate() + days);
  return end;
}

function buildNewCompanyLicenseFields({ licenseType = "pro", admin, trialDays = 30, maxBuses } = {}) {
  const type = normalizeLicenseType(licenseType);
  const pkg = packageForType(type);
  const trialEnd = defaultTrialEnd(trialDays);
  const maxDrivers = pkg.maxDrivers == null ? 5000 : pkg.maxDrivers;
  const resolvedMaxBuses = Number.isInteger(maxBuses) && maxBuses > 0
    ? maxBuses
    : maxBusesForType(type);
  return {
    plan: type,
    licenseType: type,
    licenseStatus: "trial",
    status: "active",
    maxDrivers,
    maxDispatchers: maxDispatchersForType(type),
    maxBuses: resolvedMaxBuses,
    trialEndsAt: admin.firestore.Timestamp.fromDate(trialEnd),
    trialValidUntil: admin.firestore.Timestamp.fromDate(trialEnd)
  };
}

module.exports = {
  LICENSE_TYPES,
  PACKAGES,
  normalizeLicenseType,
  packageForType,
  maxDriversForType,
  maxDispatchersForType,
  maxBusesForType,
  resolveLicenseSnapshot,
  buildNewCompanyLicenseFields,
  defaultTrialEnd
};
