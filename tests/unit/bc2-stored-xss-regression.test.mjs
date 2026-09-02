
import test from "node:test";
import assert from "node:assert/strict";

const DRIVER_PAYLOAD = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='driver'>";
const GROUP_PAYLOAD = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='group'>";
const SHIFT_PAYLOAD = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='shift'>";
const TOAST_PAYLOAD = "<img/src=x/onerror=window.__BC_XSS_SENTINEL__='toast'>";

test("BC-2 XSS: shift-grid driver name escapes domain-controlled text", async () => {
  global.window = {
    location: { hostname: "localhost" },
    TRANSLATIONS: { en: {} },
    state: {
      language: "en",
      buses: [],
      drivers: [{ id: "d1", name: DRIVER_PAYLOAD, groupId: "g1" }],
      groups: [],
      shifts: [],
      activeGroupFilter: null
    }
  };
  const container = { innerHTML: "" };
  global.document = {
    createElement: () => ({}),
    getElementById: (id) => id === "shifts-weekly-grid" ? container : null
  };
  const mod = await import("../../js/dispatcher/shift-grid.js");
  mod.renderShiftsWeeklyGrid([new Date("2024-01-01")]);
  assert.equal(container.innerHTML.includes(DRIVER_PAYLOAD), false, "Driver name must be escaped");
});

test("BC-2 XSS: shift-grid group name escapes domain-controlled text", async () => {
  global.window = {
    location: { hostname: "localhost" },
    TRANSLATIONS: { en: {} },
    state: {
      language: "en",
      buses: [],
      drivers: [{ id: "d1", name: "Safe Name", groupId: "g1" }],
      groups: [{ id: "g1", name: GROUP_PAYLOAD, color: "#f00" }],
      shifts: [],
      activeGroupFilter: null
    }
  };
  const container = { innerHTML: "" };
  global.document = {
    createElement: () => ({}),
    getElementById: (id) => id === "shifts-weekly-grid" ? container : null
  };
  const mod = await import("../../js/dispatcher/shift-grid.js?group");
  mod.renderShiftsWeeklyGrid([new Date("2024-01-01")]);
  assert.equal(container.innerHTML.includes(GROUP_PAYLOAD), false, "Group name must be escaped");
});

test("BC-2 XSS: shift-grid shift name escapes domain-controlled text", async () => {
  global.window = {
    location: { hostname: "localhost" },
    TRANSLATIONS: { en: {} },
    state: {
      language: "en",
      buses: [],
      drivers: [{ id: "d1", name: "Safe Name", groupId: "g1" }],
      groups: [{ id: "g1", name: "Safe Group", color: "#f00" }],
      shifts: [{ id: "s1", driverId: "d1", date: "2024-01-01", name: SHIFT_PAYLOAD, type: "morning" }],
      activeGroupFilter: null
    }
  };
  const container = { innerHTML: "" };
  global.document = {
    createElement: () => ({}),
    getElementById: (id) => id === "shifts-weekly-grid" ? container : null
  };
  const mod = await import("../../js/dispatcher/shift-grid.js?shift");
  mod.renderShiftsWeeklyGrid([new Date("2024-01-01")]);
  assert.equal(container.innerHTML.includes(SHIFT_PAYLOAD), false, "Shift name must be escaped");
});

test("BC-2 XSS: showToast rendering escapes message text", async () => {
  const msgEl = {};
  const toastEl = {
    classList: { add: () => {} },
    addEventListener: () => {},
    remove: () => {},
    innerHTML: "",
    querySelector: () => msgEl
  };
  const container = { appendChild: () => {} };
  global.document = {
    createElement: () => toastEl,
    getElementById: (id) => id === "toast-container" ? container : null
  };
  const mod = await import("../../js/core/utils.js?toast");
  mod.showToast(TOAST_PAYLOAD);
  assert.equal(toastEl.innerHTML.includes(TOAST_PAYLOAD), false, "Toast message must be escaped");
});

