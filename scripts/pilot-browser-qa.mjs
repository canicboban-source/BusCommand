import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("reports/pilot-browser-shots");
fs.mkdirSync(dir, { recursive: true });
const trail = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

async function shot(name, note) {
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  trail.push({ step: name, note, url: page.url() });
  console.log("SHOT", name, "-", note);
}

async function forceLogout() {
  await page.evaluate(() => {
    try {
      window.currentUser = null;
      localStorage.clear();
      sessionStorage.clear();
    } catch { /* ignore */ }
    document.getElementById("app-container")?.classList.add("hidden");
    document.getElementById("login-screen")?.classList.remove("hidden");
  });
  await page.goto("http://localhost:8766/staff.html?mode=demo", { waitUntil: "networkidle" });
}

async function staffLogin(email, password) {
  await forceLogout();
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.locator("#login-dispatcher-email").fill(email);
  await page.locator("#login-dispatcher-password").fill(password);
  await page.locator("#dispatcher-login-btn").click();
  await page.waitForTimeout(900);
}

await page.goto("http://localhost:8766/staff.html?mode=demo", { waitUntil: "networkidle" });
await shot("01-login", "Opened demo staff login");

await staffLogin("sa@demo.local", "sa-demo-ok");
const saVisible = await page.locator("#superadmin-dashboard").isVisible().catch(() => false);
await shot("02-sa-dashboard", saVisible ? "SA dashboard visible" : "SA login failed");
if (saVisible) {
  const cards = await page.locator(".sa-company-card").count();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  trail.push({ step: "sa-cards", note: `cards=${cards} hOverflow=${overflow}` });
}

await staffLogin("admin@demo.com", "demo123");
const caVisible = await page.locator("#company-admin-dashboard").isVisible().catch(() => false);
await shot("03-ca-dashboard", caVisible ? "CA overview visible" : "CA login failed");
if (caVisible) {
  await page.evaluate(() => window.switchSection?.("company-admin-groups"));
  await page.waitForTimeout(400);
  await shot("04-ca-groups", "CA groups section");
}

await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await staffLogin("demo@buscommand.com", "demo123");
const appShown = await page.locator("#app-container").evaluate((el) => !el.classList.contains("hidden"));
await shot("05-dispo", appShown ? "Dispo app shell shown" : "Dispo login failed");
if (appShown) {
  await page.evaluate(() => {
    window.switchSection?.("dispatcher-dashboard");
  });
  await page.waitForTimeout(400);
  await shot("06-dispo-ops", "Dispo dashboard/ops");
}

await page.goto("http://localhost:8766/driver.html?mode=demo", { waitUntil: "networkidle" });
await shot("07-driver-login", "Driver surface login");
const tab = page.locator("#tab-driver-btn");
if (await tab.isVisible().catch(() => false)) await tab.click();
const select = page.locator("#login-driver-select");
if (await select.count()) {
  const opts = await select.locator("option").allTextContents();
  trail.push({ step: "driver-options", note: opts.slice(0, 8).join(" | ") });
  if (opts.length > 1) {
    await select.selectOption({ index: 1 });
    await page.locator("#login-driver-pin").fill("1234");
    const submit = page.getByRole("button", { name: /Sign on duty|Start Shift|Prijavi/i });
    if (await submit.count()) await submit.first().click();
    else await page.locator("button[type='submit']").first().click();
    await page.waitForTimeout(900);
    await shot("08-driver-app", "After driver login attempt");
  }
}

fs.writeFileSync(path.join(dir, "trail.json"), JSON.stringify(trail, null, 2));
console.log(JSON.stringify(trail, null, 2));
await browser.close();
const failed = trail.some((t) => /failed/i.test(t.note || ""));
process.exit(failed ? 1 : 0);
