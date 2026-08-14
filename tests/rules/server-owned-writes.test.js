const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc
} = require("firebase/firestore");

const PROJECT_ID = "buscommand-rules-server-owned";
let env;

async function seedCompany(companyId) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "companies", companyId), { name: companyId });
    await setDoc(doc(db, "companies", companyId, "settings", "main"), { status: "active" });
    await setDoc(doc(db, "companies", companyId, "users", "ca-1"), {
      active: true,
      groups: ["31099"],
      sessionsValidAfterEpoch: 0
    });
    await setDoc(doc(db, "companies", companyId, "users", "disp-1"), {
      active: true,
      groups: ["31099"],
      sessionsValidAfterEpoch: 0
    });
    await setDoc(doc(db, "companies", companyId, "drivers", "drv-1"), {
      active: true,
      groupId: "31099",
      firstName: "Test",
      lastName: "Driver",
      lastSeen: null,
      lastLocation: null
    });
    await setDoc(doc(db, "companies", companyId, "shifts", "drv-1_2026-08-01"), {
      driverId: "drv-1",
      groupId: "31099",
      date: "2026-08-01",
      revision: 1
    });
    await setDoc(doc(db, "companies", companyId, "schedules", "drv-1_2026-08"), {
      driverId: "drv-1",
      groupId: "31099",
      month: "2026-08",
      parsedShifts: {}
    });
    await setDoc(doc(db, "companies", companyId, "messages", "msg-1"), {
      recipientDriverId: "drv-1",
      broadcast: false,
      read: false
    });
    await setDoc(doc(db, "companies", companyId, "driver_sessions", "drv-1"), {
      sessionEndsAt: new Date(Date.now() + 60 * 60 * 1000),
      notificationsUntil: new Date(Date.now() + 60 * 60 * 1000)
    });
    await setDoc(doc(db, "companies", companyId, "audit_log", "audit-1"), {
      action: "user_created",
      actorId: "ca-1"
    });
    await setDoc(doc(db, "companies", companyId, "support_sessions", "sup-1"), {
      status: "active",
      category: "incident"
    });
    await setDoc(doc(db, "companies", companyId, "monthly_plan_imports", "imp-1"), {
      groupId: "31099",
      month: "2026-08",
      status: "previewed"
    });
    await setDoc(doc(db, "companies", companyId, "monthly_plan_import_locks", "31099_2026-08"), {
      importId: "imp-1"
    });
    await setDoc(doc(db, "companies", companyId, "plan_locks", "31099_2026-08"), {
      holderUid: "disp-1"
    });
    await setDoc(doc(db, "companies", companyId, "ops", "confirmation_dispatch"), {
      lastRunAt: new Date()
    });
  });
}

function superAdmin() {
  return env.authenticatedContext("sa-1", {
    role: "superadmin",
    mustChangeLoginCode: false,
    auth_time: Math.floor(Date.now() / 1000)
  }).firestore();
}

function auth(uid, role, companyId) {
  return env.authenticatedContext(uid, {
    role,
    companyId,
    mustChangeLoginCode: false,
    auth_time: Math.floor(Date.now() / 1000)
  }).firestore();
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8")
    }
  });
});

test.beforeEach(async () => {
  await env.clearFirestore();
  await seedCompany("alpha");
  await seedCompany("beta");
});

test.after(async () => {
  await env.cleanup();
});

test("staff clients cannot write server-owned operational collections", async () => {
  for (const role of ["company_admin", "dispatcher"]) {
    const uid = role === "company_admin" ? "ca-1" : "disp-1";
    const db = auth(uid, role, "alpha");
    const writes = [
      setDoc(doc(db, "companies", "alpha", "shifts", "new"), { driverId: "drv-1" }),
      setDoc(doc(db, "companies", "alpha", "schedules", "new"), { driverId: "drv-1" }),
      setDoc(doc(db, "companies", "alpha", "service_plans", "new"), { groupId: "31099" }),
      setDoc(doc(db, "companies", "alpha", "drivers", "new"), { active: true }),
      setDoc(doc(db, "companies", "alpha", "vacations", "new"), { driverId: "drv-1" }),
      setDoc(doc(db, "companies", "alpha", "company_admins", "new"), { active: true }),
      setDoc(doc(db, "companies", "alpha", "messages", "new"), { broadcast: true }),
      setDoc(doc(db, "companies", "alpha", "audit_log", "forged"), { action: "forged" })
    ];
    for (const write of writes) await assertFails(write);
  }
});

test("staff reads stay inside the authenticated tenant", async () => {
  const db = auth("disp-1", "dispatcher", "alpha");
  await assertSucceeds(getDoc(doc(db, "companies", "alpha", "drivers", "drv-1")));
  await assertFails(getDoc(doc(db, "companies", "beta", "drivers", "drv-1")));
});

test("driver location writes require an active server-owned session", async () => {
  const db = auth("drv-1", "driver", "alpha");
  await assertSucceeds(updateDoc(doc(db, "companies", "alpha", "drivers", "drv-1"), {
    lastSeen: new Date(),
    lastLocation: { lat: 47.8, lng: 16.2 }
  }));

  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "companies", "alpha", "driver_sessions", "drv-1"), {
      sessionEndsAt: new Date(Date.now() - 60 * 1000)
    });
  });

  await assertFails(updateDoc(doc(db, "companies", "alpha", "drivers", "drv-1"), {
    lastSeen: new Date(),
    lastLocation: { lat: 47.9, lng: 16.3 }
  }));
});

