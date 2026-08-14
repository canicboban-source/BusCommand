const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createCompanyAtomic,
  deleteDispatcher,
  deleteCompanyAtomic,
  normalizeFirebaseUid,
  provisionUser,
  provisionCompanyAdminMissingOnly,
  revokeDispatcherSessions,
  setDispatcherActive,
  updateDispatcherGroups
} = require("../../server/provisioning");

test("dispatcher UID normalization rejects Firestore path and control characters", () => {
  assert.equal(normalizeFirebaseUid(" dispatcher_1 "), "dispatcher_1");
  for (const uid of ["", "../foreign", "a/b", "line\nbreak", "x".repeat(129)]) {
    assert.throws(() => normalizeFirebaseUid(uid), error => error.code === "invalid-uid");
  }
});

function fakeFirestore({ initial = {}, failTransactionSetAt = null } = {}) {
  const store = new Map(Object.entries(initial));
  let generated = 0;
  const deleted = [];

  function ref(path) {
    return {
      path,
      collection(name) { return collection(`${path}/${name}`); },
      async get() { return { exists: store.has(path), data: () => store.get(path) }; },
      async delete() { deleted.push(path); store.delete(path); }
    };
  }
  function collection(path) {
    return {
      doc(id) { return ref(`${path}/${id || `generated-${++generated}`}`); },
      where(field, operator, expected) {
        assert.equal(operator, "==");
        const query = {
          _isQuery: true,
          async get() {
            const prefix = `${path}/`;
            const docs = [...store.entries()]
              .filter(([entryPath, value]) => entryPath.startsWith(prefix) && !entryPath.slice(prefix.length).includes("/") && value[field] === expected)
              .map(([entryPath, value]) => ({ id: entryPath.slice(prefix.length), data: () => value }));
            return { docs, empty: docs.length === 0, size: docs.length };
          }
        };
        return query;
      }
    };
  }
  return {
    store,
    deleted,
    collection,
    async runTransaction(callback) {
      const staged = [];
      let setCount = 0;
      const transaction = {
        async get(target) {
          if (target && target._isQuery && typeof target.get === "function") {
            return target.get();
          }
          return { exists: store.has(target.path), data: () => store.get(target.path) };
        },
        set(documentRef, value, options) {
          setCount += 1;
          if (setCount === failTransactionSetAt) throw new Error("simulated transaction failure");
          staged.push([documentRef.path, value, options]);
        },
        delete(documentRef) {
          staged.push([documentRef.path, null, { delete: true }]);
        }
      };
      await callback(transaction);
      staged.forEach(([path, value, options]) => {
        if (options?.delete) store.delete(path);
        else store.set(path, options?.merge ? { ...(store.get(path) || {}), ...value } : value);
      });
    }
  };
}

function fakeAdmin({ failClaims = false, emailExists = false, failDelete = false } = {}) {
  const created = [];
  const deleted = [];
  const assignedClaims = [];
  const claimsByUid = new Map();
  const users = new Map();
  const revoked = [];
  const updated = [];
  const auth = {
    async createUser(data) {
      if (emailExists) {
        const error = new Error("email already exists");
        error.code = "auth/email-already-exists";
        throw error;
      }
      created.push(data);
      const uid = `uid-${created.length}`;
      users.set(uid, { uid, email: data.email, displayName: data.displayName, disabled: false });
      return { uid };
    },
    async setCustomUserClaims(uid, claims) {
      if (failClaims) throw new Error("simulated claims failure");
      assignedClaims.push({ uid, claims });
      claimsByUid.set(uid, claims);
    },
    async deleteUser(uid) {
      if (failDelete) throw new Error("simulated auth delete failure");
      deleted.push(uid);
      users.delete(uid);
    },
    async getUser(uid) {
      if (deleted.includes(uid)) {
        const error = new Error("user-not-found");
        error.code = "auth/user-not-found";
        throw error;
      }
      if (users.has(uid)) {
        const base = users.get(uid);
        return { ...base, customClaims: claimsByUid.get(uid) || {} };
      }
      // Pre-seeded Auth identities used by dispatcher lifecycle tests.
      return {
        uid,
        email: "dispatcher@example.test",
        displayName: "Dispatcher",
        disabled: false,
        customClaims: claimsByUid.get(uid) || {}
      };
    },
    async updateUser(uid, data) { updated.push({ uid, data }); return { uid, ...data }; },
    async revokeRefreshTokens(uid) { revoked.push(uid); }
  };
  return {
    created, deleted, assignedClaims, claimsByUid, revoked, updated, users,
    auth: () => auth,
    firestore: {
      FieldValue: { serverTimestamp: () => "timestamp" },
      Timestamp: { fromDate: (date) => date.toISOString() }
    }
  };
}

