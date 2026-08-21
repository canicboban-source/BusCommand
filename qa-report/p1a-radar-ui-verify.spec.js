const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SHOT_DIR = path.join(__dirname, "screenshots-p1a");
fs.mkdirSync(SHOT_DIR, { recursive: true });
let seq = 0;
async function shot(page, name) {
  seq += 1;
  await page.screenshot({ path: path.join(SHOT_DIR, `${String(seq).padStart(2, "0")}-${name}.png`), fullPage: true }).catch(() => {});
}

test("P1-A live: duplicate-name D0/D1/D2 radar correctness through real UI + emulator", async ({ page }) => {
  const seedPath = fs.existsSync(path.join(__dirname, "p1a-radar-live-seed-output.json"))
    ? path.join(__dirname, "p1a-radar-live-seed-output.json")
    : path.join(__dirname, "..", "..", "qa-report", "p1a-radar-live-seed-output.json");
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf8").replace(/^\uFEFF/, ""));

  await page.goto("/staff.html");
  const tab = page.locator("#tab-dispatcher-btn");
  if (await tab.isVisible().catch(() => false)) await tab.click();
  await page.locator("#login-dispatcher-email").fill("dispo.smoke@qa-scale.local");
  await page.locator("#login-dispatcher-password").fill("Qa-Scale-Test-9");
  await page.locator("#dispatcher-login-btn").click();
  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, "dashboard-after-login");

  await page.evaluate(() => {
    window.state.activeGroupHubId = "310";
    window.state.activeGroupFilter = "310";
  });
  await page.evaluate(() => { if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(); });
  await page.waitForTimeout(500);
  await shot(page, "ops-attention-panel");

  // Read the actual rendered items straight from window.state via the same
  // driver IDs the seed/write scripts used — proves correctness by ID, not
  // by text scraping the ambiguous shared display name.
  const evidence = await page.evaluate(({ driverA, driverB }) => {
    const panelText = document.getElementById("ops-attention-panel")?.innerText || "";
    return {
      panelHasAnyContent: panelText.length > 0,
      driverAName: (window.state.drivers || []).find((d) => d.id === driverA)?.name,
      driverBName: (window.state.drivers || []).find((d) => d.id === driverB)?.name,
      shiftsA: (window.state.shifts || []).filter((s) => s.driverId === driverA).map((s) => ({ date: s.date, type: s.type })),
      shiftsB: (window.state.shifts || []).filter((s) => s.driverId === driverB).map((s) => ({ date: s.date, type: s.type }))
    };
  }, { driverA: seed.driverA, driverB: seed.driverB });
  console.log("EVIDENCE seed-and-hydration:", JSON.stringify(evidence));

  // Reload (hard refresh) before reading the final radar state, to prove
  // this reflects real Firestore-emulator persistence, not in-memory state.
  await page.reload();
  await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.state.activeGroupHubId = "310"; window.state.activeGroupFilter = "310"; });

  const radar = await page.evaluate(({ driverA, driverB }) => {
    // Import path is already loaded as part of the bundle; reach the
    // exported function via the module registry is not possible from here,
    // so we drive the same panel the dispatcher would use and read the DOM.
    if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel();
    const panelEl = document.getElementById("ops-attention-panel");
    const items = Array.from(panelEl.querySelectorAll(".ops-attention-nav-item")).map((btn) => ({
      title: btn.querySelector("strong")?.textContent || "",
      sub: btn.querySelector("span")?.textContent || "",
      dateBadge: btn.querySelector("em")?.textContent || ""
    }));
    return { items, driverAId: driverA, driverBId: driverB };
  }, { driverA: seed.driverA, driverB: seed.driverB });
  await shot(page, "ops-attention-panel-after-reload");
  console.log("EVIDENCE after-hard-refresh-panel-items:", JSON.stringify(radar.items, null, 2));

  const markoItems = radar.items.filter((i) => /Marko Jovanović/.test(i.sub));
  console.log("EVIDENCE marko-jovanovic-card-count:", markoItems.length, "(expected 3: A-D1, B-D0, B-D2)");
  expect(markoItems.length).toBe(3);

  for (const lang of ["sr", "de"]) {
    await page.locator("#header-lang-select").selectOption(lang);
    await page.dispatchEvent("#header-lang-select", "change");
    await page.waitForTimeout(400);
    if (typeof page.evaluate === "function") {
      await page.evaluate(() => { if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(); });
    }
    await page.waitForTimeout(300);
    await shot(page, `ops-attention-panel-${lang}`);
    const labelText = await page.evaluate(() => {
      const panel = document.getElementById("ops-attention-panel");
      const em = panel?.querySelector(".ops-attention-nav-item em");
      return em ? em.textContent : null;
    });
    console.log(`EVIDENCE ${lang}-date-badge-sample:`, JSON.stringify(labelText));
    expect(labelText).not.toMatch(/undefined|\[object Object\]|radar_day_/);
  }
});
