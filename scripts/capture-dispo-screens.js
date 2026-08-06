/**
 * Capture screenshots of every Dispo nav panel (+ full plans, attention, help).
 * Usage: node scripts/capture-dispo-screens.js
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 8766;
const BASE = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const OUT = path.join(__dirname, "..", "reports", "dispo-screenshots");

function todayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

function demoState() {
  const date = todayIso();
  return {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [{ id: "101", name: "Line 101", color: "#3D7EF5", active: true, companyId: "demo" }],
    dispatchers: [
      {
        id: "dispo-1",
        name: "Demo Dispatcher",
        email: "demo@buscommand.com",
        password: "demo123",
        passwordChanged: true,
        groups: ["101"],
        companyId: "demo",
        country: "AT"
      }
    ],
    drivers: [
      { id: "drv-1", name: "Anna Berger", groupId: "101", lineId: "101", active: true, bus: "B101", email: "a@t.test", phone: "+4301" },
      { id: "drv-2", name: "Marko Jović", groupId: "101", lineId: "101", active: true, bus: "", email: "m@t.test", phone: "+4302" },
      { id: "drv-3", name: "Stefan Hofer", groupId: "101", lineId: "101", active: true, bus: "B103", email: "s@t.test", phone: "+4303" },
      { id: "drv-4", name: "Standby Klein", groupId: "101", lineId: "101", active: true, bus: "", email: "k@t.test", phone: "+4304" }
    ],
    buses: [
      { id: "bus-1", number: "B101", groupId: "101", lineId: "101", groupIds: ["101"], active: true, garage: "Depot A", opsStatus: "ready" },
      { id: "bus-2", number: "B102", groupId: "101", lineId: "101", groupIds: ["101"], active: true, garage: "Depot A", opsStatus: "ready" },
      { id: "bus-3", number: "B103", groupId: "101", lineId: "101", groupIds: ["101"], active: true, garage: "Depot B", opsStatus: "ready" }
    ],
    routes: [{ id: "route-101", name: "Line 101", groupId: "101" }],
    reports: [
      {
        id: "rep-delay",
        type: "delay:10",
        status: "active",
        severity: "sev_medium",
        date,
        time: "08:15",
        driverId: "drv-1",
        driver: "Anna Berger",
        groupId: "101",
        bus: "B101",
        reason: "Traffic near Hauptbahnhof"
      },
      {
        id: "rep-cov",
        type: "coverage:disruption",
        status: "active",
        severity: "sev_high",
        date,
        time: "09:00",
        driverId: "drv-3",
        driver: "Stefan Hofer",
        groupId: "101",
        bus: "B103",
        reason: "ops_coverage_unavailable",
        description: "Called in sick"
      }
    ],
    vacations: [
      {
        id: "vac-1",
        driverId: "drv-2",
        driverName: "Marko Jović",
        from: date,
        to: date,
        status: "pending",
        reason: "Family"
      }
    ],
    messages: [
      {
        id: "msg-1",
        from: "Demo Dispatcher",
        to: "Anna Berger",
        text: "Please confirm next shift.",
        timestamp: Date.now() - 3600000,
        read: false
      }
    ],
    lostItems: [
      {
        id: "lost-1",
        description: "Black backpack",
        bus: "B101",
        date,
        status: "open",
        driver: "Anna Berger"
      }
    ],
    branding: { name: "BusCommand Demo", primaryColor: "#3D7EF5", logo: null },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true,
    activeGroupFilter: "101",
    activeGroupHubId: "101",
    shifts: [
      {
        id: `shf-1-${date}`,
        driverId: "drv-1",
        driverName: "Anna Berger",
        date,
        type: "morning",
        name: "101.S01",
        routeCode: "101.S01",
        bus: "B101",
        start: "05:15",
        end: "13:15",
        revision: 1
      },
      {
        id: `shf-2-${date}`,
        driverId: "drv-2",
        driverName: "Marko Jović",
        date,
        type: "morning",
        name: "101.S02",
        routeCode: "101.S02",
        bus: "",
        start: "05:30",
        end: "13:30",
        revision: 1
      },
      {
        id: `shf-3-${date}`,
        driverId: "drv-3",
        driverName: "Stefan Hofer",
        date,
        type: "morning",
        name: "101.S03",
        routeCode: "101.S03",
        bus: "B103",
        start: "06:00",
        end: "14:00",
        revision: 1
      },
      {
        id: `shf-4-${date}`,
        driverId: "drv-4",
        driverName: "Standby Klein",
        date,
        type: "bereitschaft",
        name: "Standby",
        routeCode: "",
        bus: "",
        revision: 1
      }
    ],
    companyAdmins: [
      { id: "ca-1", name: "Demo Admin", email: "admin@demo.com", password: "demo123", companyId: "demo", role: "company-admin" }
    ],
    shiftCatalogs: {
      "101": {
        lineId: "101",
        revision: 1,
        entries: {
          "101.S01": { code: "101.S01", label: "Early A", type: "morning", start: "05:15", end: "13:15" },
          "101.S02": { code: "101.S02", label: "Early B", type: "morning", start: "05:30", end: "13:30" },
          "101.S03": { code: "101.S03", label: "Mid", type: "morning", start: "06:00", end: "14:00" }
        }
      }
    },
    shiftCatalog: null,
    servicePlans: [],
    bereitschaftDriver: null
  };
}

async function shot(page, name) {
  const file = path.join(OUT, `${name}.png`);
  await page.waitForTimeout(350);
  await page.screenshot({ path: file, fullPage: false });
  console.log("OK", name);
  return file;
}

async function switchTo(page, sectionId) {
  await page.evaluate((id) => {
    const link = document.querySelector(`[data-action="switchSection"][data-action-args*="${id}"]`);
    if (link) {
      link.click();
      return;
    }
    if (typeof window.switchSection === "function") window.switchSection(id);
  }, sectionId);
  await page.waitForTimeout(500);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = demoState();

  await page.addInitScript((demoState) => {
    localStorage.removeItem("buscommand_demo_state_v2");
    sessionStorage.removeItem("buscommand_demo_state_v2");
    localStorage.setItem("buscommand_demo_state_v3", JSON.stringify(demoState));
    sessionStorage.setItem("buscommand_demo_state_v3", JSON.stringify(demoState));
    localStorage.setItem("buscommand_lang", "en");
    sessionStorage.setItem("buscommand_pretrip_done", "true");
  }, state);

  await page.goto(`${BASE}/staff.html?mode=demo`, { waitUntil: "domcontentloaded" });
  await page.locator("#tab-dispatcher-btn").click().catch(() => {});
  await page.locator("#login-dispatcher-email").fill("demo@buscommand.com");
  await page.locator("#login-dispatcher-password").fill("demo123");
  await page.locator("#dispatcher-login-btn").click();
  await page.locator("#app-container").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(800);

  const panels = [
    ["01-operations", "dispatcher-dashboard"],
    ["02-daily-plan-pick", "dispatcher-daily-plan-pick"],
    ["03-monthly-plan-pick", "dispatcher-monthly-plan-pick"],
    ["04-vehicles", "dispatcher-vehicles"],
    ["05-messages", "dispatcher-messages"],
    ["06-live-map", "dispatcher-live-map-section"],
    ["07-reports", "dispatcher-reports"],
    ["08-lost-found", "dispatcher-lost-found"],
    ["09-vacations", "dispatcher-vacations"]
  ];

  for (const [name, id] of panels) {
    await switchTo(page, id);
    await shot(page, name);
  }

  // Full daily plan
  await switchTo(page, "dispatcher-dashboard");
  await page.evaluate(() => {
    const btn = document.querySelector('#dashboard-groups-grid [data-action="openDailyPlanForGroup"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(700);
  await shot(page, "10-daily-plan-full");

  // Full monthly plan
  await switchTo(page, "dispatcher-monthly-plan-pick");
  await page.evaluate(() => {
    const btn = document.querySelector('#monthly-plan-groups-grid [data-action="openMonthlyPlanForGroup"]');
    if (btn) btn.click();
  });
  await page.waitForTimeout(700);
  await shot(page, "11-monthly-plan-full");

  // Assign shift (if nav reachable via section)
  await switchTo(page, "dispatcher-shifts");
  await shot(page, "12-assign-shift");

  // Needs attention overlay
  await switchTo(page, "dispatcher-dashboard");
  await page.locator("#ops-plan-health").click().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, "13-needs-attention");
  await page.locator(".ops-attention-close").click({ force: true }).catch(() => {});
  await page.evaluate(() => {
    const layer = document.getElementById("ops-attention-panel");
    if (layer) {
      layer.classList.add("hidden");
      layer.style.display = "none";
    }
    document.body.classList.remove("ops-attention-open");
  });

  // Help modal
  await page.locator("#dispatcher-help-btn").click().catch(() => {});
  await page.waitForTimeout(400);
  await shot(page, "14-help");
  await page.locator("[data-action='closeDispatcherHelp']").first().click({ force: true }).catch(() => {});

  // Group hub (legacy soft-split)
  await page.evaluate(() => {
    if (typeof window.openGroupHub === "function") window.openGroupHub("101");
  });
  await page.waitForTimeout(600);
  await shot(page, "15-group-hub");

  await browser.close();
  console.log("DONE", OUT);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