test("createCompanyAtomic creates parent, configuration and audit together", async () => {
  const db = fakeFirestore();
  await createCompanyAtomic({ db, admin: fakeAdmin(), companyId: "alpha", name: "Alpha", actorId: "root" });
  assert.deepEqual([...db.store.keys()].sort(), [
    "companies/alpha",
    "companies/alpha/audit_log/generated-1",
    "companies/alpha/branding/main",
    "companies/alpha/profile/main",
    "companies/alpha/settings/main",
    "companies/alpha/settings/sos"
  ]);
  assert.equal(db.store.get("companies/alpha").companyId, "alpha");
  assert.equal(db.store.get("companies/alpha/profile/main").timezone, "Europe/Vienna");
});

test("Serbian companies use the headquarters timezone and language", async () => {
  const db = fakeFirestore();
  await createCompanyAtomic({ db, admin: fakeAdmin(), companyId: "serbia", name: "Serbia", country: "RS", actorId: "root" });
  const profile = db.store.get("companies/serbia/profile/main");
  assert.equal(profile.timezone, "Europe/Belgrade");
  assert.equal(profile.defaultLanguage, "sr");
});

test("createCompanyAtomic rejects an existing company without writes", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": { name: "Existing" } } });
  await assert.rejects(
    createCompanyAtomic({ db, admin: fakeAdmin(), companyId: "alpha", name: "Alpha", actorId: "root" }),
    (error) => error.code === "company-exists"
  );
  assert.equal(db.store.size, 1);
});

test("createCompanyAtomic rejects a legacy partial company", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha/profile/main": { name: "Partial" } } });
  await assert.rejects(
    createCompanyAtomic({ db, admin: fakeAdmin(), companyId: "alpha", name: "Alpha", actorId: "root" }),
    (error) => error.code === "company-exists"
  );
  assert.equal(db.store.size, 1);
});

test("createCompanyAtomic rolls back every write on transaction failure", async () => {
  const db = fakeFirestore({ failTransactionSetAt: 4 });
  await assert.rejects(
    createCompanyAtomic({ db, admin: fakeAdmin(), companyId: "alpha", name: "Alpha", actorId: "root" }),
    /simulated transaction failure/
  );
  assert.equal(db.store.size, 0);
});

test("provisionUser creates dispatcher claims and company user document", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": { name: "Alpha" } } });
  const admin = fakeAdmin();
  const result = await provisionUser({
    db, admin, email: "dispatcher@example.test", password: "unit-test-password",
    name: "Test User", role: "dispatcher", companyId: "alpha", actorId: "root"
  });
  assert.deepEqual(result.claims, {
    role: "dispatcher", companyId: "alpha", name: "Test User", mustChangeLoginCode: false, groups: []
  });
  assert.equal(db.store.has(`companies/alpha/users/${result.uid}`), true);
  assert.equal(admin.deleted.length, 0);
});

test("provisionUser company_admin uses slot guard and writes ops/company_admin_slot", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active", licenseType: "pro" }
    }
  });
  const admin = fakeAdmin();
  const result = await provisionUser({
    db, admin, email: "company_admin@example.test", password: "unit-test-password",
    name: "Test User", role: "company_admin", companyId: "alpha", actorId: "root"
  });
  assert.deepEqual(result.claims, {
    role: "company_admin", companyId: "alpha", name: "Test User", mustChangeLoginCode: false
  });
  assert.equal(db.store.has(`companies/alpha/users/${result.uid}`), true);
  assert.equal(db.store.get("companies/alpha/ops/company_admin_slot").uid, result.uid);
  assert.equal(admin.deleted.length, 0);
  // Success audit must not include password; email omitted from CA audit details.
  const audit = [...db.store.values()].find((value) => value.action === "user_created");
  assert.equal(audit.details.uid, result.uid);
  assert.equal(Object.prototype.hasOwnProperty.call(audit.details, "password"), false);
});

