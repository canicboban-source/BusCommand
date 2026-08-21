const { test, expect } = require("@playwright/test");
const FORBIDDEN = [/googleapis\.com$/, /firebaseio\.com$/, /firebaseapp\.com$/];

test("Auth emulator unreachable -> login fails locally, never reaches production", async ({ page }) => {
  const prodHits = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (FORBIDDEN.some((re) => re.test(url.hostname)) && !/fonts\.|gstatic\.com$/.test(url.hostname)) {
      prodHits.push(req.url());
    }
  });
  await page.goto("/staff.html");
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.locator("#login-dispatcher-email").fill("dispo.smoke@qa-scale.local");
  await page.locator("#login-dispatcher-password").fill("Qa-Scale-Test-9");
  await page.locator("#dispatcher-login-btn").click();
  await page.waitForTimeout(3000);
  const loggedIn = await page.evaluate(() => !document.getElementById("app-container").className.includes("hidden"));
  console.log("EVIDENCE logged-in-despite-unreachable-auth-emulator:", loggedIn);
  console.log("EVIDENCE production-hosts-contacted:", JSON.stringify(prodHits));
  expect(loggedIn).toBe(false);
  expect(prodHits.length).toBe(0);
});
