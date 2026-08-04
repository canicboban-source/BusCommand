/**
 * Driver service-worker allowlist (§15 / Ch13).
 * Keep `public/sw-driver.js` in sync with these rules.
 */
"use strict";

const DRIVER_SW_CACHE = "buscommand-driver-v2";

const DRIVER_SHELL_PATHS = new Set([
  "/driver.html",
  "/manifest-driver.webmanifest",
  "/sw-driver.js",
  "/css/design-tokens.css",
  "/css/brand.css",
  "/css/driver-pwa.css",
  "/style.css",
  "/icons/driver-192.png",
  "/icons/driver-512.png",
  "/brand/logo-mark.png",
  "/brand/logo-mark.svg",
  "/brand/logo-full.svg",
  "/brand/logo-icon-512.png"
]);

function normalizePathname(pathname) {
  if (!pathname || typeof pathname !== "string") return "";
  const clean = pathname.split("?")[0].split("#")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function isDriverShellPath(pathname) {
  const path = normalizePathname(pathname);
  if (DRIVER_SHELL_PATHS.has(path)) return true;
  if (path.startsWith("/icons/driver-")) return true;
  if (path.startsWith("/brand/")) return true;
  if (path.startsWith("/assets/") && /(^|[-/])(driver|shell-driver)([-.]|$)/i.test(path)) return true;
  return false;
}

function shouldHandleDriverSwFetch(url, method = "GET") {
  if (String(method || "GET").toUpperCase() !== "GET") return false;
  let parsed;
  try {
    parsed = typeof url === "string" ? new URL(url, "https://buscommand.local") : new URL(url);
  } catch {
    return false;
  }
  const path = normalizePathname(parsed.pathname);
  if (path.startsWith("/api/")) return false;
  if (path === "/staff.html" || path.startsWith("/staff")) return false;
  if (path === "/index.html" || path === "/" || path === "") return false;
  return isDriverShellPath(path);
}

module.exports = {
  DRIVER_SW_CACHE,
  DRIVER_SHELL_PATHS,
  normalizePathname,
  isDriverShellPath,
  shouldHandleDriverSwFetch
};
