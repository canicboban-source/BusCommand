import { chromium } from "@playwright/test";
import fs from "fs";

const base = "http://localhost:8766";
const out = [];
const shots = "reports/dispo-eval-shots";
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => out.push({ type: "pageerror", msg: String(e.message).slice(0, 200) }));
page.on("console", (m) => {
  if (m.type() === "error") out.push({ type: "console", msg: m.text().slice(0, 200) });
});

async function shot(name) {
  await page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
}

async function visibleNav() {
  return page.locator("#dispatcher-nav .nav-item:visible").evaluateAll((els) =>
    els.map((e) => {
      let section = null;
      try {
        section = JSON.parse(e.getAttribute("data-action-args") || "[]")[0];
      } catch {
        section = null;
      }
      return { text: e.textContent.replace(/\s+/g, " ").trim(), section };
    })
  );
}

async function sectionInfo(id) {
  return page.evaluate((sid) => {
    const el = document.getElementById(sid);
    if (!el) return { id: sid, exists: false };
    const style = getComputedStyle(el);
    const hidden =
      el.classList.contains("hidden") ||
      style.display === "none" ||
      style.visibility === "hidden";
    const buttons = [...el.querySelectorAll("button, a.btn, [data-action]")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .slice(0, 40)
      .map((b) => ({
        text: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
        action: b.getAttribute("data-action") || b.getAttribute("type") || b.tagName
      }));
    const h2 = el.querySelector("h1,h2")?.textContent?.replace(/\s+/g, " ").trim() || "";
    return { id: sid, exists: true, hidden, h2, buttonCount: buttons.length, buttons };
  }, id);
}

await page.goto(`${base}/staff.html?mode=demo`, { waitUntil: "networkidle" });
await page.fill("#login-dispatcher-email", "demo@buscommand.com");
await page.fill("#login-dispatcher-password", "demo123");
await page.click("#dispatcher-login-btn");
await page.waitForSelector("#dispatcher-nav:not(.hidden)", { timeout: 15000 });
await page.waitForTimeout(800);
out.push({ step: "login", ok: true, nav: await visibleNav() });
await shot("01-ops");

const navSections = [
  "dispatcher-dashboard",
  "dispatcher-daily-plan-pick",
  "dispatcher-monthly-plan-pick",
  "dispatcher-vehicles",
  "dispatcher-messages",
  "dispatcher-live-map-section",
  "dispatcher-reports",
  "dispatcher-lost-found",
  "dispatcher-vacations"
];

for (const sid of navSections) {
  await page.evaluate((s) => {
    if (typeof window.switchSection === "function") window.switchSection(s);
  }, sid);
  await page.waitForTimeout(500);
  const info = await sectionInfo(sid);
  out.push({ step: "nav", ...info });
  await shot(`nav-${sid}`);
}

await page.evaluate(() => window.switchSection?.("dispatcher-daily-plan-pick"));
await page.waitForTimeout(400);
const dailyOpened = await page.evaluate(() => {
  const card = document.querySelector("#dispatcher-daily-plan-pick [data-action]");
  if (card) {
    card.click();
    return card.getAttribute("data-action");
  }
  return null;
});
await page.waitForTimeout(700);
out.push({
  step: "open-daily",
  dailyOpened,
  daily: await sectionInfo("dispatcher-daily-plan-full")
});
await shot("02-daily-full");

await page.evaluate(() => window.switchSection?.("dispatcher-dashboard"));
await page.waitForTimeout(500);
const opsStats = await page.evaluate(() => ({
  alerts: document.querySelectorAll(
    "#dispatcher-live-alerts .alert-item, #dispatcher-live-alerts .ops-alert, #dispatcher-live-alerts > *"
  ).length,
  crew: document.querySelectorAll(
    "#dispatcher-active-drivers-list .ops-crew-row, #dispatcher-active-drivers-list [data-action], #dispatcher-active-drivers-list > *"
  ).length,
  needsAttentionBtn: !!document.querySelector('[data-action="openOpsAttentionPanel"]'),
  healthBanner: !!document.querySelector(
    ".plan-health-banner, #plan-health-banner, [data-action*='Attention']"
  ),
  groupCards: document.querySelectorAll(
    '#dispatcher-dashboard [data-action="openDispatcherGroupHub"], #dispatcher-dashboard .ops-group-card'
  ).length
}));
out.push({ step: "ops-stats", ...opsStats });

const attn = await page.evaluate(() => {
  if (typeof window.openOpsAttentionPanel === "function") {
    window.openOpsAttentionPanel();
    return "api";
  }
  const b = document.querySelector('[data-action="openOpsAttentionPanel"]');
  if (b) {
    b.click();
    return "click";
  }
  return null;
});
await page.waitForTimeout(600);
const attnState = await page.evaluate(() => {
  const p = document.querySelector("#ops-attention-panel");
  if (!p) return { exists: false };
  const visible = !p.classList.contains("hidden") && getComputedStyle(p).display !== "none";
  const cards = p.querySelectorAll(".ops-attention-card").length;
  const navItems = p.querySelectorAll(".ops-attention-nav-item").length;
  const close = p.querySelector(".ops-attention-close");
  let closeVisible = false;
  if (close) {
    const r = close.getBoundingClientRect();
    closeVisible =
      r.width > 0 && r.height > 0 && getComputedStyle(close).visibility !== "hidden";
  }
  const subtitle = p.querySelector("#ops-attention-subtitle")?.textContent || "";
  return { exists: true, visible, cards, navItems, closeVisible, subtitle };
});
out.push({ step: "attention", how: attn, ...attnState });
await shot("03-attention");

await page.evaluate(() => window.closeOpsAttentionPanel?.());
await page.waitForTimeout(300);

await page.evaluate(() => window.switchSection?.("dispatcher-monthly-plan-pick"));
await page.waitForTimeout(400);
const monthlyOpen = await page.evaluate(() => {
  const b = document.querySelector("#dispatcher-monthly-plan-pick [data-action]");
  if (b) {
    b.click();
    return b.getAttribute("data-action");
  }
  return null;
});
await page.waitForTimeout(700);
out.push({
  step: "monthly",
  monthlyOpen,
  full: await sectionInfo("dispatcher-monthly-plans-full"),
  hub: await sectionInfo("dispatcher-group-hub")
});
await shot("04-monthly-or-hub");

await page.evaluate(() => window.switchSection?.("dispatcher-vehicles"));
await page.waitForTimeout(500);
const veh = await page.evaluate(() => {
  const el = document.getElementById("dispatcher-vehicles");
  const rows =
    el?.querySelectorAll("tr, .bus-row, .vehicle-row, [data-bus], .ops-bus-row").length || 0;
  const text = (el?.innerText || "").slice(0, 500);
  return { rows, text };
});
out.push({ step: "vehicles", ...veh });
await shot("05-vehicles");

for (const sid of [
  "dispatcher-messages",
  "dispatcher-reports",
  "dispatcher-vacations",
  "dispatcher-lost-found",
  "dispatcher-live-map-section"
]) {
  await page.evaluate((s) => window.switchSection?.(s), sid);
  await page.waitForTimeout(400);
  const text = await page.evaluate(
    (s) => (document.getElementById(s)?.innerText || "").slice(0, 400),
    sid
  );
  out.push({ step: "section-text", id: sid, text });
}

const hubPath = await page.evaluate(() => ({
  fromNav: !!document.querySelector('#dispatcher-nav [data-action-args*="dispatcher-group-hub"]'),
  fromOps: !!document.querySelector(
    '#dispatcher-dashboard [data-action="openDispatcherGroupHub"]'
  )
}));
out.push({ step: "hub-discover", ...hubPath });

const orphans = await page.evaluate(() => {
  const ids = ["dispatcher-shifts", "dispatcher-daily-schedule", "dispatcher-group-hub"];
  return ids.map((id) => {
    const el = document.getElementById(id);
    const inNav = !!document.querySelector(`#dispatcher-nav [data-action-args*="${id}"]`);
    return { id, exists: !!el, inNav };
  });
});
out.push({ step: "orphans", orphans });

await page.evaluate(() => window.switchSection?.("dispatcher-dashboard"));
await page.waitForTimeout(400);
const incidentUi = await page.evaluate(() => ({
  modalExists: !!document.getElementById("ops-incident-modal"),
  reasonSelectInDom: !!document.querySelector("#ops-incident-reason-code"),
  freeTextReason: !!document.querySelector("#ops-incident-reason")
}));
out.push({ step: "incident-ui", ...incidentUi });

const aside = await page.evaluate(() => {
  const a = document.querySelector(
    "#dispatcher-daily-plan-full aside, .daily-situation, #daily-situation"
  );
  if (!a) return { found: false };
  return {
    found: true,
    hidden:
      a.classList.contains("hidden") ||
      a.hasAttribute("hidden") ||
      getComputedStyle(a).display === "none",
    text: (a.innerText || "").slice(0, 200)
  };
});
out.push({ step: "daily-aside", ...aside });

// Deeper daily actions when plan is open
await page.evaluate(() => window.switchSection?.("dispatcher-daily-plan-pick"));
await page.waitForTimeout(300);
await page.evaluate(() => {
  document.querySelector("#dispatcher-daily-plan-pick [data-action]")?.click();
});
await page.waitForTimeout(600);
const dailyActions = await page.evaluate(() => {
  const el = document.getElementById("dispatcher-daily-plan-full");
  if (!el || el.classList.contains("hidden")) return { open: false };
  const actions = [...el.querySelectorAll("[data-action]")]
    .filter((b) => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    })
    .map((b) => b.getAttribute("data-action"))
    .filter(Boolean);
  const unique = [...new Set(actions)];
  const cells = el.querySelectorAll(".shift-cell, .daily-slot, [data-driver-id], .plan-row").length;
  return { open: true, uniqueActions: unique, cellish: cells };
});
out.push({ step: "daily-actions", ...dailyActions });
await shot("06-daily-actions");

// Try open group hub from daily / ops
await page.evaluate(() => window.switchSection?.("dispatcher-dashboard"));
await page.waitForTimeout(400);
const hubOpen = await page.evaluate(() => {
  const btn = document.querySelector('[data-action="openDispatcherGroupHub"]');
  if (btn) {
    btn.click();
    return "click";
  }
  if (typeof window.openDispatcherGroupHub === "function") {
    window.openDispatcherGroupHub("101");
    return "api";
  }
  return null;
});
await page.waitForTimeout(700);
out.push({
  step: "group-hub",
  how: hubOpen,
  hub: await sectionInfo("dispatcher-group-hub")
});
await shot("07-group-hub");

fs.writeFileSync("reports/dispo-eval-live-pass.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
