const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldRequireAck,
  buildDeliveryFields,
  planMessageAck,
  planMessageRead,
  isAwaitingDriverReceipt,
  classifyOutboundForStaff
} = require("../../server/message-lifecycle");

test("urgent templates require ack by default; explicit false wins", () => {
  assert.equal(shouldRequireAck({ template: "tmpl_call_dispatch", type: "urgent" }), true);
  assert.equal(shouldRequireAck({ template: "tmpl_delay_5", type: "warning" }), false);
  assert.equal(shouldRequireAck({ requiresAck: true, template: "tmpl_delay_5" }), true);
  assert.equal(shouldRequireAck({ requiresAck: false, template: "tmpl_call_dispatch", type: "urgent" }), false);
});

test("in-app delivery fields start as delivered with optional ack", () => {
  const fields = buildDeliveryFields({
    requiresAck: true,
    nowIso: "2026-08-04T10:00:00.000Z",
    idempotencyKey: "abc12345"
  });
  assert.equal(fields.status, "delivered");
  assert.equal(fields.deliveryChannel, "in_app");
  assert.equal(fields.requiresAck, true);
  assert.equal(fields.ackedAt, null);
  assert.equal(fields.idempotencyKey, "abc12345");
});

test("ack plan rejects non-critical and stamps critical", () => {
  const denied = planMessageAck({ requiresAck: false }, "drv1");
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "ack_not_required");

  const ok = planMessageAck({ requiresAck: true, broadcast: false }, "drv1", "2026-08-04T11:00:00.000Z");
  assert.equal(ok.ok, true);
  assert.equal(ok.patch.status, "read");
  assert.equal(ok.patch.ackedBy, "drv1");

  const again = planMessageAck({
    requiresAck: true,
    ackedAt: "2026-08-04T11:00:00.000Z",
    ackedBy: "drv1"
  }, "drv1");
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
});

test("read plan marks personal messages read", () => {
  const plan = planMessageRead({ broadcast: false }, "drv1", "2026-08-04T12:00:00.000Z");
  assert.equal(plan.ok, true);
  assert.equal(plan.patch.status, "read");
  assert.equal(plan.patch.read, true);
});

test("awaiting receipt and staff classification cover ack/read/failed", () => {
  assert.equal(isAwaitingDriverReceipt({
    requiresAck: true,
    status: "delivered"
  }), true);
  assert.equal(isAwaitingDriverReceipt({
    requiresAck: true,
    ackedAt: "2026-08-04T12:00:00.000Z",
    status: "read"
  }), false);
  assert.equal(classifyOutboundForStaff({
    requiresAck: true,
    status: "delivered"
  }).kind, "awaiting_ack");
  assert.equal(classifyOutboundForStaff({
    status: "failed"
  }).kind, "delivery_failed");
  assert.equal(classifyOutboundForStaff({
    status: "read",
    read: true
  }).kind, "read");
});
