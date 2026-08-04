const test = require("node:test");
const assert = require("node:assert/strict");
const { createSupportSessionHandlers } = require("../../server/support-session");

class Snapshot {
  constructor(ref, value) {
    this.ref = ref;
    this.id = ref.id;
    this._value = value;
    this.exists = value !== undefined;
  }
  data() { return this._value; }
}

class Ref {
  constructor(database, path) {
    this.database = database;
    this.path = path;
    this.id = path.split("/").at(-1);
  }
  collection(name) { return new Collection(this.database, this.path + "/" + name); }
}

class Collection {
  constructor(database, path) {
    this.database = database;
    this.path = path;
  }
  doc(id) {
    const value = id || "audit_" + (++this.database.auditSequence);
    return new Ref(this.database, this.path + "/" + value);
  }
}

class MemoryDb {
  constructor(seed) {
    this.values = new Map(Object.entries(seed));
    this.auditSequence = 0;
    this.queue = Promise.resolve();
  }
  collection(name) { return new Collection(this, name); }
  runTransaction(callback) {
    const execute = async () => {
      const writes = [];
      const transaction = {
        get: async (ref) => new Snapshot(ref, this.values.get(ref.path)),
        set: (ref, value, options) => writes.push({ type: "set", ref, value, options }),
        update: (ref, value) => writes.push({ type: "update", ref, value })
      };
      const result = await callback(transaction);
      for (const write of writes) {
        const previous = this.values.get(write.ref.path) || {};
        const next = write.type === "update" || write.options?.merge
          ? { ...previous, ...write.value }
          : write.value;
        this.values.set(write.ref.path, next);
      }
      return result;
    };
    const pending = this.queue.then(execute, execute);
    this.queue = pending.catch(() => {});
    return pending;
  }
}

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function request(uid, overrides = {}) {
  return {
    params: { companyId: "tenant-a", ...(overrides.params || {}) },
    query: overrides.query || {},
    body: overrides.body || {
      category: "incident",
      reason: "Investigate a verified scheduling incident for line 310."
    },
    adminUser: { uid },
    staffUser: { uid, companyId: "tenant-a" },
    log: { error() {} }
  };
}

function harness() {
  const database = new MemoryDb({
    "companies/tenant-a": { name: "Tenant A" },
    "companies/tenant-a/settings/main": { features: { supportSession: true } }
  });
  const sdk = {
    firestore: {
      Timestamp: { fromDate: (value) => new Date(value) },
      FieldValue: { serverTimestamp: () => new Date() }
    }
  };
  const handlers = createSupportSessionHandlers({
    db: () => database,
    admin: () => sdk,
    hasFirebase: () => true,
    parseCompanyParam: (value) => value
      ? { ok: true, id: String(value) }
      : { ok: false, error: "invalid company" }
  });
  return { database, handlers };
}

test("parallel starts create one session and one atomic audit event", async () => {
  const { database, handlers } = harness();
  const first = response();
  const second = response();

  await Promise.all([
    handlers.startSupportSession(request("sa-1"), first),
    handlers.startSupportSession(request("sa-2"), second)
  ]);

  assert.deepEqual([first.statusCode, second.statusCode].sort(), [201, 409]);
  const sessions = [...database.values.entries()]
    .filter(([path]) => path.startsWith("companies/tenant-a/support_sessions/"));
  const audits = [...database.values.entries()]
    .filter(([path]) => path.startsWith("companies/tenant-a/audit_log/"));
  assert.equal(sessions.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].action, "support_session_started");
  assert.equal(database.values.get("companies/tenant-a/settings/support").sessionId, sessions[0][0].split("/").at(-1));
});

test("ending a session clears the marker and records audit in the same transaction", async () => {
  const { database, handlers } = harness();
  const started = response();
  await handlers.startSupportSession(request("sa-1"), started);
  assert.equal(started.statusCode, 201);

  const ended = response();
  await handlers.endSupportSessionAdmin(request("sa-1", {
    params: { sessionId: started.body.session.id },
    body: { companyId: "tenant-a" }
  }), ended);

  assert.equal(ended.statusCode, 200);
  assert.equal(database.values.get("companies/tenant-a/settings/support").active, false);
  assert.equal(
    database.values.get("companies/tenant-a/support_sessions/" + started.body.session.id).status,
    "ended"
  );
  const actions = [...database.values.entries()]
    .filter(([path]) => path.startsWith("companies/tenant-a/audit_log/"))
    .map(([, value]) => value.action)
    .sort();
  assert.deepEqual(actions, ["support_session_ended", "support_session_started"]);
});
