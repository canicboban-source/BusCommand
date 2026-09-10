import test from "node:test";
import assert from "node:assert/strict";
import { registerPlanEditLockRoutes, ensureAssignmentDayLock, requirePlanLockForAssignment, _resetPlanLocksForTests } from "../../server/plan-edit-lock-routes.js";

test("tenant lock isolation across every route and assignment checks", async () => {
  _resetPlanLocksForTests();
  const handlers = new Map();
  const app = Object.fromEntries(["get", "post"].map(method => [method, (path, ...fns) => handlers.set(method + path, fns.at(-1))]));
  registerPlanEditLockRoutes(app, { requireStaff() {} });
  const lockId = "day:101:2026-09-10";
  async function call(action, companyId, uid, role = "dispatcher") {
    const get = action === "get";
    const req = { staff: { companyId, uid, role, groups: ["101"], name: uid }, body: { scopeType: "day", groupId: "101", scopeKey: "2026-09-10", lockId, reason: "Authorized recovery" }, params: { lockId } };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
    await handlers.get((get ? "get" : "post") + "/api/staff/plan-locks/" + (get ? ":lockId" : action))(req, res);
    return res;
  }
  assert.equal((await call("acquire", "A", "a")).body.success, true);
  assert.equal((await call("get", "B", "b")).body.lock, null);
  assert.equal((await call("heartbeat", "B", "a")).code, 404);
  assert.equal((await call("release", "B", "a")).body.success, true);
  assert.equal((await call("break", "B", "admin", "company_admin")).body.previous, null);
  assert.equal((await call("get", "A", "a")).body.lock.holderUid, "a");
  assert.equal((await call("acquire", "B", "b")).body.success, true);
  assert.equal((await call("acquire", "A", "other")).code, 409);
  assert.equal((await call("heartbeat", "B", "b")).body.lock.holderUid, "b");
  assert.equal(requirePlanLockForAssignment({ companyId: "A", uid: "b" }, "101", "2026-09-10").ok, false);
  assert.equal(requirePlanLockForAssignment({ companyId: "B", uid: "b" }, "101", "2026-09-10").ok, true);
  assert.equal((await ensureAssignmentDayLock({ db: null, companyId: "C", staff: { uid: "c" }, groupId: "101", dateStr: "2026-09-10" })).ok, true);
  await call("break", "B", "admin", "company_admin");
  assert.equal((await call("get", "B", "b")).body.lock, null);
  assert.equal((await call("get", "A", "a")).body.lock.holderUid, "a");
});
