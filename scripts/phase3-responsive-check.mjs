/**
 * Phase 3 responsive overflow smoke across required widths.
 * Login at desktop width (Dispo mobile block), then resize for measurement.
 */
import { chromium } from "@playwright/test";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const { createEphemeralQaState, installQaHarness } = require("../tests/e2e/qa-factory.js");

const base = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8766";
const widths = [360, 390, 412, 768, 1024, 1280, 1366, 1440, 1920];
const outDir = path.join(process.cwd(), "reports", "phase3-responsive-shots");
fs.mkdirSync(outDir, { recursive: true });

const fixture = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101"
});
fixture.state.branding = { name: "QA Tenant", primaryColor: "#3D7EF5", logo: null };

async function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function loginStaff(page, email) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/staff.html`, { waitUntil: "networkidle" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill(email);
  await page.locator("#login-dispatcher-password").fill(fixture.password);
  await page.locator("#dispatcher-login-btn").click();
  await page.waitForTimeout(800);
}

async function loginDriver(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/driver.html`, { waitUntil: "networkidle" });
  await page.locator("#tab-driver-btn").click().catch(() => {});
  await page.locator("#login-driver-company").fill("qa-local").catch(() => {});
  await page.locator("#login-driver-select").selectOption({ label: fixture.driverName }).catch(async () => {
    await page.locator("#login-driver-select").selectOption({ index: 0 });
  });
  await page.locator("#login-driver-pin").fill(fixture.driverPin);
  await page.locator('[data-action="loginAsDriver"]').click();
  await page.waitForTimeout(700);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await installQaHarness(page, fixture);

const rows = [];
try {
  const probe = await fetch(`${base}/staff.html`);
  if (!probe.ok) throw new Error(`Server unavailable ${probe.status}`);
} catch (err) {
  console.error(err.message || err);
  process.exit(2);
}

await loginStaff(page, fixture.dispoEmail);
await page.evaluate(() => window.switchSection?.("dispatcher-dashboard"));
for (const width of widths) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  await page.waitForTimeout(200);
  const ox = await overflow(page);
  const shot = path.join(outDir, `dispo-${width}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  const trialVisible = await page.evaluate(() => {
    const el = document.getElementById("app-trial-badge");
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && !el.classList.contains("hidden") && !el.hidden;
  });
  const conn = await page.locator("#header-connection-status").isVisible().catch(() => false);
  rows.push({
    role: "dispo",
    width,
    overflowPx: ox,
    trialVisible,
    connectionVisible: conn,
    shot: path.relative(process.cwd(), shot).replace(/\\/g, "/"),
    pass: ox <= 2 && !trialVisible
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

await loginDriver(page);
for (const width of widths) {
  await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
  await page.waitForTimeout(200);
  const ox = await overflow(page);
  const shot = path.join(outDir, `driver-${width}.png`);
  await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
  const sosCenter = width <= 768
    ? await page.evaluate(() => {
        const nav = document.getElementById("mobile-bottom-nav");
        const sos = document.getElementById("mobnav-sos");
        if (!nav || !sos) return null;
        const style = getComputedStyle(nav);
        if (style.display === "none") return null;
        const nr = nav.getBoundingClientRect();
        const sr = sos.getBoundingClientRect();
        return Math.abs((sr.left + sr.width / 2) - (nr.left + nr.width / 2));
      })
    : null;
  const trialVisible = await page.evaluate(() => {
    const el = document.getElementById("app-trial-badge");
    if (!el) return false;
    const style = getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && !el.classList.contains("hidden") && !el.hidden;
  });
  rows.push({
    role: "driver",
    width,
    overflowPx: ox,
    sosCenterDelta: sosCenter,
    trialVisible,
    shot: path.relative(process.cwd(), shot).replace(/\\/g, "/"),
    pass: ox <= 2 && !trialVisible && (sosCenter == null || sosCenter <= 14)
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
}

await browser.close();
const summary = {
  total: rows.length,
  pass: rows.filter((r) => r.pass).length,
  fail: rows.filter((r) => !r.pass).length,
  rows
};
fs.writeFileSync(path.join(process.cwd(), "reports", "phase3-responsive-matrix.json"), JSON.stringify(summary, null, 2));
const md = [
  "# Phase 3 responsive matrix",
  "",
  `| Width | Dispo overflow | Driver overflow | SOS center Δ | Pass |`,
  `| --- | ---: | ---: | ---: | --- |`,
  ...widths.map((w) => {
    const d = rows.find((r) => r.role === "dispo" && r.width === w);
    const dr = rows.find((r) => r.role === "driver" && r.width === w);
    return `| ${w} | ${d?.overflowPx} | ${dr?.overflowPx} | ${dr?.sosCenterDelta ?? "—"} | ${(d?.pass && dr?.pass) ? "PASS" : "FAIL"} |`;
  }),
  "",
  `Summary: **${summary.pass}/${summary.total}** pass`
].join("\n");
fs.writeFileSync(path.join(process.cwd(), "reports", "phase3-responsive-matrix.md"), md);
console.log(JSON.stringify({ pass: summary.pass, fail: summary.fail, total: summary.total }, null, 2));
process.exit(summary.fail > 0 ? 1 : 0);
