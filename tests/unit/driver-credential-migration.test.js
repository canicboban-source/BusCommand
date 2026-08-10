const test = require("node:test");
const assert = require("node:assert/strict");
const {
  migrateCompany,
  buildMigrationPlan,
  assertMigrationTarget,
  profileHasCredentialFields
} = require("../../server/driver-credential-migration");

function fakeDb(initial) {
  const store = new Map(Object.entries(initial));
  const ref = (path) => ({
    path,
    collection(name) { return collection(`${path}/${name}`); },
    doc(id) { return ref(`${path}/${id}`); }
  });
  const collection = (path) => ({
    doc(id) { return ref(`${path}/${id}`); },
    async get() {
      const prefix = `${path}/`;
      const docs = [...store.entries()].filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
        .map(([key, value]) => ({ id: key.slice(prefix.length), ref: ref(key), data: () => ({ ...value }) }));
      return { docs };
    }
  });
  return {
    store,
    collection(name) { return collection(name); },
    async runTransaction(callback) {
      return callback({
        async get(documentRef) {
          const value = store.get(documentRef.path);
          return { exists: Boolean(value), data: () => ({ ...value }) };
        },
        set(documentRef, data, options) {
          store.set(documentRef.path, options?.merge ? { ...(store.get(documentRef.path) || {}), ...data } : { ...data });
        },
        update(documentRef, data) {
          const next = { ...(store.get(documentRef.path) || {}) };
          for (const [key, value] of Object.entries(data)) value === "__DELETE__" ? delete next[key] : next[key] = value;
          store.set(documentRef.path, next);
        }
      });
    }
  };
}

test("migration plan extracts credentials and rejects another project", () => {
  const plan = buildMigrationPlan({ firstName: "A", eid: "private-eid", companyCodeHash: "hash-a", loginCodeHash: "hash-b" });
  assert.deepEqual(Object.keys(plan.credentials).sort(), ["companyCodeHash", "eid", "loginCodeHash"]);
  assert.throws(() => assertMigrationTarget("wrong-project", "alpha"), /not allowed/);
});

test("D24.1.1 null credential keys are migration candidates but not copied", () => {
  const plan = buildMigrationPlan({ firstName: "A", eid: null, loginCodeHash: null, pin: null });
  assert.ok(plan);
  assert.deepEqual(plan.removeFields.sort(), ["eid", "loginCodeHash", "pin"]);
  assert.deepEqual(plan.credentials, {});
  assert.equal(profileHasCredentialFields({ eid: null }), true);
  assert.equal(profileHasCredentialFields({ firstName: "A" }), false);
});

test("migration dry-run writes nothing, apply is idempotent, and logs no secret values", async () => {
  const path = "companies/alpha/drivers/opaque-1";
  const db = fakeDb({ [path]: { firstName: "Ana", eid: "private-eid", companyCodeHash: "private-hash", loginCodeHash: "private-login" } });
  const logs = [];
  const args = { db, fieldValue: { delete: () => "__DELETE__" }, projectId: "buscommand-preview", companyId: "alpha", logger: (entry) => logs.push(JSON.stringify(entry)) };
  const dry = await migrateCompany({ ...args, dryRun: true });
  assert.equal(dry.candidates, 1);
  assert.equal(db.store.has("companies/alpha/driver_credentials/opaque-1"), false);
  const applied = await migrateCompany({ ...args, dryRun: false });
  assert.equal(applied.migrated, 1);
  assert.deepEqual(db.store.get(path), { firstName: "Ana" });
  assert.deepEqual(db.store.get("companies/alpha/driver_credentials/opaque-1"), {
    eid: "private-eid", companyCodeHash: "private-hash", loginCodeHash: "private-login"
  });
  const again = await migrateCompany({ ...args, dryRun: false });
  assert.deepEqual(again, { dryRun: false, candidates: 0, migrated: 0 });
  assert.doesNotMatch(logs.join(" "), /private-eid|private-hash|private-login/);
});

test("D24.1.1 apply removes null credential keys without writing null into credentials", async () => {
  const path = "companies/alpha/drivers/null-keys";
  const db = fakeDb({ [path]: { firstName: "N", eid: null, loginCodeHash: null } });
  const applied = await migrateCompany({
    db,
    fieldValue: { delete: () => "__DELETE__" },
    projectId: "buscommand-preview",
    companyId: "alpha",
    dryRun: false
  });
  assert.equal(applied.candidates, 1);
  assert.equal(applied.migrated, 1);
  assert.deepEqual(db.store.get(path), { firstName: "N" });
  assert.equal(db.store.has("companies/alpha/driver_credentials/null-keys"), false);
});

test("D24.1.1 migration counters stay accurate when Firestore retries the transaction", async () => {
  const path = "companies/alpha/drivers/retry-1";
  let attempts = 0;
  const store = new Map([[path, { firstName: "R", eid: "E1", loginCodeHash: "H1" }]]);
  const ref = (p) => ({
    path: p,
    collection(name) { return collection(`${p}/${name}`); },
    doc(id) { return ref(`${p}/${id}`); }
  });
  const collection = (p) => ({
    doc(id) { return ref(`${p}/${id}`); },
    async get() {
      const prefix = `${p}/`;
      return {
        docs: [...store.entries()]
          .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
          .map(([key, value]) => ({ id: key.slice(prefix.length), ref: ref(key), data: () => ({ ...value }) }))
      };
    }
  });
  const db = {
    collection(name) { return collection(name); },
    async runTransaction(callback) {
      attempts += 1;
      const tx = {
        async get(documentRef) {
          const value = store.get(documentRef.path);
          return { exists: Boolean(value), data: () => ({ ...value }) };
        },
        set(documentRef, data, options) {
          store.set(documentRef.path, options?.merge ? { ...(store.get(documentRef.path) || {}), ...data } : { ...data });
        },
        update(documentRef, data) {
          const next = { ...(store.get(documentRef.path) || {}) };
          for (const [key, value] of Object.entries(data)) {
            if (value === "__DELETE__") delete next[key];
            else next[key] = value;
          }
          store.set(documentRef.path, next);
        }
      };
      // Simulate one aborted attempt (callback runs, result discarded) then success.
      if (attempts === 1) {
        await callback(tx);
        // Roll back simulated first attempt writes.
        store.set(path, { firstName: "R", eid: "E1", loginCodeHash: "H1" });
        store.delete("companies/alpha/driver_credentials/retry-1");
        return callback(tx);
      }
      return callback(tx);
    }
  };
  const applied = await migrateCompany({
    db,
    fieldValue: { delete: () => "__DELETE__" },
    projectId: "buscommand-preview",
    companyId: "alpha",
    dryRun: false
  });
  assert.equal(attempts, 1);
  assert.equal(applied.candidates, 1);
  assert.equal(applied.migrated, 1);
  assert.deepEqual(store.get(path), { firstName: "R" });
});
