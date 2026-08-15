import { chromium } from "@playwright/test";
import { createEphemeralQaState, installQaHarness } from "../tests/e2e/qa-factory.js";

const browser = await chromium.launch();
const page = await browser.newPage();
const fx = createEphemeralQaState({
  companyId: "qa-local",
  groupId: "101",
  driverName: "E2E Driver",
  driverPin: "1234"
});
await installQaHarness(page, fx);
await page.goto("http://localhost:8766/driver.html");
const before = await page.evaluate(() => ({
  useLocal: window.USE_LOCAL_STATE,
  company: window.COMPANY_ID,
  drivers: (window.state?.drivers || []).map((d) => ({ id: d.id, name: d.name, pin: d.pin })),
  activation: window.__BUSCOMMAND_DRIVER_ACTIVATION_PENDING__,
  pretrip: sessionStorage.getItem("buscommand_pretrip_done"),
  storageKeys: Object.keys(localStorage).filter((k) => k.includes("state")),
  loginHidden: document.getElementById("login-screen")?.classList.contains("hidden"),
  appHidden: document.getElementById("app-container")?.classList.contains("hidden"),
  appInDom: !!document.getElementById("app-container"),
  selectText: document.getElementById("login-driver-select")?.innerText
}));
console.log("BEFORE", JSON.stringify(before, null, 2));

await page.locator("#tab-driver-btn").click().catch(() => {});
await page.locator("#login-driver-select").selectOption({ label: "E2E Driver" });
await page.locator("#login-driver-pin").fill("1234");
await page.locator('[data-action="loginAsDriver"]').click();
await page.waitForTimeout(800);

const after = await page.evaluate(() => ({
  user: window.currentUser,
  activation: window.__BUSCOMMAND_DRIVER_ACTIVATION_PENDING__,
  loginHidden: document.getElementById("login-screen")?.classList.contains("hidden"),
  appHidden: document.getElementById("app-container")?.classList.contains("hidden"),
  appInDom: !!document.getElementById("app-container"),
  dashHidden: document.getElementById("driver-dashboard")?.classList.contains("hidden"),
  pretripHidden: document.getElementById("pre-trip-modal")?.classList.contains("hidden"),
  bodyText: document.body?.innerText?.slice(0, 300)
}));
console.log("AFTER", JSON.stringify(after, null, 2));
await browser.close();
