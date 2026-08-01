import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("daily and monthly group cards register working delegated handlers", () => {
  const hub = readFileSync(join(root, "js/dispatcher/group-hub.js"), "utf8");
  const staffActions = readFileSync(join(root, "js/register-onclick-staff.js"), "utf8");

  assert.match(hub, /renderGroupsPickerGrid\("daily-plan-groups-grid", "openDailyPlanForGroup"\)/);
  assert.match(hub, /renderGroupsPickerGrid\("monthly-plan-groups-grid", "openMonthlyPlanForGroup"\)/);
  assert.match(staffActions, /import\s*\{[^}]*openDailyPlanForGroup[^}]*openMonthlyPlanForGroup[^}]*\}\s*from "\.\/dispatcher\/group-hub\.js"/s);
  assert.match(staffActions, /openDailyPlanForGroup,/);
  assert.match(staffActions, /openMonthlyPlanForGroup,/);
});
