/**
 * Visual walkthrough: Dispo demo → VOR 320 → import group plan → screenshots.
 * Saves PNGs under reports/vor320-walkthrough/
 */
import { chromium } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "reports", "vor320-walkthrough");
const PLAN = path.join(ROOT, "tests", "fixtures", "vor320-group-plan-2026-08.csv");
const BASE = process.env.BC_BASE || "http://localhost:8766";

fs.mkdirSync(OUT, { recursive: true });

let step = 0;
async function shot(page, label) {
  step += 1;
  const file = path.join(OUT, `${String(step).padStart(2, "0")}-${label}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("SHOT", file);
  return file;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.addInitScript(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("buscommand_lang", "en");
});

await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await shot(page, "login-screen");

const tab = page.locator("#tab-dispatcher-btn");
if (await tab.isVisible().catch(() => false)) await tab.click();
await page.locator("#login-dispatcher-email").fill("demo@buscommand.com");
await page.locator("#login-dispatcher-password").fill("demo123");
await page.locator("#dispatcher-login-btn").click();
await page.locator("#app-container").waitFor({ state: "visible", timeout: 15000 });
await page.waitForTimeout(800);
await shot(page, "dispo-home-after-login");

// Ensure crew visible / open monthly for 320
const crewCheck = await page.evaluate(() => {
  const disp = (window.state?.dispatchers || []).find((d) => d.id === window.currentUser?.id);
  const drivers = (window.state?.drivers || []).filter((d) => String(d.groupId) === "320" || String(d.lineId) === "320");
  const buses = (window.state?.buses || []).filter((b) => (b.groupIds || []).includes("320") || String(b.groupId) === "320");
  return {
    currentUserGroups: window.currentUser?.groups || null,
    dispGroups: disp?.groups || null,
    drivers: drivers.map((d) => ({ name: d.name, bus: d.bus, eid: d.eid })),
    busNumbers: buses.map((b) => b.number),
    groups: (window.state?.groups || []).map((g) => g.id)
  };
});
console.log("CREW", JSON.stringify(crewCheck, null, 2));
fs.writeFileSync(path.join(OUT, "00-crew-state.json"), JSON.stringify(crewCheck, null, 2));

await page.evaluate(() => {
  const disp = (window.state?.dispatchers || []).find((d) => d.id === window.currentUser?.id);
  if (disp) {
    const g = new Set((disp.groups || []).map(String));
    g.add("310");
    g.add("320");
    disp.groups = [...g];
  }
  if (window.currentUser) {
    const g = new Set((window.currentUser.groups || []).map(String));
    g.add("310");
    g.add("320");
    window.currentUser.groups = [...g];
    window.currentUser.activeGroupId = "320";
  }
  window.state.activeGroupHubId = "320";
  window.state.activeGroupFilter = "320";
  if (typeof window.openMonthlyPlanForGroup === "function") window.openMonthlyPlanForGroup("320");
  else if (typeof window.openMonthlyPlansFull === "function") window.openMonthlyPlansFull();
});
await page.waitForTimeout(800);
await shot(page, "monthly-plan-320-with-crew");

// Driver select should list crew
const driverOptions = await page.evaluate(() =>
  [...(document.getElementById("monthly-driver-select")?.options || [])].map((o) => o.value || o.textContent)
);
console.log("DRIVER OPTIONS", driverOptions);
fs.writeFileSync(path.join(OUT, "00-driver-options.json"), JSON.stringify(driverOptions, null, 2));

await shot(page, "import-dropzone-before");

const input = page.locator("#bulk-plan-import-files");
await input.setInputFiles(PLAN);
await page.waitForTimeout(1500);
await shot(page, "import-preview-after-upload");

const previewText = await page.locator("#plan-import-preview").innerText().catch(() => "");
fs.writeFileSync(path.join(OUT, "00-import-preview.txt"), previewText);

const saveBtn = page.locator("[data-action='confirmBulkPlanImport']");
if (await saveBtn.isVisible().catch(() => false)) {
  await saveBtn.click();
  await page.waitForTimeout(1000);
  await shot(page, "after-save-all-plans");
} else {
  console.log("WARN: save button not visible");
  await shot(page, "save-button-missing");
}

// Open Boban August calendar
await page.evaluate(() => {
  const monthSel = document.getElementById("monthly-month-select");
  if (monthSel) {
    if (![...monthSel.options].some((o) => o.value === "2026-08")) {
      const opt = document.createElement("option");
      opt.value = "2026-08";
      opt.textContent = "2026-08";
      monthSel.appendChild(opt);
    }
    monthSel.value = "2026-08";
  }
  const sel = document.getElementById("monthly-driver-select");
  if (sel) {
    const hit = [...sel.options].find((o) => /Canic Boban/i.test(o.value || o.textContent));
    if (hit) sel.value = hit.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (typeof window.loadMonthlyPlanForDriver === "function") window.loadMonthlyPlanForDriver();
});
await page.waitForTimeout(800);
await shot(page, "calendar-canic-boban-august");

await page.evaluate(() => {
  const sel = document.getElementById("monthly-driver-select");
  if (sel) {
    const hit = [...sel.options].find((o) => /Marko/i.test(o.value || o.textContent));
    if (hit) sel.value = hit.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (typeof window.loadMonthlyPlanForDriver === "function") window.loadMonthlyPlanForDriver();
});
await page.waitForTimeout(800);
await shot(page, "calendar-marko-petrovic-august");

await page.evaluate(() => {
  const sel = document.getElementById("monthly-driver-select");
  if (sel) {
    const hit = [...sel.options].find((o) => /Nikola/i.test(o.value || o.textContent));
    if (hit) sel.value = hit.value;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (typeof window.loadMonthlyPlanForDriver === "function") window.loadMonthlyPlanForDriver();
});
await page.waitForTimeout(800);
await shot(page, "calendar-nikola-jovanovic-august");

// Vehicles panel
await page.evaluate(() => {
  if (typeof window.openVehiclesPanelForGroup === "function") window.openVehiclesPanelForGroup("320");
  else if (typeof window.showSection === "function") window.showSection("dispatcher-vehicles-panel");
});
await page.waitForTimeout(600);
await shot(page, "vehicles-panel-320");

const schedules = await page.evaluate(() =>
  (window.state.schedules || [])
    .filter((s) => String(s.month) === "2026-08")
    .map((s) => ({
      id: s.id,
      driver: s.driverName,
      days: Object.keys(s.parsedShifts || {}).length,
      d3: s.parsedShifts?.[3]?.routeCode || s.parsedShifts?.[3]?.name
    }))
);
fs.writeFileSync(path.join(OUT, "00-schedules-after-import.json"), JSON.stringify(schedules, null, 2));
console.log("SCHEDULES", schedules);

await browser.close();
console.log("Done. Screenshots in", OUT);