test("provisionUser company_admin fails closed when CA already exists (no slot)", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "old@example.test", active: true
      }
    }
  });
  const admin = fakeAdmin();
  await assert.rejects(provisionUser({
    db, admin, email: "new@example.test", password: "unit-test-password",
    name: "New", role: "company_admin", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "ca-exists");
  assert.equal(admin.created.length, 0);
});

test("provisionCompanyAdminMissingOnly rejects inactive CA and existing slot", async () => {
  const inactiveDb = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "old@example.test", active: false
      }
    }
  });
  await assert.rejects(provisionCompanyAdminMissingOnly({
    db: inactiveDb, admin: fakeAdmin(), email: "new@example.test", password: "unit-test-password",
    name: "New", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "ca-exists");

  const slotDb = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active" },
      "companies/alpha/ops/company_admin_slot": { uid: "winner", claimedAt: "timestamp" }
    }
  });
  await assert.rejects(provisionCompanyAdminMissingOnly({
    db: slotDb, admin: fakeAdmin(), email: "new@example.test", password: "unit-test-password",
    name: "New", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "ca-exists");
});

test("parallel company_admin creates: second loses after slot claim and Auth UID is deleted", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active" }
    }
  });
  const winnerAdmin = fakeAdmin();
  const loserAdmin = fakeAdmin();
  const winner = await provisionCompanyAdminMissingOnly({
    db, admin: winnerAdmin, email: "winner@example.test", password: "unit-test-password",
    name: "Winner", companyId: "alpha", actorId: "sa"
  });
  assert.equal(db.store.get("companies/alpha/ops/company_admin_slot").uid, winner.uid);

  await assert.rejects(provisionCompanyAdminMissingOnly({
    db, admin: loserAdmin, email: "loser@example.test", password: "unit-test-password",
    name: "Loser", companyId: "alpha", actorId: "sa"
  }), (error) => error.code === "ca-exists");
  // Loser never reaches Auth when pre-check sees slot/CA.
  assert.equal(loserAdmin.created.length, 0);

  // Post-Auth race: peer claims slot between Auth.createUser and transaction commit.
  const conflictAdmin = fakeAdmin();
  const companyRefPath = "companies/gamma";
  const conflictDb = fakeFirestore({
    initial: {
      [`${companyRefPath}`]: { name: "Gamma" },
      [`${companyRefPath}/settings/main`]: { status: "active" }
    }
  });
  const originalRun = conflictDb.runTransaction.bind(conflictDb);
  let raced = false;
  conflictDb.runTransaction = async (cb) => {
    if (!raced) {
      raced = true;
      conflictDb.store.set(`${companyRefPath}/ops/company_admin_slot`, { uid: "peer", claimedAt: "timestamp" });
      conflictDb.store.set(`${companyRefPath}/users/peer`, {
        role: "company_admin", companyId: "gamma", email: "peer@example.test", active: true
      });
    }
    return originalRun(cb);
  };
  await assert.rejects(provisionCompanyAdminMissingOnly({
    db: conflictDb, admin: conflictAdmin, email: "race@example.test", password: "unit-test-password",
    name: "Race", companyId: "gamma", actorId: "sa"
  }), (error) => error.code === "ca-exists");
  assert.deepEqual(conflictAdmin.deleted, ["uid-1"]);
  await assert.rejects(
    () => conflictAdmin.auth().getUser("uid-1"),
    (error) => error.code === "auth/user-not-found"
  );
  assert.equal(conflictDb.store.get(`${companyRefPath}/ops/company_admin_slot`).uid, "peer");
  assert.equal(conflictDb.store.has(`${companyRefPath}/users/uid-1`), false);
});

test("provisionCompanyAdminMissingOnly compensation-failed when Auth delete fails", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "active" }
    },
    failTransactionSetAt: 1
  });
  const admin = fakeAdmin({ failDelete: true });
  await assert.rejects(provisionCompanyAdminMissingOnly({
    db, admin, email: "x@example.test", password: "unit-test-password",
    name: "X", companyId: "alpha", actorId: "sa"
  }), (error) => error.code === "compensation-failed");
  assert.equal(admin.deleted.length, 0);
  assert.equal(db.store.has("companies/alpha/ops/company_admin_slot"), false);
});

