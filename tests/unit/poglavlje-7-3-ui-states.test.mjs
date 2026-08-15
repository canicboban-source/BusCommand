import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("P7.3 driver plan confirm status reacts to pending targets and off days", async () => {
  const dash = await read("../../js/driver/dashboard.js");
  assert.match(dash, /updateDriverPlanConfirmStatus/);
  assert.match(dash, /driverWorkPolicy/);
  assert.match(dash, /driver_plan_pending/);
  assert.match(dash, /driver_plan_off_day/);
  assert.match(dash, /driver_stops_empty/);
  assert.match(dash, /driver-pwa-empty/);
});

test("P7.3 ops health and confirmation fetch failures are surfaced", async () => {
  const dash = await read("../../js/dispatcher/dashboard.js");
  const inbox = await read("../../js/driver/messages-inbox.js");
  assert.match(dash, /updateOpsPlanHealth/);
  assert.match(dash, /ops_plan_attention/);
  assert.match(dash, /ops_plan_stale/);
  assert.match(dash, /_confirmFetchFailed/);
  assert.match(dash, /ops_confirmations_load_failed/);
  assert.match(dash, /ops-loading/);
  assert.match(inbox, /msg_mark_read_failed/);
  assert.match(inbox, /showToast/);
});
