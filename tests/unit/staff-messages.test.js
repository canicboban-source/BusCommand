const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  staffMessageSchema,
  messageTypeForTemplate,
  staffCanAccessGroup,
  resolveStaffMessageTargets,
  buildStaffMessageDoc,
  STAFF_MESSAGE_TEMPLATES
} = require("../../server/staff-messages");
const { categoryFor } = require("../../server/audit-log");

const drivers = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Alex", groupId: "g1", active: true },
  { id: "22222222-2222-4222-8222-222222222222", name: "Sam", groupId: "g2", active: true },
  { id: "33333333-3333-4333-8333-333333333333", name: "Inactive", groupId: "g1", active: false }
];
const groups = [{ id: "g1", name: "North" }, { id: "g2", name: "South" }];

test("staff message schema accepts known templates and modes", () => {
  const ok = staffMessageSchema.safeParse({
    mode: "driver",
    recipientDriverId: drivers[0].id,
    template: "tmpl_delay_15",
    detail: "Stop 12"
  });
  assert.equal(ok.success, true);
  assert.equal(STAFF_MESSAGE_TEMPLATES.includes("tmpl_delay_15"), true);

  const bad = staffMessageSchema.safeParse({
    mode: "driver",
    recipientDriverId: drivers[0].id,
    template: "tmpl_unknown"
  });
  assert.equal(bad.success, false);
});

test("message type inference matches dispatcher templates", () => {
  assert.equal(messageTypeForTemplate("tmpl_delay_10"), "warning");
  assert.equal(messageTypeForTemplate("tmpl_call_dispatch"), "urgent");
  assert.equal(messageTypeForTemplate("tmpl_route_change"), "detour");
  assert.equal(messageTypeForTemplate("tmpl_take_break"), "info");
});

test("dispatcher cannot target drivers outside assigned groups", () => {
  const staff = { role: "dispatcher", groups: ["g1"] };
  assert.equal(staffCanAccessGroup(staff, "g1"), true);
  assert.equal(staffCanAccessGroup(staff, "g2"), false);

  const denied = resolveStaffMessageTargets({
    mode: "driver",
    recipientDriverId: drivers[1].id,
    staff,
    drivers,
    groups
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);

  const allowed = resolveStaffMessageTargets({
    mode: "driver",
    recipientDriverId: drivers[0].id,
    staff,
    drivers,
    groups
  });
  assert.equal(allowed.ok, true);
  assert.equal(allowed.targets.length, 1);
});

test("dispatcher broadcast fans out only to accessible drivers without broadcast flag", () => {
  const resolved = resolveStaffMessageTargets({
    mode: "broadcast",
    displayScope: "driver",
    staff: { role: "dispatcher", groups: ["g1"] },
    drivers,
    groups
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.broadcast, false);
  assert.equal(resolved.scope, "driver");
  assert.deepEqual(resolved.targets.map((t) => t.driverId), [drivers[0].id]);
});

test("company admin broadcast uses single company-wide message", () => {
  const resolved = resolveStaffMessageTargets({
    mode: "broadcast",
    displayScope: "group",
    staff: { role: "company_admin", groups: [] },
    drivers,
    groups
  });
  assert.equal(resolved.ok, true);
  assert.equal(resolved.broadcast, true);
  assert.equal(resolved.targets.length, 1);
  assert.equal(resolved.targets[0].driverId, null);
});

test("multi-group send unions drivers and enforces ACL per group", () => {
  const staff = { role: "dispatcher", groups: ["g1", "g2"] };
  const resolved = resolveStaffMessageTargets({
    mode: "group",
    groupIds: ["g1", "g2"],
    staff,
    drivers,
    groups
  });
  assert.equal(resolved.ok, true);
  assert.deepEqual(resolved.groupIds, ["g1", "g2"]);
  assert.equal(resolved.targets.length, 2);

  const denied = resolveStaffMessageTargets({
    mode: "group",
    groupIds: ["g1", "g2"],
    staff: { role: "dispatcher", groups: ["g1"] },
    drivers,
    groups
  });
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
});

test("buildStaffMessageDoc keeps driver delivery fields and ack flag", () => {
  const doc = buildStaffMessageDoc({
    id: "msg_abc",
    now: new Date("2026-07-24T10:05:00"),
    senderName: "Disp",
    senderUid: "staff-1",
    senderLang: "sr",
    template: "tmpl_delay_15",
    detail: "Stop 4",
    type: "warning",
    scope: "driver",
    broadcast: false,
    recipientName: "Alex",
    recipientDriverId: drivers[0].id,
    groupId: "g1",
    requiresAck: true
  });
  assert.equal(doc.recipientDriverId, drivers[0].id);
  assert.equal(doc.broadcast, false);
  assert.equal(doc.template, "tmpl_delay_15");
  assert.match(doc.text, /tmpl_delay_15/);
  assert.equal(doc.status, "delivered");
  assert.equal(doc.requiresAck, true);
  assert.equal(doc.deliveryChannel, "in_app");
});

test("staff message route and client compose use the API path", () => {
  const routes = fs.readFileSync(path.join(__dirname, "../../server/driver-routes.js"), "utf8");
  const compose = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/msg-compose.js"), "utf8");
  const api = fs.readFileSync(path.join(__dirname, "../../js/core/api-client.js"), "utf8");
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  const archive = fs.readFileSync(path.join(__dirname, "../../js/dispatcher/message-archive.js"), "utf8");
  const firebase = fs.readFileSync(path.join(__dirname, "../../js/core/firebase-service.js"), "utf8");

  assert.match(routes, /\/api\/staff\/messages/);
  assert.match(routes, /\/api\/staff\/messages\/:messageId\/archive/);
  assert.match(routes, /\/api\/driver\/messages\/:messageId\/ack/);
  assert.match(routes, /staff_message_sent/);
  assert.match(api, /sendStaffMessage/);
  assert.match(api, /archiveStaffMessage/);
  assert.match(api, /ackDriverMessage/);
  assert.match(compose, /ApiClient\.sendStaffMessage/);
  assert.match(compose, /requiresAck/);
  assert.match(compose, /groupIds/);
  assert.match(archive, /archiveStaffMessage/);
  assert.match(firebase, /item\.key === "messages"/);
  assert.match(rules, /messages\/\{msgId\}[\s\S]*?allow create: if false/);
  assert.equal(categoryFor("staff_message_sent"), "drivers");
});

test("server-created message ids are acknowledged without client message writes", () => {
  const firebase = fs.readFileSync(path.join(__dirname, "../../js/core/firebase-service.js"), "utf8");
  assert.match(firebase, /function acknowledgeServerCreatedIds/);
  assert.match(firebase, /item\.key === "messages"/);
});
