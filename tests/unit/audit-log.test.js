const assert = require("node:assert/strict");
const test = require("node:test");

const { categoryFor, listAuditEvents, normalizeAuditFilters, normalizeStateSyncDetails, sanitizeDetails } = require("../../server/audit-log");

function fakeDb(rows) {
  const chain = {
    orderBy() { return this; },
    startAfter(value) { this.cursor = value; return this; },
    limit(value) { this.max = value; return this; },
    async get() {
      const filtered = this.cursor ? rows.filter(row => new Date(row.timestamp) < this.cursor) : rows;
      return { docs: filtered.slice(0, this.max).map(row => ({ id: row.id, data: () => row })) };
    }
  };
  return { collection: () => ({ doc: () => ({ collection: () => chain }) }) };
}

test("audit details redact credentials and bound nested payloads", () => {
  const safe = sanitizeDetails({ password: "no", token: "no", pinCode: "no", groupId: "north", nested: { authorization: "no", count: 2 } });
  assert.deepEqual(safe, { groupId: "north", nested: { count: 2 } });
  assert.equal(sanitizeDetails("x".repeat(300)).length, 180);
});

test("audit filters are bounded and state-sync accepts only known counters", () => {
  assert.equal(normalizeAuditFilters({ limit: 999, category: "invalid" }).limit, 50);
  assert.equal(normalizeAuditFilters({ limit: 1 }).limit, 10);
  assert.deepEqual(normalizeStateSyncDetails({ collections: { buses: { added: 4 }, secrets: { added: 9 } }, sosChanged: true }), {
    collections: { buses: { added: 4, updated: 0, removed: 0 } }, sosChanged: true
  });
});

test("company audit listing filters by category and never returns sensitive fields", async () => {
  const rows = [
    { id: "a", action: "driver_login_success", actorId: "driver-1", timestamp: "2026-07-22T10:00:00.000Z", details: { pin: "1234", bus: "310" } },
    { id: "b", action: "service_plan_published", actorId: "admin-1", timestamp: "2026-07-22T09:00:00.000Z", details: { companyCode: "secret", planVersion: "66" } }
  ];
  const result = await listAuditEvents({ db: fakeDb(rows), companyId: "alpha", filters: { category: "plans", limit: 10 } });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].id, "b");
  assert.deepEqual(result.events[0].details, { planVersion: "66" });
  assert.equal(categoryFor("shift_assigned"), "scheduling");
});