test("driver cannot change protected profile fields during an active session", async () => {
  const db = auth("drv-1", "driver", "alpha");
  await assertFails(updateDoc(doc(db, "companies", "alpha", "drivers", "drv-1"), {
    groupId: "other"
  }));
});

test("superadmin oversees every tenant collection read-only", async () => {
  const db = superAdmin();
  await assertSucceeds(getDoc(doc(db, "companies", "alpha", "audit_log", "audit-1")));
  await assertSucceeds(getDoc(doc(db, "companies", "beta", "shifts", "drv-1_2026-08-01")));
  await assertSucceeds(getDoc(doc(db, "companies", "alpha", "support_sessions", "sup-1")));
  await assertFails(getDoc(doc(db, "companies", "alpha", "driver_credentials", "drv-1")));
});

test("superadmin browser session cannot forge or erase server-owned tenant records", async () => {
  const db = superAdmin();
  await assertFails(setDoc(doc(db, "companies", "alpha", "audit_log", "forged"), { action: "forged" }));
  await assertFails(updateDoc(doc(db, "companies", "alpha", "audit_log", "audit-1"), { action: "rewritten" }));
  await assertFails(deleteDoc(doc(db, "companies", "alpha", "audit_log", "audit-1")));
  await assertFails(setDoc(doc(db, "companies", "alpha", "shifts", "sa-injected"), { driverId: "drv-1" }));
  await assertFails(updateDoc(doc(db, "companies", "alpha", "settings", "main"), { status: "suspended" }));
  await assertFails(updateDoc(doc(db, "companies", "alpha", "support_sessions", "sup-1"), { status: "ended" }));
  await assertFails(updateDoc(doc(db, "companies", "alpha", "users", "disp-1"), { active: false }));
});

test("company root document is server-owned for every role", async () => {
  const companyAdmin = auth("ca-1", "company_admin", "alpha");
  await assertSucceeds(getDoc(doc(companyAdmin, "companies", "alpha")));
  await assertFails(updateDoc(doc(companyAdmin, "companies", "alpha"), { status: "suspended" }));
  await assertFails(setDoc(doc(companyAdmin, "companies", "alpha"), { name: "Renamed" }));
  await assertFails(updateDoc(doc(superAdmin(), "companies", "alpha"), { status: "suspended" }));
});

test("import locks, plan locks and job state stay invisible and untouchable for tenant clients", async () => {
  const collections = [
    ["monthly_plan_imports", "imp-1"],
    ["monthly_plan_import_locks", "31099_2026-08"],
    ["plan_locks", "31099_2026-08"],
    ["ops", "confirmation_dispatch"]
  ];
  for (const [role, uid] of [["company_admin", "ca-1"], ["dispatcher", "disp-1"], ["driver", "drv-1"]]) {
    const db = auth(uid, role, "alpha");
    for (const [collection, id] of collections) {
      await assertFails(getDoc(doc(db, "companies", "alpha", collection, id)));
      await assertFails(setDoc(doc(db, "companies", "alpha", collection, id), { tampered: true }));
    }
  }
});

test("B2C-01-R1 company_admin_slot ops doc denies SA/CA/Dispo/driver browser R/W", async () => {
  const slotPath = ["companies", "alpha", "ops", "company_admin_slot"];
  const clients = [
    superAdmin(),
    auth("ca-1", "company_admin", "alpha"),
    auth("disp-1", "dispatcher", "alpha"),
    auth("drv-1", "driver", "alpha")
  ];
  for (const db of clients) {
    await assertFails(getDoc(doc(db, ...slotPath)));
    await assertFails(setDoc(doc(db, ...slotPath), { uid: "forged", claimedAt: "now" }));
    await assertFails(deleteDoc(doc(db, ...slotPath)));
  }
});

test("support sessions are readable by the tenant owner only and never client-written", async () => {
  const companyAdmin = auth("ca-1", "company_admin", "alpha");
  const dispatcher = auth("disp-1", "dispatcher", "alpha");
  const foreignAdmin = auth("ca-1", "company_admin", "beta");
  await assertSucceeds(getDoc(doc(companyAdmin, "companies", "alpha", "support_sessions", "sup-1")));
  await assertFails(getDoc(doc(dispatcher, "companies", "alpha", "support_sessions", "sup-1")));
  await assertFails(getDoc(doc(foreignAdmin, "companies", "alpha", "support_sessions", "sup-1")));
  await assertFails(updateDoc(doc(companyAdmin, "companies", "alpha", "support_sessions", "sup-1"), { status: "ended" }));
});

test("audit log stays admin-readable, tenant-scoped and immutable from the browser", async () => {
  const companyAdmin = auth("ca-1", "company_admin", "alpha");
  const dispatcher = auth("disp-1", "dispatcher", "alpha");
  await assertSucceeds(getDoc(doc(companyAdmin, "companies", "alpha", "audit_log", "audit-1")));
  await assertFails(getDoc(doc(dispatcher, "companies", "alpha", "audit_log", "audit-1")));
  await assertFails(getDoc(doc(companyAdmin, "companies", "beta", "audit_log", "audit-1")));
  await assertFails(updateDoc(doc(companyAdmin, "companies", "alpha", "audit_log", "audit-1"), { action: "rewritten" }));
  await assertFails(deleteDoc(doc(companyAdmin, "companies", "alpha", "audit_log", "audit-1")));
});
