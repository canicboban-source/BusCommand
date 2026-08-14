/* BusCommand driver PWA — shell cache only (Ch13 / §15)
 * Scope is registered as /driver.html so staff surfaces stay out of SW control.
 * Fetch allowlist must stay aligned with server/driver-sw-policy.js
 */
const CACHE = "buscommand-driver-v2";
const PRECACHE = [
  "/driver.html",
  "/manifest-driver.webmanifest",
  "/css/design-tokens.css",
  "/css/brand.css",
  "/css/driver-pwa.css",
  "/style.css",
  "/icons/driver-192.png",
  "/icons/driver-512.png"
];

function normalizePathname(pathname) {
  if (!pathname) return "";
  const clean = String(pathname).split("?")[0].split("#")[0];
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

function isDriverShellPath(pathname) {
  const path = normalizePathname(pathname);
  const exact = new Set(PRECACHE.concat([
    "/sw-driver.js",
    "/brand/logo-mark.png",
    "/brand/logo-mark.svg",
    "/brand/logo-full.svg",
    "/brand/logo-icon-512.png"
  ]));
  if (exact.has(path)) return true;
  if (path.startsWith("/icons/driver-")) return true;
  if (path.startsWith("/brand/")) return true;
  if (path.startsWith("/assets/") && /(^|[-/])(driver|shell-driver)([-.]|$)/i.test(path)) return true;
  return false;
}

function shouldHandle(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  const path = normalizePathname(url.pathname);
  if (path.startsWith("/api/")) return false;
  if (path === "/staff.html" || path.startsWith("/staff")) return false;
  if (path === "/index.html" || path === "/" || path === "") return false;
  return isDriverShellPath(path);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (!shouldHandle(req)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
      // Network-first for HTML shell so version bumps land; cache as fallback.
      const path = normalizePathname(new URL(req.url).pathname);
      if (path === "/driver.html") {
        return network.then((res) => res || cached).catch(() => cached);
      }
      return cached || network;
    })
  );
});
