/**
 * Screenshot walkthrough: SA → CA → Dispo for role audit.
 * Saves under reports/role-audit-2026-08-07/
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "reports", "role-audit-2026-08-07");
const BASE = process.env.BC_BASE || "http://localhost:8766";
fs.mkdirSync(OUT, { recursive: true });

let n = 0;
async function shot(page, label) {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("SHOT", path.basename(file));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});

// ——— SA ———
await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await shot(page, "sa-login");
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("sa@demo.local");
await page.locator("#login-dispatcher-password").fill("sa-demo-ok");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#superadmin-dashboard").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(600);
await shot(page, "sa-dashboard");

const detailBtn = page.locator('#superadmin-companies-list [data-action="superadminOpenCompanyDetail"]').first();
if (await detailBtn.isVisible().catch(() => false)) {
  await detailBtn.click();
  await page.waitForTimeout(500);
  await shot(page, "sa-company-detail");
  await page.locator('[data-action="superadminCloseCompanyDetail"]').click().catch(() => {});
}

const caForm = page.locator("#sa-ca-password");
if (await caForm.isVisible().catch(() => false)) {
  await page.evaluate(() => {
    const nav = document.querySelector('[data-action="showSection"][data-action-args*="superadmin"]');
  });
  await shot(page, "sa-create-admin-form");
}

await page.locator('[data-action="logout"]').click().catch(() => {});
await page.waitForTimeout(500);

// ——— CA ———
await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});
// hard reload for clean session
await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});
await page.reload({ waitUntil: "networkidle" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("admin@demo.com");
await page.locator("#login-dispatcher-password").fill("demo123");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#company-admin-dashboard").waitFor({ state: "visible", timeout: 15000 }).catch(() => {});
await page.waitForTimeout(700);
await shot(page, "ca-dashboard");

for (const [action, label] of [
  ["company-admin-drivers", "ca-drivers"],
  ["company-admin-groups", "ca-groups"],
  ["company-admin-team", "ca-team"],
  ["company-admin-service-plan", "ca-service-plan"],
  ["company-admin-buses", "ca-buses"],
  ["company-admin-settings", "ca-settings"]
]) {
  await page.evaluate((id) => {
    if (typeof window.showSection === "function") window.showSection(id);
  }, action);
  await page.waitForTimeout(500);
  await shot(page, label);
}

const monthlyGone = await page.evaluate(() => !document.getElementById("ca-monthly-import-card")
  && !document.querySelector(".ca-monthly-import-card")
  && !document.getElementById("ca-monthly-plan-file"));
fs.writeFileSync(path.join(OUT, "00-ca-monthly-import-gone.json"), JSON.stringify({ monthlyGone }, null, 2));

await page.locator('[data-action="logout"]').click().catch(() => {});
await page.waitForTimeout(400);

// ——— Dispo ———
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});
await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("demo@buscommand.com");
await page.locator("#login-dispatcher-password").fill("demo123");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(700);
await shot(page, "dispo-ops");

await page.evaluate(() => {
  window.state.activeGroupHubId = "320";
  if (typeof window.openMonthlyPlanForGroup === "function") window.openMonthlyPlanForGroup("320");
});
await page.waitForTimeout(600);
await shot(page, "dispo-monthly-320");

await page.evaluate(() => {
  if (typeof window.showSection === "function") window.showSection("dispatcher-daily-plan");
});
await page.waitForTimeout(500);
await shot(page, "dispo-daily");

await browser.close();
console.log("Done →", OUT);
