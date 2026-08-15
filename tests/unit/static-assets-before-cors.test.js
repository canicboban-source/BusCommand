const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SRC = fs.readFileSync(path.join(__dirname, "../../api-server.js"), "utf8");

/**
 * Live 403 regression: hashed /assets/*.js are fetched by <script type="module">
 * and <link rel="modulepreload"> in CORS mode. When the CORS gate ran first, a
 * surface host missing from CORS_ORIGINS got 403 application/json instead of
 * JavaScript, which the browser surfaces as a MIME-type error.
 */
test("public static assets are mounted before the CORS gate", () => {
  const assetsMount = SRC.indexOf('app.use("/assets", express.static(');
  const rootStaticMount = SRC.indexOf("app.use(express.static(STATIC_DIR");
  const corsGate = SRC.indexOf("app.use(cors({");

  assert.ok(assetsMount > 0, "/assets static mount missing");
  assert.ok(rootStaticMount > 0, "root static mount missing");
  assert.ok(corsGate > 0, "cors gate missing");
  assert.ok(assetsMount < corsGate, "/assets must be served before the CORS gate");
  assert.ok(rootStaticMount < corsGate, "dist/ static must be served before the CORS gate");
});

test("static mounts resolve before any auth middleware is constructed", () => {
  const rootStaticMount = SRC.indexOf("app.use(express.static(STATIC_DIR");
  for (const marker of ["createRequireSuperAdmin({", "createStaffAuth({"]) {
    const at = SRC.indexOf(marker);
    assert.ok(at > 0, `${marker} missing`);
    assert.ok(rootStaticMount < at, `static must be mounted before ${marker}`);
  }
});

test("hashed build output is readable cross-origin and stays immutable", () => {
  assert.match(SRC, /Access-Control-Allow-Origin["']?,\s*["']\*["']/);
  assert.match(SRC, /Cross-Origin-Resource-Policy["']?,\s*["']cross-origin["']/);
  assert.match(SRC, /public, max-age=31536000, immutable/);
});

test("host labels map to driver / staff / landing shells", () => {
  assert.match(SRC, /const DRIVER_HOST_LABELS = new Set\(\["d", "driver"\]\)/);
  assert.match(SRC, /const STAFF_HOST_LABELS = new Set\(\["app"\]\)/);
  assert.match(SRC, /function isDriverHost/);
  assert.match(SRC, /function isStaffAppHost/);
  assert.match(SRC, /function sendLandingApp/);
  assert.match(SRC, /function sendSurfaceForHost/);
  // `/` and the HTML catch-all must both go through host resolution.
  assert.match(SRC, /app\.get\(\["\/", "\/index\.html"\], \(req, res\) => sendSurfaceForHost\(req, res\)\)/);
  // app. → staff; d./driver. → driver; otherwise landing (www / apex / localhost).
  assert.match(SRC, /if \(isDriverHost\(req\)\) return sendDriverApp\(res\);/);
  assert.match(SRC, /if \(isStaffAppHost\(req\)\) return sendStaffApp\(res\);/);
  assert.match(SRC, /return sendLandingApp\(res\);/);
});

test("host routing matches the leftmost label only, never a hardcoded domain", () => {
  // Keeps the no-production-host-in-source contract from cors-local-assets.test.js.
  assert.doesNotMatch(SRC, /app\.buscommand\.com/);
  assert.doesNotMatch(SRC, /d\.buscommand\.com/);
  assert.match(SRC, /leftmostHostLabel|host\.split\(":"\)\[0\]\.split\("\."\)\[0\]/);
});

test("render.yaml allowlists every browser-facing surface host", () => {
  const render = fs.readFileSync(path.join(__dirname, "../../render.yaml"), "utf8");
  const line = render.split(/\r?\n/).find((l) => l.includes("https://buscommand.com"));
  assert.ok(line, "CORS_ORIGINS value missing");
  for (const origin of ["https://app.buscommand.com", "https://d.buscommand.com"]) {
    assert.ok(line.includes(origin), `${origin} must be in CORS_ORIGINS`);
  }
  assert.doesNotMatch(line, /\*/, "CORS_ORIGINS must not contain wildcards");
});
