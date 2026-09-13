/**
 * Explicit remote-render registry.
 * Surfaces register already-bundled functions. firebase-service never
 * dynamic-imports UI modules by path.
 */

export const REMOTE_RENDER_CALLBACK_NAMES = Object.freeze([
  "renderCompanyAdminDashboard",
  "renderCompanyAdminDrivers",
  "renderDispatcherShifts",
  "renderDispatcherDashboard",
  "updateMapMarkers",
  "renderDispatcherReports",
  "renderDriverMessages",
  "renderDriverDashboard"
]);

const ALLOWED = new Set(REMOTE_RENDER_CALLBACK_NAMES);
const callbacks = new Map();

function assertAllowedName(name) {
  if (!ALLOWED.has(name)) {
    throw new Error(`Remote render callback name is not allowed: ${String(name || "")}`);
  }
}

export function registerRemoteRenderCallback(name, fn) {
  assertAllowedName(name);
  if (typeof fn !== "function") {
    throw new Error("Remote render callback must be a function");
  }
  callbacks.set(name, fn);
}

export function registerRemoteRenderCallbacks(map) {
  const entries = map && typeof map === "object" ? Object.entries(map) : [];
  for (const [name, fn] of entries) {
    registerRemoteRenderCallback(name, fn);
  }
}

export function invokeRemoteRender(name, ...args) {
  if (!ALLOWED.has(name)) {
    console.warn("Firebase render callback missing:", name);
    return;
  }
  const fn = callbacks.get(name);
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
