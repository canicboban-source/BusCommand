const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT_DIR = path.join(__dirname, "..", "..");
const P1A_SEED = path.join(ROOT_DIR, "qa-report", "p1a-radar-live-seed.js");
const P1B_WRITE = path.join(ROOT_DIR, "qa-report", "p1b-radar-live-write.js");

const SHOT_DIR = path.join(__dirname, "..", "..", "qa-report", "screenshots-p1b");
fs.mkdirSync(SHOT_DIR, { recursive: true });
let seq = 0;
async function shot(page, name) {
  seq += 1;
  await page.screenshot({ path: path.join(SHOT_DIR, `${String(seq).padStart(2, "0")}-${name}.png`), fullPage: true }).catch(() => {});
}

function seedPath() {
  const p = path.join(__dirname, "..", "..", "qa-report", "p1a-radar-live-seed-output.json");
  return fs.existsSync(p) ? p : path.join(__dirname, "p1a-radar-live-seed-output.json");
}

function writePath() {
  const p = path.join(__dirname, "..", "..", "qa-report", "p1b-radar-live-write-output.json");
  return fs.existsSync(p) ? p : path.join(__dirname, "p1b-radar-live-write-output.json");
}

test.describe.serial("RADAR-P1B", () => {
  test("P1-B live: radar-to-resolution driver identity closure for duplicate names D0/D+2", async ({ page }) => {
    execSync(`node "${P1A_SEED}"`, { cwd: ROOT_DIR, stdio: "inherit" });
    execSync(`node "${P1B_WRITE}"`, { cwd: ROOT_DIR, stdio: "inherit" });

    await page.goto("/staff.html");
    const tab = page.locator("#tab-dispatcher-btn");
    if (await tab.isVisible().catch(() => false)) await tab.click();
    await page.locator("#login-dispatcher-email").fill("dispo.smoke@qa-scale.local");
    await page.locator("#login-dispatcher-password").fill("Qa-Scale-Test-9");
    await page.locator("#dispatcher-login-btn").click();
    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const seed = JSON.parse(fs.readFileSync(seedPath(), "utf8").replace(/^\uFEFF/, ""));
    const writeOutput = JSON.parse(fs.readFileSync(writePath(), "utf8").replace(/^\uFEFF/, ""));
    const { D0, D1, D2 } = writeOutput;
    await shot(page, "01-dashboard-after-login");

    const before = await page.evaluate(({ driverA, driverB }) => ({
      aName: (window.state.drivers || []).find(d => d.id === driverA || d.uid === driverA)?.name,
      bName: (window.state.drivers || []).find(d => d.id === driverB || d.uid === driverB)?.name,
      aShifts: (window.state.shifts || []).filter(s => s.driverId === driverA).map(s => ({ date: s.date, type: s.type })),
      bShifts: (window.state.shifts || []).filter(s => s.driverId === driverB).map(s => ({ date: s.date, type: s.type })),
    }), seed);
    console.log("EVIDENCE before:", JSON.stringify(before, null, 2));
    expect(before.aName).toBe("Marko Jovanović");
    expect(before.bName).toBe("Marko Jovanović");
    expect(before.aShifts.some(s => s.date === D0)).toBe(true);
    expect(before.bShifts.some(s => s.date === D0)).toBe(false);
    expect(before.bShifts.some(s => s.date === D1)).toBe(true);

    await page.evaluate(() => { window.state.activeGroupHubId = "310"; window.state.activeGroupFilter = "310"; });
    await page.evaluate(() => { if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(); });
    await page.waitForTimeout(600);
    await shot(page, "02-ops-attention-initial");

    const b0Id = await page.evaluate(({ D0, driverB }) => {
      const btns = Array.from(document.querySelectorAll(".ops-attention-nav-item"));
      const candidates = btns
        .map(btn => JSON.parse(btn.dataset.actionArgs || "[]")[0])
        .filter(Boolean)
        .filter(id => id.includes(":driver:") && id.endsWith(`:${D0}`));
      const preferred = candidates.find(id => id.includes(`:driver:${driverB}:`)) || candidates[0] || null;
      return preferred;
    }, { D0, driverB: seed.driverB });
    console.log("EVIDENCE B-D0 item id:", b0Id);
    expect(b0Id).toContain(seed.driverB);
    expect(b0Id).toContain(D0);

    await page.locator(`[data-action="focusOpsAttentionItem"][data-action-args*="${b0Id}"]`).click();
    await page.waitForTimeout(300);
    await shot(page, "03-ops-attention-b0-focused");

    const assignBtn = page.locator(`[data-action="applyOpsAttentionFix"][data-action-args*="${b0Id}"][data-action-args*="assign"]`, { hasText: /Dodeli smenu|Assign shift/ }).first();
    await expect(assignBtn).toBeVisible();
    const args = await assignBtn.getAttribute("data-action-args");
    const parsed = JSON.parse(args || "[]");
    expect(parsed[0]).toBe(b0Id);
    expect(parsed[1]).toBe("assign");
    await assignBtn.click();
    await page.locator("#shift-driver-select").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "04-shift-editor-after-radar-action");

    const editor = await page.evaluate(() => ({
      driverId: document.getElementById("shift-driver-select")?.value,
      date: document.getElementById("shift-date-input")?.value,
      driverText: document.getElementById("shift-driver-select")?.selectedOptions?.[0]?.textContent || ""
    }));
    console.log("EVIDENCE editor state:", JSON.stringify(editor));
    expect(editor.driverId).toBe(seed.driverB);
    expect(editor.date).toBe(D0);
    expect(editor.driverText).toContain("Marko Jovanović");

    await page.locator("#shift-name-input").fill("310.S01");
    await page.waitForTimeout(200);
    await shot(page, "05-shift-editor-duty-filled");
    await page.locator('[data-action="assignShift"]').click();

    await page.waitForFunction(({ driverB, D0 }) =>
      (window.state.shifts || []).some(s => s.driverId === driverB && s.date === D0 && s.type !== "clear"),
      { driverB: seed.driverB, D0 },
      { timeout: 15000 }
    );
    await shot(page, "06-after-assign-save");

    const afterAssign = await page.evaluate(({ driverA, driverB }) => ({
      aShifts: (window.state.shifts || []).filter(s => s.driverId === driverA).map(s => ({ date: s.date, type: s.type })),
      bShifts: (window.state.shifts || []).filter(s => s.driverId === driverB).map(s => ({ date: s.date, type: s.type })),
    }), seed);
    console.log("EVIDENCE after assign:", JSON.stringify(afterAssign, null, 2));
    expect(afterAssign.bShifts.some(s => s.date === D0)).toBe(true);
    expect(afterAssign.aShifts).toEqual(before.aShifts);

    await page.reload();
    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.state.activeGroupHubId = "310"; window.state.activeGroupFilter = "310"; });
    await page.evaluate(() => { if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(); });
    await page.waitForTimeout(600);
    await shot(page, "07-ops-attention-after-hard-refresh");

    const afterRefresh = await page.evaluate(({ driverA, driverB, D0 }) => ({
      aShifts: (window.state.shifts || []).filter(s => s.driverId === driverA).map(s => ({ date: s.date, type: s.type })),
      bShifts: (window.state.shifts || []).filter(s => s.driverId === driverB).map(s => ({ date: s.date, type: s.type })),
      radarItems: Array.from(document.querySelectorAll(".ops-attention-nav-item")).map(b => ({
        id: JSON.parse(b.dataset.actionArgs || "[]")[0],
        title: b.querySelector("strong")?.textContent,
        sub: b.querySelector("span")?.textContent,
        date: b.querySelector("em")?.textContent
      }))
    }), { driverA: seed.driverA, driverB: seed.driverB, D0 });
    console.log("EVIDENCE after refresh:", JSON.stringify(afterRefresh, null, 2));

    expect(afterRefresh.bShifts.some(s => s.date === D0)).toBe(true);
    expect(afterRefresh.aShifts.some(s => s.date === D0)).toBe(true);
    expect(afterRefresh.aShifts.some(s => s.date === D2)).toBe(true);
    const b0Remaining = afterRefresh.radarItems.some(it => it.id.includes(`:driver:${seed.driverB}:${D0}`));
    expect(b0Remaining).toBe(false);

    await page.locator(`[data-action="focusOpsAttentionItem"][data-action-args*="gap:driver:${seed.driverB}:${D2}"]`).click();
    await page.waitForTimeout(300);
    const d2AssignBtn = page.locator(`[data-action="applyOpsAttentionFix"][data-action-args*="gap:driver:${seed.driverB}:${D2}"][data-action-args*="assign"]`).filter({ hasText: /Dodeli smenu|Assign shift/ });
    const d2Args = await d2AssignBtn.getAttribute("data-action-args");
    const d2Parsed = JSON.parse(d2Args || "[]");
    expect(d2Parsed[1]).toBe("assign");
    await d2AssignBtn.click();
    await page.locator("#shift-driver-select").waitFor({ state: "visible", timeout: 10000 });
    await shot(page, "08-d2-editor-bound");

    const d2Editor = await page.evaluate(() => ({
      driverId: document.getElementById("shift-driver-select")?.value,
      date: document.getElementById("shift-date-input")?.value
    }));
    console.log("EVIDENCE D2 editor:", JSON.stringify(d2Editor));
    expect(d2Editor.driverId).toBe(seed.driverB);
    expect(d2Editor.date).toBe(D2);

    await page.locator("#shift-name-input").fill("310.S01");
    await page.locator('[data-action="assignShift"]').click();
    await page.waitForFunction(({ driverB, D2 }) =>
      (window.state.shifts || []).some(s => s.driverId === driverB && s.date === D2 && s.type !== "clear"),
      { driverB: seed.driverB, D2 },
      { timeout: 15000 }
    );
    await shot(page, "09-d2-assigned");

    await page.locator("#shifts-weekly-grid").waitFor({ state: "visible", timeout: 10000 });
    const removeBtn = page.locator(`[data-action="removeShift"][data-action-args*="${seed.driverB}"][data-action-args*="${D2}"]`);
    await expect(removeBtn).toBeVisible();
    const removeArgs = await removeBtn.getAttribute("data-action-args");
    const removeParsed = JSON.parse(removeArgs || "[]");
    expect(removeParsed[0]).toBe(seed.driverB);
    expect(removeParsed[1]).toBe(D2);
    await shot(page, "10-d2-remove-button");
    await removeBtn.click();

    await page.waitForFunction(({ driverA, driverB, D2 }) => {
      const b = (window.state.shifts || []).filter(s => s.driverId === driverB && s.date === D2);
      const a = (window.state.shifts || []).filter(s => s.driverId === driverA && s.date === D2);
      return b.every(s => s.type === "clear") && a.some(s => s.type === "morning");
    }, { driverA: seed.driverA, driverB: seed.driverB, D2 }, { timeout: 15000 });
    await shot(page, "11-after-d2-clear");

    const afterClear = await page.evaluate(({ driverA, driverB }) => ({
      aShifts: (window.state.shifts || []).filter(s => s.driverId === driverA).map(s => ({ date: s.date, type: s.type })),
      bShifts: (window.state.shifts || []).filter(s => s.driverId === driverB).map(s => ({ date: s.date, type: s.type })),
    }), seed);
    console.log("EVIDENCE after clear:", JSON.stringify(afterClear, null, 2));

    await page.reload();
    await expect(page.locator("#app-container")).not.toHaveClass(/hidden/, { timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { window.state.activeGroupHubId = "310"; window.state.activeGroupFilter = "310"; });
    await page.evaluate(() => { if (typeof window.openOpsAttentionPanel === "function") window.openOpsAttentionPanel(); });
    await page.waitForTimeout(600);
    await shot(page, "12-ops-attention-final");

    const final = await page.evaluate(({ driverB, D2 }) => ({
      bShifts: (window.state.shifts || []).filter(s => s.driverId === driverB).map(s => ({ date: s.date, type: s.type })),
      radarItems: Array.from(document.querySelectorAll(".ops-attention-nav-item")).map(b => JSON.parse(b.dataset.actionArgs || "[]")[0])
    }), { driverB: seed.driverB, D2 });
    console.log("EVIDENCE final:", JSON.stringify(final, null, 2));

    expect(final.bShifts.some(s => s.date === D2 && s.type === "clear")).toBe(true);
    expect(final.radarItems.some(id => id.includes(`:driver:${seed.driverB}:${D2}`))).toBe(true);

    fs.writeFileSync(
      path.join(__dirname, "..", "..", "qa-report", "p1b-radar-identity-ui-evidence.json"),
      JSON.stringify({ seed, D0, D1, D2, before, afterAssign, afterRefresh, afterClear, final }, null, 2)
    );
  });
});
