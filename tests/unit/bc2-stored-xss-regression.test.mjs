
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

const WIDE23_PAYLOAD = '<img src=x onerror="window.__wide23=1">';
const WIDE23_SAFE_NAME = "Linija 310";
const WIDE23_SPECIAL_NAME = `A & B <C> "D" 'E'`;

function htmlStartTags(html) {
  const tags = [];
  const re = /<([a-zA-Z][a-zA-Z0-9:-]*)\b([^>]*)>/g;
  let match;
  while ((match = re.exec(html))) {
    tags.push({ name: match[1].toLowerCase(), attrs: match[2] || "" });
  }
  return tags;
}

function decodeBasicEntities(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
}

function visibleText(html) {
  return decodeBasicEntities(String(html).replace(/<[^>]+>/g, " "));
}

function wide23Groups() {
  return [
    { id: "310", lineId: "310", name: WIDE23_SAFE_NAME, color: "#10B981" },
    { id: "311", lineId: "311", name: WIDE23_PAYLOAD, color: "#0EA5E9" },
    { id: "312", lineId: "312", name: WIDE23_SPECIAL_NAME, color: "#F59E0B" }
  ];
}

function installWide23Dom(nodes) {
  global.window = {
    location: { hostname: "localhost", search: "", href: "http://localhost/" },
    TRANSLATIONS: { en: {} },
    __wide23: undefined,
    state: {
      language: "en",
      activeGroupHubId: null,
      groups: wide23Groups(),
      drivers: [],
      buses: [],
      dispatchers: [],
      plans: [],
      shifts: [],
      schedules: [],
      routes: []
    },
    currentUser: { role: "company-admin", id: "ca1", companyId: "co1" },
    addEventListener() {},
    removeEventListener() {}
  };
  global.document = {
    getElementById: (id) => nodes[id] || null,
    createElement: () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {}, querySelector() { return null; }, addEventListener() {} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    body: { appendChild() {}, addEventListener() {} }
  };
  global.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
  global.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
  global.lucide = { createIcons() {} };
}

