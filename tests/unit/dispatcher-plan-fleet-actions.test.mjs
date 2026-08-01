import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = relativePath => readFileSync(join(root, relativePath), "utf8");
const require = createRequire(import.meta.url);

function loadShiftPlan(drivers) {
  const source = read("js/core/shift-plan.js")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/export\s+\{([\s\S]*?)\};\s*$/m, (_, names) => `module.exports = { ${names} };`);
  const context = {
    module: { exports: {} },
    exports: {},
    window: { state: { drivers, schedules: [], shifts: [] }, currentUser: null },
    getActiveLineId: () => null,
    getBereitschaftCode: () => null,
    getScheduleByKey: key => context.window.state.schedules.find(item => item.id === key) || null,
    todayDateStr: () => "2026-08-01",
    Date,
    Object,
    String,
    Number,
    Array,
    Set,
    console: globalThis.console
  };
  vm.runInNewContext(source, context);
  return { api: context.module.exports, window: context.window };
}

test("clearing a shift removes canonical and legacy same-day overrides", () => {
  const driver = { id: "driver-a", name: "Alex Driver" };
  const { api, window } = loadShiftPlan([driver]);
  window.state.shifts = [
    { id: "legacy", driverName: driver.name, date: "2026-08-01", type: "morning", revision: 1 },
    { id: "canonical", driverId: driver.id, date: "2026-08-01", type: "night", revision: 2 }
  ];
  window.state.schedules = [{
    id: "driver-a_2026-08",
    driverId: driver.id,
    driverName: driver.name,
    month: "2026-08",
    parsedShifts: { 1: { type: "night", name: "310.601" } }
  }];

  api.setShiftForDriverDate(driver.name, "2026-08-01", { type: "clear", syncSchedule: true });

  assert.deepEqual(window.state.shifts, []);
  assert.equal(window.state.schedules[0].parsedShifts[1], undefined);
  assert.equal(api.getShiftForDriverDate(driver.name, "2026-08-01"), null);
});

function loadGroupHubWithPendingCatalog() {
  let resolveCatalog;
  const catalogPromise = new Promise(resolve => { resolveCatalog = resolve; });
  const opened = [];
  const source = read("js/dispatcher/group-hub.js")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/export\s+\{([\s\S]*?)\};\s*$/m, (_, names) => `module.exports = { ${names} };`);
  const context = {
    module: { exports: {} },
    exports: {},
    window: { state: { groups: [], drivers: [], buses: [], schedules: [] } },
    getFormedLineGroupIds: () => [],
    getGroupById: () => null,
    driverBelongsToLine: () => false,
    assignDriverToLine() {},
    saveState() {},
    activateShiftCatalogForLine() {},
    ensureShiftCatalogForEdit() {},
    loadActiveServicePlanForLine: () => catalogPromise,
    renderDailyPlanFullPage() {},
    renderMonthlyPlansFullPage() {},
    showToast() {},
    t: key => key,
    switchSection: section => { opened.push(section); return true; },
    console: globalThis.console,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    AbortController: globalThis.AbortController,
    Promise
  };
  vm.runInNewContext(source, context);
  return { api: context.module.exports, opened, resolveCatalog };
}

for (const [name, handler, section] of [
  ["daily", "openDailyPlanForGroup", "dispatcher-daily-plan-full"],
  ["monthly", "openMonthlyPlanForGroup", "dispatcher-monthly-plans-full"]
]) {
  test(`${name} plan opens before the optional service catalog request completes`, async () => {
    const { api, opened, resolveCatalog } = loadGroupHubWithPendingCatalog();
    const result = api[handler]("310");
    assert.deepEqual(opened, [section]);
    resolveCatalog(null);
    await result;
  });
}

