const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getCompanyDetail,
  updateCompanyDetails,
  listAllCompanyAdmins,
  setCompanyAdminActive,
  requestCompanyAdminPasswordReset
} = require("../../server/superadmin-company");

function fakeFirestore({ initial = {} } = {}) {
  const store = new Map(Object.entries(initial));
  let generated = 0;

  function ref(path) {
    return {
      path,
      collection(name) { return collection(`${path}/${name}`); },
      async get() { return { exists: store.has(path), data: () => store.get(path) }; }
    };
  }
  function collection(path) {
    const api = {
      doc(id) { return ref(`${path}/${id || `generated-${++generated}`}`); },
      async get() {
        const prefix = `${path}/`;
        const docs = [...store.entries()]
          .filter(([entryPath]) => entryPath.startsWith(prefix) && !entryPath.slice(prefix.length).includes("/"))
          .map(([entryPath, value]) => ({ id: entryPath.slice(prefix.length), ref: ref(entryPath), data: () => value }));
        return { docs, size: docs.length };
      },
      select() { return api; },
      where(field, operator, expected) {
        assert.equal(operator, "==");
        return {
          async get() {
            const prefix = `${path}/`;
            const docs = [...store.entries()]
              .filter(([entryPath, value]) => entryPath.startsWith(prefix) && !entryPath.slice(prefix.length).includes("/") && value[field] === expected)
              .map(([entryPath, value]) => ({ id: entryPath.slice(prefix.length), ref: ref(entryPath), data: () => value }));
            return { docs, size: docs.length };
          }
        };
      }
    };
    return api;
  }
  return {
    store,
    collection,
    async runTransaction(callback) {
      const staged = [];
      const transaction = {
        async get(documentRef) {
          return { exists: store.has(documentRef.path), data: () => store.get(documentRef.path) };
        },
        set(documentRef, value, options) {
          staged.push([documentRef.path, value, options]);
        }
      };
      const result = await callback(transaction);
      staged.forEach(([path, value, options]) => {
        store.set(path, options?.merge ? { ...(store.get(path) || {}), ...value } : value);
      });
      return result;
    }
  };
}

function fakeAdmin() {
  const updated = [];
  const revoked = [];
  const auth = {
    async getUser(uid) {
      return { uid, email: "ca@alpha.test", disabled: false };
    },
    async updateUser(uid, patch) {
      updated.push({ uid, patch });
    },
    async revokeRefreshTokens(uid) {
      revoked.push(uid);
    },
    async generatePasswordResetLink(email) {
      return `https://reset.example/link?email=${encodeURIComponent(email)}`;
    }
  };
  return {
    updated,
    revoked,
    auth() { return auth; },
    firestore: {
      FieldValue: { serverTimestamp: () => "ts" },
      Timestamp: { fromDate: value => new Date(value) }
    }
  };
}

test("getCompanyDetail returns tenant summary and company admins", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { createdAt: "ts" },
      "companies/alpha/profile/main": { name: "Alpha Transit", country: "AT", contactEmail: "office@alpha.test" },
      "companies/alpha/settings/main": { status: "active", plan: "trial", features: { supportSession: true }, maxDrivers: 20, maxDispatchers: 3 },
      "companies/alpha/settings/support": { active: false },
      "companies/alpha/drivers/d1": { name: "Driver 1" },
      "companies/alpha/groups/g1": { name: "Line 1" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "ca@alpha.test", name: "CA One", active: true
      },
      "companies/alpha/users/disp-1": {
        role: "dispatcher", companyId: "alpha", email: "disp@alpha.test", name: "Disp", active: true
      }
    }
  });

  const company = await getCompanyDetail({ db, companyId: "alpha" });
  assert.equal(company.id, "alpha");
  assert.equal(company.name, "Alpha Transit");
  assert.equal(company.counts.drivers, 1);
  assert.equal(company.counts.groups, 1);
  assert.equal(company.counts.dispatchers, 1);
  assert.equal(company.counts.companyAdmins, 1);
  assert.equal(company.admins[0].email, "ca@alpha.test");
});