test("provisionCompanyAdminMissingOnly rejects suspended company before Auth", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Alpha" },
      "companies/alpha/settings/main": { status: "suspended" }
    }
  });
  const admin = fakeAdmin();
  await assert.rejects(provisionCompanyAdminMissingOnly({
    db, admin, email: "x@example.test", password: "unit-test-password",
    name: "X", companyId: "alpha", actorId: "sa"
  }), (error) => error.code === "license-suspended");
  assert.equal(admin.created.length, 0);
});

test("provisionUser checks company existence before creating Auth user", async () => {
  const db = fakeFirestore();
  const admin = fakeAdmin();
  await assert.rejects(provisionUser({
    db, admin, email: "missing@example.test", password: "unit-test-password",
    name: "Missing", role: "dispatcher", companyId: "missing", actorId: "root"
  }), (error) => error.code === "company-not-found");
  assert.equal(admin.created.length, 0);
});

test("provisionUser safely rejects a duplicate email without creating orphan data", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": {} } });
  const admin = fakeAdmin({ emailExists: true });
  await assert.rejects(provisionUser({
    db, admin, email: "existing@example.test", password: "unit-test-password",
    name: "Existing", role: "dispatcher", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "auth/email-already-exists");
  assert.equal(admin.created.length, 0);
  assert.equal(admin.deleted.length, 0);
  assert.equal([...db.store.keys()].some(path => path.includes("/users/")), false);
});

test("new dispatcher stores normalized groups in claims and profile", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/groups/310": { name: "LEO" },
    "companies/alpha/groups/311": { name: "Other" }
  } });
  const admin = fakeAdmin();
  const result = await provisionUser({
    db, admin, email: "grouped@example.test", password: "unit-test-password",
    name: "Grouped", role: "dispatcher", companyId: "alpha",
    groups: ["311", "310", "310"], actorId: "root"
  });
  assert.deepEqual(result.claims.groups, ["310", "311"]);
  assert.deepEqual(db.store.get(`companies/alpha/users/${result.uid}`).groups, ["310", "311"]);
});

test("group assignment update aligns profile and claims and revokes old tokens", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/groups/310": { name: "LEO" },
    "companies/alpha/users/dispatcher-1": {
      id: "dispatcher-1", name: "Dispatcher", role: "dispatcher", companyId: "alpha", groups: []
    }
  } });
  const admin = fakeAdmin();
  admin.claimsByUid.set("dispatcher-1", { role: "dispatcher", companyId: "alpha", name: "Dispatcher" });
  const result = await updateDispatcherGroups({
    db, admin, companyId: "alpha", uid: "dispatcher-1", groups: ["310", "310"], actorId: "admin-1"
  });
  assert.deepEqual(result.groups, ["310"]);
  assert.deepEqual(db.store.get("companies/alpha/users/dispatcher-1").groups, ["310"]);
  assert.deepEqual(admin.claimsByUid.get("dispatcher-1").groups, ["310"]);
  assert.deepEqual(admin.revoked, ["dispatcher-1"]);
});

test("dispatcher deactivation disables Auth, updates tenant profile, audits and revokes sessions", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/users/dispatcher-1": {
      id: "dispatcher-1", role: "dispatcher", companyId: "alpha", active: true
    }
  } });
  const admin = fakeAdmin();
  const result = await setDispatcherActive({
    db, admin, companyId: "alpha", uid: "dispatcher-1", active: false, actorId: "admin-1"
  });
  assert.equal(result.active, false);
  assert.deepEqual(admin.updated, [{ uid: "dispatcher-1", data: { disabled: true } }]);
  assert.deepEqual(admin.revoked, ["dispatcher-1"]);
  assert.equal(db.store.get("companies/alpha/users/dispatcher-1").active, false);
  assert.equal(Number.isInteger(db.store.get("companies/alpha/users/dispatcher-1").sessionsValidAfterEpoch), true);
  const audit = [...db.store.values()].find(value => value.action === "dispatcher_deactivated");
  assert.equal(audit.actorId, "admin-1");
});

