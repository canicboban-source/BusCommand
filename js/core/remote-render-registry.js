/**
 * Explicit remote-render registry.
 * Surfaces register already-bundled functions. firebase-service never
 * dynamic-imports UI modules by path.
 */

export const CA_DASH = "renderCompanyAdminDashboard";
export const CA_DRV = "renderCompanyAdminDrivers";
export const DISPO_SHIFTS = "renderDispatcherShifts";
export const DISPO_DASH = "renderDispatcherDashboard";
export const DISPO_MAP = "updateMapMarkers";
export const DISPO_REP = "renderDispatcherReports";
export const DRV_MSG = "renderDriverMessages";
export const DRV_DASH = "renderDriverDashboard";

const ALLOWED = new Set([
  CA_DASH,
  CA_DRV,
  DISPO_SHIFTS,
  DISPO_DASH,
  DISPO_MAP,
  DISPO_REP,
  DRV_MSG,
  DRV_DASH
]);
const callbacks = new Map();

export function registerRemoteRenderCallback(name, fn) {
  if (!ALLOWED.has(name)) {
    throw new Error("Remote render callback name is not allowed");
  }
  if (typeof fn !== "function") {
    throw new Error("Remote render callback must be a function");
  }
  callbacks.set(name, fn);
}

export function registerRemoteRenderCallbacks(map) {
  if (!map || typeof map !== "object") return;
  for (const name of Object.keys(map)) {
    registerRemoteRenderCallback(name, map[name]);
  }
}

export function invokeRemoteRender(name, ...args) {
  const fn = ALLOWED.has(name) ? callbacks.get(name) : undefined;
  if (typeof fn !== "function") {
    console.warn("Firebase render callback missing:", name);
    return;
  }
  try {
    fn(...args);
  } catch (err) {
    console.warn("Firebase render callback failed:", name, err && err.name ? err.name : "error");
  }
}

export function resetRemoteRenderRegistryForTests() {
  callbacks.clear();
}