test("updateCompanyDetails atomically updates platform fields and writes one audit event", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { name: "Old Alpha", status: "active" },
      "companies/alpha/profile/main": { name: "Old Alpha", country: "AT", contactEmail: "old@alpha.test" },
      "companies/alpha/settings/main": {
        status: "active",
        plan: "trial",
        features: { supportSession: true },
        maxDrivers: 20,
        maxDispatchers: 3,
        trialEndsAt: new Date("2026-08-31T23:59:59.999Z")
      }
    }
  });
  const result = await updateCompanyDetails({
    db,
    admin: fakeAdmin(),
    companyId: "alpha",
    actorId: "sa-1",
    input: {
      name: "Alpha Transit",
      country: "RS",
      contactEmail: "office@alpha.test",
      plan: "paid",
      maxDrivers: 80,
      maxDispatchers: 8,
      trialEndsAt: null
    }
  });

  assert.equal(result.company.name, "Alpha Transit");
  assert.deepEqual(result.changedFields.sort(), [
    "contactEmail", "country", "maxDispatchers", "maxDrivers", "name", "plan", "trialEndsAt"
  ]);
  assert.equal(db.store.get("companies/alpha").name, "Alpha Transit");
  assert.equal(db.store.get("companies/alpha/profile/main").country, "RS");
  const settings = db.store.get("companies/alpha/settings/main");
  assert.equal(settings.plan, "paid");
  assert.equal(settings.maxDrivers, 80);
  assert.equal(settings.status, "active");
  assert.deepEqual(settings.features, { supportSession: true });
  const audits = [...db.store.entries()].filter(([path, value]) =>
    path.startsWith("companies/alpha/audit_log/") && value.action === "company_details_updated"
  );
  assert.equal(audits.length, 1);
  assert.equal(audits[0][1].actorId, "sa-1");
  assert.ok(!Object.hasOwn(audits[0][1].details, "contactEmail"));
});

test("listAllCompanyAdmins returns admins across companies from users/", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { createdAt: "ts" },
      "companies/beta": { createdAt: "ts" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "ca@alpha.test", name: "CA One", active: true
      },
      "companies/alpha/users/disp-1": {
        role: "dispatcher", companyId: "alpha", email: "disp@alpha.test", name: "Disp"
      },
      "companies/beta/users/ca-2": {
        role: "company_admin", companyId: "beta", email: "ca@beta.test", name: "CA Two", active: true
      }
    }
  });

  const admins = await listAllCompanyAdmins({ db });
  assert.equal(admins.length, 2);
  assert.deepEqual(admins.map((a) => a.email).sort(), ["ca@alpha.test", "ca@beta.test"]);
  assert.equal(admins.find((a) => a.email === "ca@alpha.test").companyId, "alpha");
  assert.ok(!admins.some((a) => a.email === "disp@alpha.test"));
});

test("setCompanyAdminActive disables auth and audits", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { createdAt: "ts" },
      "companies/alpha/settings/main": { status: "active" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "ca@alpha.test", active: true
      }
    }
  });
  const admin = fakeAdmin();
  const result = await setCompanyAdminActive({
    db, admin, companyId: "alpha", uid: "ca-1", active: false, actorId: "sa-1"
  });
  assert.equal(result.active, false);
  assert.equal(admin.updated.at(-1).patch.disabled, true);
  assert.ok(admin.revoked.includes("ca-1"));
  assert.equal(db.store.get("companies/alpha/users/ca-1").active, false);
});

test("requestCompanyAdminPasswordReset returns link and audits", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { createdAt: "ts" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "alpha", email: "ca@alpha.test", active: true
      }
    }
  });
  const admin = fakeAdmin();
  const result = await requestCompanyAdminPasswordReset({
    db, admin, companyId: "alpha", uid: "ca-1", actorId: "sa-1"
  });
  assert.equal(result.email, "ca@alpha.test");
  assert.match(result.resetLink, /reset\.example/);
  const auditEntries = [...db.store.entries()].filter(([path, value]) =>
    path.startsWith("companies/alpha/audit_log/") && value.action === "company_admin_password_reset_requested"
  );
  assert.equal(auditEntries.length, 1);
});

test("company admin helpers reject foreign tenant users", async () => {
  const db = fakeFirestore({
    initial: {
      "companies/alpha": { createdAt: "ts" },
      "companies/alpha/users/ca-1": {
        role: "company_admin", companyId: "other", email: "ca@other.test", active: true
      }
    }
  });
  const admin = fakeAdmin();
  await assert.rejects(
    () => setCompanyAdminActive({ db, admin, companyId: "alpha", uid: "ca-1", active: true, actorId: "sa-1" }),
    error => error.code === "user-not-found"
  );
});