test("dispatcher reactivation fails closed when the licensed active-seat limit is reached", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/settings/main": { status: "active", maxDispatchers: 1 },
    "companies/alpha/users/dispatcher-1": { id: "dispatcher-1", role: "dispatcher", companyId: "alpha", active: false },
    "companies/alpha/users/dispatcher-2": { id: "dispatcher-2", role: "dispatcher", companyId: "alpha", active: true }
  } });
  const admin = fakeAdmin();
  await assert.rejects(
    setDispatcherActive({ db, admin, companyId: "alpha", uid: "dispatcher-1", active: true, actorId: "admin-1" }),
    error => error.code === "dispatcher-limit"
  );
  assert.equal(admin.updated.length, 0);
  assert.equal(db.store.get("companies/alpha/users/dispatcher-1").active, false);
});

test("dispatcher deletion requires inactive tenant profile and exact email confirmation", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/users/dispatcher-1": {
      id: "dispatcher-1",
      role: "dispatcher",
      companyId: "alpha",
      email: "dispatcher@example.test",
      active: true
    }
  } });
  const admin = fakeAdmin();
  await assert.rejects(
    deleteDispatcher({
      db, admin, companyId: "alpha", uid: "dispatcher-1",
      confirmEmail: "dispatcher@example.test", actorId: "admin-1"
    }),
    error => error.code === "dispatcher-active"
  );
  db.store.get("companies/alpha/users/dispatcher-1").active = false;
  await assert.rejects(
    deleteDispatcher({
      db, admin, companyId: "alpha", uid: "dispatcher-1",
      confirmEmail: "wrong@example.test", actorId: "admin-1"
    }),
    error => error.code === "confirm-mismatch"
  );
  assert.equal(admin.deleted.length, 0);
  assert.equal(db.store.has("companies/alpha/users/dispatcher-1"), true);
});

test("dispatcher deletion removes Auth and active profile but preserves an audit record", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/users/dispatcher-1": {
      id: "dispatcher-1",
      role: "dispatcher",
      companyId: "alpha",
      email: "dispatcher@example.test",
      active: false
    }
  } });
  const admin = fakeAdmin();
  const result = await deleteDispatcher({
    db, admin, companyId: "alpha", uid: "dispatcher-1",
    confirmEmail: " DISPATCHER@example.test ", actorId: "admin-1"
  });
  assert.equal(result.deleted, true);
  assert.deepEqual(admin.deleted, ["dispatcher-1"]);
  assert.equal(db.store.has("companies/alpha/users/dispatcher-1"), false);
  const audit = [...db.store.values()].find(value => value.action === "dispatcher_deleted");
  assert.equal(audit.actorId, "admin-1");
  assert.deepEqual(audit.details, { uid: "dispatcher-1" });
});

test("session revocation rejects foreign-tenant IDs and audits valid dispatcher", async () => {
  const db = fakeFirestore({ initial: {
    "companies/alpha": {},
    "companies/alpha/users/dispatcher-1": {
      id: "dispatcher-1", role: "dispatcher", companyId: "alpha", active: true
    },
    "companies/beta": {},
    "companies/beta/users/dispatcher-2": {
      id: "dispatcher-2", role: "dispatcher", companyId: "beta", active: true
    }
  } });
  const admin = fakeAdmin();
  await assert.rejects(
    revokeDispatcherSessions({ db, admin, companyId: "alpha", uid: "dispatcher-2", actorId: "admin-1" }),
    error => error.code === "user-not-found"
  );
  await revokeDispatcherSessions({ db, admin, companyId: "alpha", uid: "dispatcher-1", actorId: "admin-1" });
  assert.deepEqual(admin.revoked, ["dispatcher-1"]);
  assert.equal(Number.isInteger(db.store.get("companies/alpha/users/dispatcher-1").sessionsValidAfterEpoch), true);
  const audit = [...db.store.values()].find(value => value.action === "dispatcher_sessions_revoked");
  assert.equal(audit.details.uid, "dispatcher-1");
});

test("provisionUser rejects a forbidden role before external writes", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": {} } });
  const admin = fakeAdmin();
  await assert.rejects(provisionUser({
    db, admin, email: "driver@example.test", password: "unit-test-password",
    name: "Driver", role: "driver", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "role-not-allowed");
  assert.equal(admin.created.length, 0);
});

test("provisionUser compensates Auth and Firestore after partial failure", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": {} }, failTransactionSetAt: 2 });
  const admin = fakeAdmin();
  await assert.rejects(provisionUser({
    db, admin, email: "dispatcher@example.test", password: "unit-test-password",
    name: "Dispatcher", role: "dispatcher", companyId: "alpha", actorId: "root"
  }), /simulated transaction failure/);
  assert.deepEqual(admin.deleted, ["uid-1"]);
  assert.equal(db.store.has("companies/alpha/users/uid-1"), false);
  assert.ok(db.deleted.includes("companies/alpha/users/uid-1"));
});

