import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("dispatcher bus management uses authenticated group-scoped APIs", async () => {
  const [client, ui, routes] = await Promise.all([
    read("../../js/core/api-client.js"),
    read("../../js/data/buses-routes.js"),
    read("../../server/driver-routes.js")
  ]);

  assert.match(client, /createStaffBus/);
  assert.match(client, /setStaffBusActive/);
  assert.match(ui, /ApiClient\.createStaffBus/);
  assert.match(ui, /ApiClient\.setStaffBusActive/);
  assert.match(routes, /app\.post\("\/api\/staff\/buses"/);
  assert.match(routes, /dispatcherCanAccessGroup\(req\.staff\.groups, parsed\.data\.groupId\)/);
  assert.match(routes, /app\.put\("\/api\/staff\/buses\/:busId\/status"/);
  assert.match(routes, /bus_created/);
});

test("daily plan Edit opens the visible shift editor before focusing its form", async () => {
  const shifts = await read("../../js/dispatcher/shifts.js");
  assert.match(shifts, /function openShiftCell[\s\S]*switchSection\("dispatcher-shifts"\)/);
  assert.match(shifts, /shift-form-grid[\s\S]*scrollIntoView/);
});

test("staff dashboard cards and native options keep explicit dark-theme contrast", async () => {
  const css = await read("../../css/staff-desktop.css");
  assert.match(css, /button\.dashboard-group-card\s*\{[\s\S]*color:\s*var\(--text-main\)/);
  assert.match(css, /select option\s*\{[\s\S]*background:\s*var\(--bg-darker\)[\s\S]*color:\s*var\(--text-main\)/);
});
