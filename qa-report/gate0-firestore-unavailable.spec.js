// Gate 0 — Firestore emulator unavailable (Auth emulator still real/available).
// Must fail locally, truthfully, with zero production fallback and zero mutation.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const FORBIDDEN = [/googleapis\.com$/, /firebaseio\.com$/, /firebaseapp\.com$/];
const KNOWN_LIBRARY_CDN = /^(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|a\.basemaps\.cartocdn\.com)$/;

test("Firestore emulator unreachable -> local failure, no prod fallback, no mutation", async ({ page }) => {
  const allRequests = [];
  const prodDataPlaneHits = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    allRequests.push({ url: req.url(), method: req.method() });
    if (KNOWN_LIBRARY_CDN.test(url.hostname)) return;
    if (FORBIDDEN.some((re) => re.test(url.hostname))) prodDataPlaneHits.push(req.url());
  });

  await page.goto("/staff.html");
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.locator("#login-dispatcher-email").fill("dispo.smoke@qa-scale.local");
  await page.locator("#login-dispatcher-password").fill("Qa-Scale-Test-9");
  await page.locator("#dispatcher-login-btn").click();

  // Auth emulator IS available, so authentication itself may succeed —
  // the failure must appear at Firestore hydration (dashboard data), not
  // silently show a populated, working dashboard.
  await page.waitForTimeout(4000);

  const appVisible = await page.evaluate(() => !document.getElementById("app-container")?.className.includes("hidden"));
  const driverCount = await page.evaluate(() => (window.state?.drivers || []).length);
  const bodyText = await page.locator("body").innerText();
  const showsFakeSuccessData = driverCount > 0;

  console.log("EVIDENCE app-container-visible:", appVisible);
  console.log("EVIDENCE hydrated-driver-count (must be 0, no data without Firestore):", driverCount);
  console.log("EVIDENCE production-data-plane-hits:", JSON.stringify(prodDataPlaneHits));
  console.log("EVIDENCE total-requests:", allRequests.length);
  console.log("EVIDENCE contains-generic-error-text:", /error|greška|fehler|unavailable|nedostupn/i.test(bodyText));

  fs.writeFileSync(
    path.join(__dirname, "gate0-requests.json"),
    JSON.stringify({ allRequests, prodDataPlaneHits, driverCount, appVisible }, null, 2)
  );

  expect(prodDataPlaneHits.length).toBe(0);
  expect(showsFakeSuccessData).toBe(false);
});