test("provisionUser deletes a new Auth user when claims assignment fails", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": {} } });
  const admin = fakeAdmin({ failClaims: true });
  await assert.rejects(provisionUser({
    db, admin, email: "dispatcher@example.test", password: "unit-test-password",
    name: "Dispatcher", role: "dispatcher", companyId: "alpha", actorId: "root"
  }), /simulated claims failure/);
  assert.deepEqual(admin.deleted, ["uid-1"]);
  assert.equal(db.store.has("companies/alpha/users/uid-1"), false);
});

test("provisionUser never attaches a company to superadmin claims", async () => {
  const db = fakeFirestore({ initial: { "companies/alpha": {} } });
  const admin = fakeAdmin();
  await assert.rejects(provisionUser({
    db, admin, email: "root@example.test", password: "unit-test-password",
    name: "Root", role: "superadmin", companyId: "alpha", actorId: "root"
  }), (error) => error.code === "superadmin-company-forbidden");
  assert.equal(admin.created.length, 0);
});

test("deleteCompanyAtomic requires typed companyId confirmation", async () => {
  const db = fakeDeleteDb({
    "companies/oldco": { name: "Old" },
    "companies/oldco/users/u1": { role: "company_admin" }
  });
  const admin = fakeAdmin();
  await assert.rejects(
    deleteCompanyAtomic({ db, admin, companyId: "oldco", confirmCompanyId: "wrong", actorId: "sa" }),
    (error) => error.code === "confirm-mismatch"
  );
  assert.equal(db.store.has("companies/oldco"), true);
});

test("deleteCompanyAtomic removes company tree and Auth users", async () => {
  const db = fakeDeleteDb({
    "companies/oldco": { name: "Old" },
    "companies/oldco/users/u1": { role: "company_admin" },
    "companies/oldco/drivers/d1": { name: "Driver" },
    "companies/oldco/groups/310": { name: "Linie 310" }
  });
  const admin = fakeAdmin();

  const result = await deleteCompanyAtomic({
    db, admin, companyId: "oldco", confirmCompanyId: "oldco", actorId: "sa"
  });

  assert.equal(result.companyId, "oldco");
  assert.equal(result.deletedAuthUsers, 2);
  assert.deepEqual(admin.deleted.sort(), ["d1", "u1"]);
  assert.equal(db.store.has("companies/oldco"), false);
  assert.equal(db.store.has("companies/oldco/users/u1"), false);
  assert.equal(db.store.has("companies/oldco/drivers/d1"), false);
  assert.equal(db.store.has("companies/oldco/groups/310"), false);
});

function fakeDeleteDb(initial = {}) {
  const store = new Map(Object.entries(initial));

  function ref(docPath) {
    return {
      path: docPath,
      id: docPath.split("/").pop(),
      collection(name) { return collection(`${docPath}/${name}`); },
      async get() {
        return { exists: store.has(docPath), data: () => store.get(docPath), id: this.id };
      },
      async delete() { store.delete(docPath); }
    };
  }

  function collection(colPath) {
    const listDocs = () => [...store.entries()]
      .filter(([entryPath]) => {
        if (!entryPath.startsWith(`${colPath}/`)) return false;
        const rest = entryPath.slice(colPath.length + 1);
        return rest.length > 0 && !rest.includes("/");
      })
      .map(([entryPath, value]) => ({
        id: entryPath.slice(colPath.length + 1),
        ref: ref(entryPath),
        data: () => value
      }));

    const queryApi = {
      async get() { return { empty: listDocs().length === 0, docs: listDocs() }; },
      limit() { return queryApi; }
    };

    return {
      ...queryApi,
      doc(id) { return ref(`${colPath}/${id}`); }
    };
  }

  return {
    store,
    collection,
    batch() {
      const ops = [];
      return {
        delete(documentRef) { ops.push(documentRef.path); },
        async commit() { ops.forEach((p) => store.delete(p)); }
      };
    }
  };
}