test("dispatcher bus number edit is wired through a scoped server-owned API", () => {
  const server = read("server/driver-routes.js");
  const api = read("js/core/api-client.js");
  const client = read("js/data/buses-routes.js");
  const handlers = read("js/register-onclick-staff.js");

  assert.match(server, /app\.put\("\/api\/staff\/buses\/:busId",/);
  assert.match(server, /bus_updated/);
  assert.match(server, /dispatcherCanAccessGroup\(req\.staff\.groups, groupId\)/);
  assert.match(api, /updateStaffBus/);
  assert.match(client, /ApiClient\.updateStaffBus/);
  assert.doesNotMatch(client, /showToast\(result\?\.error/);
  assert.match(client, /startEditBus/);
  assert.match(client, /saveBusEdit/);
  assert.match(handlers, /startEditBus/);
  assert.match(handlers, /saveBusEdit/);
});

test("dispatcher bus update commits the number and audit together", async () => {
  const { registerDriverRoutes } = require("../../server/driver-routes.js");
  const routes = new Map();
  const writes = [];
  const busRef = { kind: "bus", id: "bus-1" };
  const auditRef = { kind: "audit", id: "audit-1" };
  const busData = { number: "91504", groupId: "310", lineId: "310", active: true };
  const companyRef = {
    collection(name) {
      if (name === "buses") {
        return {
          doc: id => ({ ...busRef, id }),
          where: (_field, _operator, number) => ({
            kind: "duplicate-query",
            number,
            limit() { return this; }
          })
        };
      }
      if (name === "audit_log") return { doc: () => auditRef };
      return { doc: id => ({ kind: name, id }) };
    }
  };
  const database = {
    collection: () => ({ doc: () => companyRef }),
    runTransaction: async callback => callback({
      async get(ref) {
        if (ref.kind === "bus") return { exists: true, id: ref.id, data: () => ({ ...busData }) };
        if (ref.kind === "duplicate-query") return { docs: [] };
        throw new Error(`unexpected read ${ref.kind}`);
      },
      update(ref, data) { writes.push({ method: "update", ref, data }); },
      set(ref, data) { writes.push({ method: "set", ref, data }); }
    })
  };
  const app = {
    use() {},
    get(path, ...handlers) { routes.set(`GET ${path}`, handlers.at(-1)); },
    post(path, ...handlers) { routes.set(`POST ${path}`, handlers.at(-1)); },
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => "ts" } } }),
    db: () => database,
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "test",
    logAudit: async () => {}
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await routes.get("PUT /api/staff/buses/:busId")({
    params: { busId: "bus-1" },
    body: { number: "91505" },
    staff: { uid: "dispatcher-1", role: "dispatcher", companyId: "alpha", groups: ["310"] },
    log: { error() {} }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.bus.number, "91505");
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0], {
    method: "update",
    ref: busRef,
    data: { number: "91505", updatedAt: "ts", updatedBy: "dispatcher-1" }
  });
  assert.equal(writes[1].method, "set");
  assert.equal(writes[1].ref, auditRef);
  assert.equal(writes[1].data.action, "bus_updated");
  assert.deepEqual(writes[1].data.details, {
    busId: "bus-1",
    groupId: "310",
    previousNumber: "91504",
    newNumber: "91505"
  });
});

test("dispatcher bus update rejects a bus outside assigned groups without writing", async () => {
  const { registerDriverRoutes } = require("../../server/driver-routes.js");
  const routes = new Map();
  const writes = [];
  const companyRef = {
    collection(name) {
      if (name === "buses") {
        return {
          doc: id => ({ kind: "bus", id }),
          where: () => ({ kind: "duplicate-query", limit() { return this; } })
        };
      }
      if (name === "audit_log") return { doc: () => ({ kind: "audit", id: "audit-1" }) };
      return { doc: id => ({ kind: name, id }) };
    }
  };
  const database = {
    collection: () => ({ doc: () => companyRef }),
    runTransaction: async callback => callback({
      async get(ref) {
        if (ref.kind === "bus") {
          return { exists: true, id: ref.id, data: () => ({ number: "91504", groupId: "999", active: true }) };
        }
        if (ref.kind === "duplicate-query") return { docs: [] };
        throw new Error(`unexpected read ${ref.kind}`);
      },
      update(ref, data) { writes.push({ method: "update", ref, data }); },
      set(ref, data) { writes.push({ method: "set", ref, data }); }
    })
  };
  const app = {
    use() {},
    get() {},
    post() {},
    put(path, ...handlers) { routes.set(`PUT ${path}`, handlers.at(-1)); }
  };
  registerDriverRoutes(app, {
    admin: () => ({ firestore: { FieldValue: { serverTimestamp: () => "ts" } } }),
    db: () => database,
    hasFirebase: () => true,
    rateLimit: () => (_req, _res, next) => next(),
    clearRateLimit() {},
    getClientIp: () => "test",
    logAudit: async () => {}
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };

  await routes.get("PUT /api/staff/buses/:busId")({
    params: { busId: "bus-1" },
    body: { number: "91505" },
    staff: { uid: "dispatcher-1", role: "dispatcher", companyId: "alpha", groups: ["310"] },
    log: { error() {} }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "bus_group_denied");
  assert.deepEqual(writes, []);
});

test("monthly shift edit model preserves listed selections and valid existing duty times", async () => {
  const modelUrl = pathToFileURL(join(root, "js/dispatcher/monthly-shift-edit-model.js")).href;
  const model = await import(modelUrl);

  assert.deepEqual(model.splitListedValue("91504", ["91504"]), {
    selectValue: "91504",
    customValue: ""
  });
  assert.deepEqual(model.splitListedValue("91504", []), {
    selectValue: "",
    customValue: "91504"
  });
  assert.deepEqual(model.resolveMonthlyShiftTimes({
    type: "night",
    catalogEntry: { type: "night" },
    existingShift: { start: "22:10", end: "05:20" }
  }), { start: "22:10", end: "05:20", valid: true });
  assert.deepEqual(model.resolveMonthlyShiftTimes({
    type: "night",
    catalogEntry: { type: "night" },
    existingShift: {}
  }), { start: null, end: null, valid: false });
});
