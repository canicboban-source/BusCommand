/**
 * Ephemeral QA entity factory for Playwright.
 * Data exists only for the duration of a test run — never shipped in product source/dist.
 */
const crypto = require("crypto");

function randomId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function createQaTenantId() {
  return randomId("qa");
}

/**
 * Minimal in-memory tenant for isolated local-state E2E.
 * Synthetic names/emails only; unique tenant id per call when requested.
 */
function createEphemeralQaState(overrides = {}) {
  const companyId = overrides.companyId || "qa-local";
  const groupId = overrides.groupId || "g1";
  const saEmail = overrides.saEmail || "sa@qa.local";
  const caEmail = overrides.caEmail || "ca@qa.local";
  const dispoEmail = overrides.dispoEmail || "dispo@qa.local";
  const password = overrides.password || "Qa-test-ok-9";
  const driverName = overrides.driverName || "E2E Driver";
  const driverPin = overrides.driverPin || "1234";

  const state = {
    language: "en",
    sosActive: false,
    sosDriver: "",
    sosBus: "",
    groups: [{ id: groupId, name: `Line ${groupId}`, color: "#3D7EF5", active: true, companyId }],
    dispatchers: [
      {
        id: "superadmin",
        name: "QA Super Admin",
        email: saEmail,
        password,
        isSuperAdmin: true
      },
      {
        id: overrides.dispoId || "dispo-qa-1",
        name: "QA Dispatcher",
        email: dispoEmail,
        password,
        passwordChanged: true,
        groups: [groupId],
        companyId,
        country: "DE",
        active: true
      }
    ],
    drivers: [
      {
        id: overrides.driverId || "drv-e2e",
        name: driverName,
        pin: driverPin,
        bus: "101",
        groupId,
        lineId: groupId,
        // Active by default — assignment mutations refuse inactive drivers (D24.1.1).
        active: true,
        companyId
      }
    ],
    buses: [],
    routes: [{ id: `route-${groupId}`, name: `Line ${groupId}`, groupId, companyId }],
    reports: [],
    vacations: [],
    messages: [],
    lostItems: [],
    branding: { name: "QA Tenant", primaryColor: "#3D7EF5", logo: null },
    schedules: [],
    tomorrowShifts: [],
    onboardingDone: true,
    companyAdminOnboardingDone: true,
    activeGroupFilter: null,
    shifts: [],
    companyAdmins: [
      {
        id: overrides.caId || "ca-qa-1",
        name: "QA Company Admin",
        email: caEmail,
        password,
        companyId,
        role: "company-admin",
        active: true
      }
    ],
    shiftCatalog: null,
    shiftCatalogs: {},
    servicePlans: [],
    bereitschaftDriver: null,
    e2eFixture: true,
    ...(overrides.state || {})
  };

  return {
    companyId,
    groupId,
    saEmail,
    caEmail,
    dispoEmail,
    password,
    driverName,
    driverPin,
    state
  };
}

/**
 * Enable QA harness + seed ephemeral state before any app script runs.
 */
async function installQaHarness(page, fixture = createEphemeralQaState()) {
  const { companyId, state } = fixture;
  await page.addInitScript(
    ({ seeded, companyId: cid }) => {
      window.__BUSCOMMAND_QA_HARNESS__ = true;
      window.__BUSCOMMAND_QA_COMPANY_ID__ = cid;
      [
        "buscommand_demo_state_v2",
        "buscommand_demo_state_v3",
        "buscommand_state_demo"
      ].forEach((k) => {
        try {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        } catch { /* ignore */ }
      });
      const key = "buscommand_state_" + cid;
      localStorage.setItem(key, JSON.stringify(seeded));
      sessionStorage.setItem(key, JSON.stringify(seeded));
      localStorage.setItem("buscommand_lang", "en");
      sessionStorage.setItem("buscommand_pretrip_done", "true");
    },
    { seeded: state, companyId }
  );
  return fixture;
}

module.exports = {
  createQaTenantId,
  createEphemeralQaState,
  installQaHarness
};