function assertEncodedGroupNameHtml(html, expectedButtons) {
  const tags = htmlStartTags(html);
  const text = visibleText(html);
  assert.match(html, /Linija 310/, "Safe group name stays visible and unescaped");
  assert.equal(html.includes(WIDE23_PAYLOAD), false, "Raw XSS payload must not appear in HTML");
  assert.equal(tags.some((tag) => tag.name === "img"), false, "Payload must not become an <img> element");
  assert.equal(
    tags.some((tag) => /\son(?:error|load|click)\s*=/i.test(tag.attrs)),
    false,
    "No executable onerror/onload/onclick attribute"
  );
  assert.match(html, /&lt;img/, "Dangerous markup is entity-encoded");
  assert.match(text, /<img src=x onerror="window\.__wide23=1">/, "Encoded payload is shown as text");
  assert.equal(global.window.__wide23, undefined, "onerror handler must not run");
  assert.match(html, /&amp;/, "Ampersand is encoded");
  assert.match(html, /&lt;C&gt;/, "Angle brackets are encoded");
  assert.match(html, /&quot;D&quot;/, "Double quotes are encoded");
  assert.match(html, /&#039;E&#039;/, "Apostrophe is encoded");
  assert.match(text, /A & B <C> "D" 'E'/, "Special characters remain readable as text");
  assert.equal(
    tags.filter((tag) => tag.name === "button").length,
    expectedButtons,
    "Special characters must not break card markup"
  );
}

function assertPickerTemplate(html) {
  assert.match(html, /dashboard-group-card/, "Public picker must use renderGroupsPickerGrid card markup");
  assert.match(html, /font-size:1\.15rem;font-weight:700/, "Public picker must execute the escaped name line");
}

test("WIDE-23 group-hub picker escapes stored group names in innerHTML", async () => {
  const daily = { innerHTML: "" };
  const monthly = { innerHTML: "" };
  installWide23Dom({
    "daily-plan-groups-grid": daily,
    "monthly-plan-groups-grid": monthly
  });

  const mod = await import("../../js/dispatcher/group-hub.js?wide23-picker");
  mod.renderPlanGroupPicker("daily");
  mod.renderPlanGroupPicker("monthly");

  assertPickerTemplate(daily.innerHTML);
  assertPickerTemplate(monthly.innerHTML);
  assertEncodedGroupNameHtml(daily.innerHTML, 3);
  assertEncodedGroupNameHtml(monthly.innerHTML, 3);
});

test("WIDE-23 sibling group filter/list escapes stored group names in innerHTML", async () => {
  const filterBar = { innerHTML: "" };
  const list = { innerHTML: "" };
  installWide23Dom({
    "group-filter-bar-shifts": filterBar,
    "groups-list": list
  });

  const mod = await import("../../js/data/groups.js?wide23-groups");
  mod.renderGroupFilterBar("group-filter-bar-shifts");
  mod.renderGroupsList();

  assert.match(filterBar.innerHTML, /bc-filter-chip is-line/, "Shifts filter bar must render group chips");
  assertEncodedGroupNameHtml(filterBar.innerHTML, 4);
  assert.match(list.innerHTML, /bc-list-title is-bold/, "Groups list must render the title sink");
  assertEncodedGroupNameHtml(list.innerHTML, 6);
});

test("WIDE-23 group description escapes in groups list innerHTML", async () => {
  const DESC_PAYLOAD = '<img src=x onerror="window.__wide23Description=1">';
  const list = { innerHTML: "" };
  installWide23Dom({ "groups-list": list });
  global.window.__wide23Description = undefined;
  global.window.state.groups = [
    { id: "310", lineId: "310", name: "Linija 310", color: "#10B981", description: "Jutarnja linija" },
    { id: "311", lineId: "311", name: "Linija 311", color: "#0EA5E9", description: DESC_PAYLOAD },
    { id: "312", lineId: "312", name: "Linija 312", color: "#F59E0B", description: "" },
    { id: "313", lineId: "313", name: "Linija 313", color: "#8B5CF6", description: null }
  ];

  const mod = await import("../../js/data/groups.js?wide23-desc");
  mod.renderGroupsList();

  const html = list.innerHTML;
  const tags = htmlStartTags(html);
  const text = visibleText(html);

  assert.match(html, /Jutarnja linija/, "Normal description stays visible");
  assert.equal(html.includes(DESC_PAYLOAD), false, "Raw description payload must not appear in HTML");
  assert.equal(tags.some((tag) => tag.name === "img"), false, "Description payload must not become an <img> element");
  assert.equal(
    tags.some((tag) => /\son(?:error|load|click)\s*=/i.test(tag.attrs)),
    false,
    "No executable onerror/onload/onclick attribute from description"
  );
  assert.equal(global.window.__wide23Description, undefined, "description onerror handler must not run");
  assert.match(html, /&lt;img/, "Dangerous description markup is entity-encoded");
  assert.match(text, /<img src=x onerror="window\.__wide23Description=1">/, "Encoded description is shown as text");
  assert.match(html, /Linija 312/, "Empty description still renders the group");
  assert.match(html, /Linija 313/, "Null description still renders the group");
  assert.doesNotMatch(html, /Linija 312[\s\S]{0,120} · <\/div>/, "Empty description must not append a separator");
  assert.doesNotMatch(html, /Linija 313[\s\S]{0,120} · <\/div>/, "Null description must not append a separator");
});

test("WIDE-23 sibling monthly group chips escape stored group names in innerHTML", async () => {
  const chips = { innerHTML: "" };
  installWide23Dom({ "monthly-groups-list": chips });

  const mod = await import("../../js/dispatcher/monthly-plans.js?wide23-monthly");
  mod.renderMonthlyPlansView();

  assert.match(chips.innerHTML, /selectMonthlyPlanGroup/, "Standalone monthly view must render group chips");
  assertEncodedGroupNameHtml(chips.innerHTML, 3);
});

