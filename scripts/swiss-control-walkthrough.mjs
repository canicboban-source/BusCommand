/**
 * Overnight Swiss Control — SA → CA → Dispo screenshot walkthrough.
 * Usage: BC_BASE=http://127.0.0.1:PORT node scripts/swiss-control-walkthrough.mjs
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const OUT = path.join(process.cwd(), "reports", "swiss-control-2026-08-07");
const BASE = process.env.BC_BASE || "http://127.0.0.1:8766";
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

await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await shot(page, "login-staff-hint");

// ——— SA ———
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.waitForTimeout(200);
await shot(page, "login-staff-tab");
await page.locator("#login-dispatcher-email").fill("sa@demo.local");
await page.locator("#login-dispatcher-password").fill("sa-demo-ok");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#superadmin-dashboard").waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(500);
await shot(page, "sa-dashboard");

await page.locator('[data-action="logout"]').click().catch(() => {});
await page.waitForTimeout(400);

// ——— CA ———
await page.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});
await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await page.locator("#tab-dispatcher-btn").click().catch(() => {});
await page.locator("#login-dispatcher-email").fill("admin@demo.com");
await page.locator("#login-dispatcher-password").fill("demo123");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#company-admin-dashboard").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
await page.waitForTimeout(600);
await shot(page, "ca-dashboard");

await page.evaluate(() => {
  if (typeof window.showSection === "function") window.showSection("company-admin-service-plan");
});
await page.waitForTimeout(500);
await shot(page, "ca-service-plan-no-monthly");

const d21 = await page.evaluate(() => ({
  monthlyCard: !!document.getElementById("ca-monthly-import-card"),
  monthlyFile: !!document.getElementById("ca-monthly-import-file"),
  orphanHint: !!document.querySelector("[data-feature='ca-monthly-assignment-import']")
}));
fs.writeFileSync(path.join(OUT, "00-d21-ca-monthly-gone.json"), JSON.stringify(d21, null, 2));

// CA ops hub readonly
await page.evaluate(() => {
  if (typeof window.openGroupHub === "function") window.openGroupHub("320");
  else if (typeof window.showSection === "function") {
    window.state.activeGroupHubId = "320";
    window.showSection("dispatcher-group-hub");
  }
});
await page.waitForTimeout(700);
await shot(page, "ca-group-hub-readonly");

const bannerVisible = await page.evaluate(() => {
  const b = document.getElementById("ops-readonly-banner");
  if (!b) return false;
  return !b.classList.contains("hidden") && !b.hasAttribute("hidden") && b.offsetParent !== null;
});
fs.writeFileSync(path.join(OUT, "00-c4-readonly-banner.json"), JSON.stringify({ bannerVisible }, null, 2));

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
await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });
await page.waitForTimeout(700);
await shot(page, "dispo-ops");

await page.evaluate(() => {
  if (typeof window.openGroupHub === "function") window.openGroupHub("320");
});
await page.waitForTimeout(700);
await shot(page, "dispo-hub-320");

const activeGroup = await page.evaluate(() => ({
  hubId: window.state?.activeGroupHubId || null,
  userActive: window.currentUser?.activeGroupId || null,
  headerText: document.getElementById("header-user-sub")?.textContent || ""
}));
fs.writeFileSync(path.join(OUT, "00-d1-active-group.json"), JSON.stringify(activeGroup, null, 2));

await page.evaluate(() => {
  if (typeof window.openMonthlyPlanForGroup === "function") window.openMonthlyPlanForGroup("320");
});
await page.waitForTimeout(600);
await shot(page, "dispo-monthly-import");

const dropHint = await page.evaluate(() =>
  document.getElementById("plan-import-dropzone")?.textContent?.trim() || ""
);
fs.writeFileSync(path.join(OUT, "00-d3-dropzone.json"), JSON.stringify({ dropHint }, null, 2));

await page.evaluate(() => {
  if (typeof window.showSection === "function") window.showSection("dispatcher-dashboard");
});
await page.waitForTimeout(400);
await shot(page, "dispo-ops-return");

await browser.close();
console.log("Done →", OUT);
