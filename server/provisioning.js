class ProvisioningError extends Error {
  constructor(code, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProvisioningError";
    this.code = code;
  }
}

const STAFF_ROLES = new Set(["company_admin", "dispatcher"]);
const { normalizeGroupIds, assertCompanyGroupsExist } = require("./group-access");
const { buildNewCompanyLicenseFields } = require("./license-packages");

function normalizeFirebaseUid(value) {
  const uid = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) {
    throw new ProvisioningError("invalid-uid", "Nevalidan identifikator korisnika.");
  }
  return uid;
}

async function createCompanyAtomic({
  db, admin, companyId, name, country, contactEmail, actorId, licenseType = "pro"
}) {
  const companyRef = db.collection("companies").doc(companyId);
  const profileRef = companyRef.collection("profile").doc("main");
  const brandingRef = companyRef.collection("branding").doc("main");
  const settingsRef = companyRef.collection("settings").doc("main");
  const sosRef = companyRef.collection("settings").doc("sos");
  const auditRef = companyRef.collection("audit_log").doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const normalizedCountry = String(country || "AT").trim().toUpperCase();
  const timezone = normalizedCountry === "RS" ? "Europe/Belgrade" : "Europe/Vienna";
  const licenseFields = buildNewCompanyLicenseFields({ licenseType, admin, trialDays: 30 });

  await db.runTransaction(async (transaction) => {
    const existing = await Promise.all([
      transaction.get(companyRef),
      transaction.get(profileRef),
      transaction.get(settingsRef)
    ]);
    if (existing.some((snapshot) => snapshot.exists)) {
      throw new ProvisioningError("company-exists", "Firma već postoji ili je djelimično inicijalizovana.");
    }

    transaction.set(companyRef, { name, slug: companyId, companyId, status: "active", createdAt: timestamp });
    transaction.set(profileRef, {
      name, slug: companyId, country: normalizedCountry,
      contactEmail: contactEmail || `admin@${companyId}.com`,
      timezone, defaultLanguage: normalizedCountry === "RS" ? "sr" : "de", status: "active", createdAt: timestamp
    });
    transaction.set(brandingRef, { name, primaryColor: "#3b82f6", logo: null, appTitle: `${name} Fleet` });
    transaction.set(settingsRef, {
      ...licenseFields,
      features: {
        liveMap: true,
        liveGps: false,
        pdfSchedules: true,
        excelImport: true,
        sosAlarm: true,
        multiLanguage: true,
        reports: true,
        supportSession: false,
        shiftConfirmationScheduler: false
      }
    });
    transaction.set(sosRef, { sosActive: false, sosDriver: "", sosBus: "" });
    transaction.set(auditRef, {
      action: "company_created",
      actorId,
      details: { companyId, name, licenseType: licenseFields.licenseType },
      timestamp
    });
  });

  return { companyId, name, licenseType: licenseFields.licenseType };
}

/** Known top-level subcollections under companies/{id} (ops + config). */
const COMPANY_SUBCOLLECTIONS = Object.freeze([
  "drivers",
  "driver_credentials",
  "driver_sessions",
  "groups",
  "buses",
  "routes",
  "shifts",
  "schedules",
  "messages",
  "reports",
  "vacations",
  "lost_items",
  "service_plans",
  "audit_log",
  "confirmation_outbox",
  "shift_confirmations",
  "users",
  "profile",
  "branding",
  "settings",
  "ops",
  "companyAdmins",
  "dispatchers"
]);

async function deleteQueryBatch(db, query, batchSize = 400) {
  const snap = await query.limit(batchSize).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function deleteCollectionDocs(db, collectionRef) {
  let total = 0;
  for (;;) {
    const removed = await deleteQueryBatch(db, collectionRef);
    total += removed;
    if (removed === 0) break;
  }
  return total;
}

async function wipeServicePlanDuties(db, companyRef) {
  const plans = await companyRef.collection("service_plans").get();
  let total = 0;
  for (const planDoc of plans.docs) {
    total += await deleteCollectionDocs(db, planDoc.ref.collection("duties"));
  }
  return total;
}

/**
 * Permanently delete a company tree + Auth users that belong to it.
 * Requires confirmCompanyId === companyId (typed confirmation).
 */
async function deleteCompanyAtomic({ db, admin, companyId, confirmCompanyId, actorId }) {
  const id = String(companyId || "").trim();
  if (!id || String(confirmCompanyId || "").trim() !== id) {
    throw new ProvisioningError(
      "confirm-mismatch",
      "Za brisanje firme morate tačno ponoviti companyId."
    );
  }

  const companyRef = db.collection("companies").doc(id);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
  }

  const [usersSnap, driversSnap] = await Promise.all([
    companyRef.collection("users").get(),
    companyRef.collection("drivers").get()
  ]);
  const authUids = new Set([
    ...usersSnap.docs.map((doc) => doc.id),
    ...driversSnap.docs.map((doc) => doc.id)
  ]);

  await wipeServicePlanDuties(db, companyRef);

  const firestore = typeof admin.firestore === "function" ? admin.firestore() : db;
  if (typeof firestore.recursiveDelete === "function") {
    await firestore.recursiveDelete(companyRef);
  } else {
    for (const name of COMPANY_SUBCOLLECTIONS) {
      await deleteCollectionDocs(db, companyRef.collection(name));
    }
    await companyRef.delete();
  }

  let deletedAuthUsers = 0;
  let authErrors = 0;
  for (const uid of authUids) {
    try {
      await admin.auth().deleteUser(uid);
      deletedAuthUsers += 1;
    } catch (error) {
      if (error?.code === "auth/user-not-found") continue;
      authErrors += 1;
    }
  }

  return {
    companyId: id,
    deletedAuthUsers,
    authErrors,
    actorId: actorId || null
  };
}

async function deleteWithRetry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { await operation(); return; }
    catch (error) { lastError = error; }
  }
  throw lastError;
}

const COMPANY_ADMIN_SLOT_DOC = "company_admin_slot";

/**
 * Production path for role=company_admin only.
 * Auth is outside Firestore; uniqueness uses ops/company_admin_slot + existing CA docs.
 */
async function provisionCompanyAdminMissingOnly({
  db, admin, email, password, name, companyId, actorId
}) {
  if (!companyId) {
    throw new ProvisioningError("company-required", "companyId je obavezan za staff nalog.");
  }
  const displayName = name || email;
  const companyRef = db.collection("companies").doc(companyId);
  const settingsRef = companyRef.collection("settings").doc("main");
  const slotRef = companyRef.collection("ops").doc(COMPANY_ADMIN_SLOT_DOC);

  // Fail closed before Auth when company is obviously missing / suspended.
  const [companySnap, settingsSnap, slotSnap, adminsSnap] = await Promise.all([
    companyRef.get(),
    settingsRef.get(),
    slotRef.get(),
    companyRef.collection("users").where("role", "==", "company_admin").get()
  ]);
  if (!companySnap.exists) {
    throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
  }
  if (!settingsSnap.exists) {
    throw new ProvisioningError("license-unavailable", "Licenca firme nije dostupna.");
  }
  const preStatus = settingsSnap.data()?.status;
  if (preStatus === "suspended") {
    throw new ProvisioningError("license-suspended", "Licenca firme je suspendovana.");
  }
  if (preStatus !== "active") {
    throw new ProvisioningError("license-unavailable", "Licenca firme nije aktivna.");
  }
  const preAdminCount = Number(adminsSnap.size) || (adminsSnap.docs || []).length || 0;
  if (slotSnap.exists || preAdminCount > 0) {
    throw new ProvisioningError("ca-exists", "Company admin već postoji za ovu firmu.");
  }

  let userRecord;
  try {
    userRecord = await admin.auth().createUser({ email, password, displayName });
    const claims = {
      role: "company_admin",
      companyId,
      name: displayName,
      mustChangeLoginCode: false
    };
    await admin.auth().setCustomUserClaims(userRecord.uid, claims);

    const userRef = companyRef.collection("users").doc(userRecord.uid);
    const auditRef = companyRef.collection("audit_log").doc();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const adminsQuery = companyRef.collection("users").where("role", "==", "company_admin");

    await db.runTransaction(async (transaction) => {
      // All reads before any writes.
      const company = await transaction.get(companyRef);
      const settings = await transaction.get(settingsRef);
      const slot = await transaction.get(slotRef);
      const admins = await transaction.get(adminsQuery);

      if (!company.exists) {
        throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
      }
      if (!settings.exists) {
        throw new ProvisioningError("license-unavailable", "Licenca firme nije dostupna.");
      }
      const status = settings.data()?.status;
      if (status === "suspended") {
        throw new ProvisioningError("license-suspended", "Licenca firme je suspendovana.");
      }
      if (status !== "active") {
        throw new ProvisioningError("license-unavailable", "Licenca firme nije aktivna.");
      }
      const adminCount = admins.empty === true
        ? 0
        : (Number(admins.size) || (admins.docs || []).length || 0);
      if (slot.exists || adminCount > 0) {
        throw new ProvisioningError("ca-exists", "Company admin već postoji za ovu firmu.");
      }

      transaction.set(userRef, {
        id: userRecord.uid,
        email,
        name: displayName,
        role: "company_admin",
        companyId,
        groups: [],
        active: true,
        sessionsValidAfterEpoch: 0,
        createdAt: timestamp
      });
      // Slot: only uid + claimedAt (no PII).
      transaction.set(slotRef, {
        uid: userRecord.uid,
        claimedAt: timestamp
      });
      transaction.set(auditRef, {
        action: "user_created",
        actorId,
        details: { uid: userRecord.uid, role: "company_admin", companyId },
        timestamp
      });
    });

    return {
      uid: userRecord.uid,
      email,
      claims: {
        role: "company_admin",
        companyId,
        name: displayName,
        mustChangeLoginCode: false
      }
    };
  } catch (error) {
    if (!userRecord) throw error;
    try {
      await deleteWithRetry(() => admin.auth().deleteUser(userRecord.uid));
    } catch (cleanupError) {
      throw new ProvisioningError(
        "compensation-failed",
        "Provisioning cleanup nije uspio.",
        cleanupError
      );
    }
    throw error;
  }
}

async function provisionUser({ db, admin, email, password, name, role, companyId, groups = [], actorId }) {
  if (![...STAFF_ROLES, "superadmin"].includes(role)) {
    throw new ProvisioningError("role-not-allowed", "Uloga nije dozvoljena.");
  }
  if (role === "superadmin" && companyId) {
    throw new ProvisioningError("superadmin-company-forbidden", "Superadmin ne smije imati companyId.");
  }
  if (STAFF_ROLES.has(role) && !companyId) {
    throw new ProvisioningError("company-required", "companyId je obavezan za staff nalog.");
  }

  // Every production company_admin create shares the slot guard.
  if (role === "company_admin") {
    return provisionCompanyAdminMissingOnly({
      db, admin, email, password, name, companyId, actorId
    });
  }

  const displayName = name || email;
  const companyRef = companyId ? db.collection("companies").doc(companyId) : null;
  if (companyRef && !(await companyRef.get()).exists) {
    throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
  }
  const normalizedGroups = role === "dispatcher" ? normalizeGroupIds(groups) : [];
  if (companyRef && normalizedGroups.length) await assertCompanyGroupsExist(companyRef, normalizedGroups);

  let userRecord;
  let userRef;
  try {
    userRecord = await admin.auth().createUser({ email, password, displayName });
    const claims = { role, name: displayName, mustChangeLoginCode: false };
    if (STAFF_ROLES.has(role)) claims.companyId = companyId;
    if (role === "dispatcher") claims.groups = normalizedGroups;
    await admin.auth().setCustomUserClaims(userRecord.uid, claims);

    if (STAFF_ROLES.has(role)) {
      userRef = companyRef.collection("users").doc(userRecord.uid);
      const auditRef = companyRef.collection("audit_log").doc();
      const timestamp = admin.firestore.FieldValue.serverTimestamp();
      await db.runTransaction(async (transaction) => {
        const company = await transaction.get(companyRef);
        if (!company.exists) throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
        transaction.set(userRef, {
          id: userRecord.uid, email, name: displayName, role, companyId,
          groups: normalizedGroups, active: true, sessionsValidAfterEpoch: 0, createdAt: timestamp
        });
        transaction.set(auditRef, {
          action: "user_created", actorId,
          details: { uid: userRecord.uid, email, role, companyId }, timestamp
        });
      });
    }
    return { uid: userRecord.uid, email, claims };
  } catch (error) {
    if (!userRecord) throw error;
    const cleanupErrors = [];
    if (userRef) {
      try { await deleteWithRetry(() => userRef.delete()); }
      catch (cleanupError) { cleanupErrors.push(cleanupError); }
    }
    try { await deleteWithRetry(() => admin.auth().deleteUser(userRecord.uid)); }
    catch (cleanupError) { cleanupErrors.push(cleanupError); }
    if (cleanupErrors.length) {
      throw new ProvisioningError("compensation-failed", "Provisioning cleanup nije uspio.", error);
    }
    throw error;
  }
}

async function updateDispatcherGroups({ db, admin, companyId, uid, groups, actorId }) {
  uid = normalizeFirebaseUid(uid);
  const normalizedGroups = normalizeGroupIds(groups);
  const companyRef = db.collection("companies").doc(companyId);
  const userRef = companyRef.collection("users").doc(uid);
  const [companySnap, userSnap] = await Promise.all([companyRef.get(), userRef.get()]);
  if (!companySnap.exists || !userSnap.exists) throw new ProvisioningError("user-not-found", "Dispatcher nije pronađen u ovoj firmi.");
  const userData = userSnap.data();
  if (userData.role !== "dispatcher" || userData.companyId !== companyId) {
    throw new ProvisioningError("user-not-found", "Dispatcher nije pronađen u ovoj firmi.");
  }
  if (userData.deletionPending === true) {
    throw new ProvisioningError("dispatcher-deleting", "Brisanje ovog disponenta je već pokrenuto.");
  }
  await assertCompanyGroupsExist(companyRef, normalizedGroups);
  const authUser = await admin.auth().getUser(uid);
  const previousClaims = authUser.customClaims || {};
  const nextClaims = {
    ...previousClaims, role: "dispatcher", companyId,
    name: previousClaims.name || userData.name || authUser.displayName || authUser.email,
    mustChangeLoginCode: false, groups: normalizedGroups
  };
  await admin.auth().setCustomUserClaims(uid, nextClaims);
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const sessionsValidAfterEpoch = Math.floor(Date.now() / 1000);
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(userRef);
      if (!current.exists || current.data().companyId !== companyId || current.data().role !== "dispatcher") {
        throw new ProvisioningError("user-not-found", "Dispatcher nije pronađen u ovoj firmi.");
      }
      transaction.set(userRef, { groups: normalizedGroups, sessionsValidAfterEpoch, updatedAt: timestamp }, { merge: true });
      transaction.set(companyRef.collection("audit_log").doc(), {
        action: "dispatcher_groups_updated", actorId,
        details: { uid, groups: normalizedGroups }, timestamp
      });
    });
  } catch (error) {
    await admin.auth().setCustomUserClaims(uid, previousClaims);
    throw error;
  }
  await admin.auth().revokeRefreshTokens(uid);
  return { uid, groups: normalizedGroups, requiresReauthentication: true };
}

async function readCompanyDispatcher({ db, companyId, uid }) {
  uid = normalizeFirebaseUid(uid);
  const companyRef = db.collection("companies").doc(companyId);
  const userRef = companyRef.collection("users").doc(uid);
  const [companySnap, userSnap] = await Promise.all([companyRef.get(), userRef.get()]);
  const userData = userSnap.exists ? userSnap.data() : null;
  if (!companySnap.exists || !userData || userData.role !== "dispatcher" || userData.companyId !== companyId) {
    throw new ProvisioningError("user-not-found", "Dispatcher nije pronadjen u ovoj firmi.");
  }
  return { companyRef, userRef, userData, uid };
}

async function setDispatcherActive({ db, admin, companyId, uid, active, actorId }) {
  const dispatcher = await readCompanyDispatcher({ db, companyId, uid });
  const { companyRef, userRef } = dispatcher;
  uid = dispatcher.uid;
  if (dispatcher.userData.deletionPending === true) {
    throw new ProvisioningError("dispatcher-deleting", "Brisanje ovog disponenta je već pokrenuto.");
  }
  if (active) {
    const [settingsSnap, dispatchersSnap] = await Promise.all([
      companyRef.collection("settings").doc("main").get(),
      companyRef.collection("users").where("role", "==", "dispatcher").get()
    ]);
    if (!settingsSnap.exists) {
      throw new ProvisioningError("license-unavailable", "Licenca firme nije dostupna.");
    }
    const settings = settingsSnap.data();
    if (settings.status === "suspended") {
      throw new ProvisioningError("license-suspended", "Licenca firme je suspendovana.");
    }
    if (settings.status !== "active") {
      throw new ProvisioningError("license-unavailable", "Licenca firme nije aktivna.");
    }
    const activeCount = dispatchersSnap.docs.filter(doc => doc.id !== uid && doc.data().active !== false).length;
    const maxDispatchers = Number(settings.maxDispatchers);
    if (!Number.isInteger(maxDispatchers) || maxDispatchers < 1) {
      throw new ProvisioningError("license-unavailable", "Limit dispatchera nije konfigurisan u licenci.");
    }
    if (activeCount >= maxDispatchers) {
      throw new ProvisioningError("dispatcher-limit", "Dostignut je limit aktivnih dispatchera za ovu licencu.");
    }
  }
  const authUser = await admin.auth().getUser(uid);
  const wasDisabled = authUser.disabled === true;
  await admin.auth().updateUser(uid, { disabled: !active });
  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const sessionsValidAfterEpoch = Math.floor(Date.now() / 1000);
    await db.runTransaction(async transaction => {
      const current = await transaction.get(userRef);
      const data = current.exists ? current.data() : null;
      if (!data || data.companyId !== companyId || data.role !== "dispatcher") {
        throw new ProvisioningError("user-not-found", "Dispatcher nije pronadjen u ovoj firmi.");
      }
      transaction.set(userRef, { active, sessionsValidAfterEpoch, updatedAt: timestamp }, { merge: true });
      transaction.set(companyRef.collection("audit_log").doc(), {
        action: active ? "dispatcher_activated" : "dispatcher_deactivated",
        actorId,
        details: { uid },
        timestamp
      });
    });
  } catch (error) {
    try {
      await admin.auth().updateUser(uid, { disabled: wasDisabled });
    } catch (cleanupError) {
      throw new ProvisioningError("compensation-failed", "Promena naloga nije bezbedno vracena.", cleanupError);
    }
    throw error;
  }
  await admin.auth().revokeRefreshTokens(uid);
  return { uid, active, requiresReauthentication: true };
}

async function deleteDispatcher({ db, admin, companyId, uid, confirmEmail, actorId }) {
  uid = normalizeFirebaseUid(uid);
  const normalizedEmail = String(confirmEmail || "").trim().toLowerCase();
  const companyRef = db.collection("companies").doc(companyId);
  const userRef = companyRef.collection("users").doc(uid);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await db.runTransaction(async transaction => {
    const current = await transaction.get(userRef);
    const data = current.exists ? current.data() : null;
    if (!data || data.companyId !== companyId || data.role !== "dispatcher") {
      throw new ProvisioningError("user-not-found", "Disponent nije pronađen u ovoj firmi.");
    }
    if (data.active !== false) {
      throw new ProvisioningError("dispatcher-active", "Disponent prvo mora biti deaktiviran.");
    }
    if (String(data.email || "").trim().toLowerCase() !== normalizedEmail) {
      throw new ProvisioningError("confirm-mismatch", "Potvrda email adrese se ne poklapa.");
    }
    transaction.set(userRef, { deletionPending: true, updatedAt: timestamp }, { merge: true });
  });

  try {
    await admin.auth().deleteUser(uid);
  } catch (error) {
    if (!["auth/user-not-found", "user-not-found"].includes(error.code)) {
      await db.runTransaction(async transaction => {
        const current = await transaction.get(userRef);
        if (current.exists) {
          transaction.set(userRef, { deletionPending: false, updatedAt: timestamp }, { merge: true });
        }
      }).catch(() => {});
      throw error;
    }
  }

  try {
    await db.runTransaction(async transaction => {
      const current = await transaction.get(userRef);
      const data = current.exists ? current.data() : null;
      if (!data || data.companyId !== companyId || data.role !== "dispatcher" || data.active !== false) {
        throw new ProvisioningError("dispatcher-delete-incomplete", "Auth nalog je uklonjen, ali profil zahteva administrativno čišćenje.");
      }
      transaction.delete(userRef);
      transaction.set(companyRef.collection("audit_log").doc(), {
        action: "dispatcher_deleted",
        actorId,
        details: { uid },
        timestamp
      });
    });
  } catch (error) {
    if (error instanceof ProvisioningError) throw error;
    throw new ProvisioningError("dispatcher-delete-incomplete", "Auth nalog je uklonjen, ali profil zahteva administrativno čišćenje.", error);
  }

  return { uid, deleted: true };
}

async function revokeDispatcherSessions({ db, admin, companyId, uid, actorId }) {
  const dispatcher = await readCompanyDispatcher({ db, companyId, uid });
  const { companyRef, userRef } = dispatcher;
  uid = dispatcher.uid;
  if (dispatcher.userData.deletionPending === true) {
    throw new ProvisioningError("dispatcher-deleting", "Brisanje ovog disponenta je već pokrenuto.");
  }
  await admin.auth().getUser(uid);
  await admin.auth().revokeRefreshTokens(uid);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const sessionsValidAfterEpoch = Math.floor(Date.now() / 1000);
  await db.runTransaction(async transaction => {
    transaction.set(userRef, { sessionsValidAfterEpoch, updatedAt: timestamp }, { merge: true });
    transaction.set(companyRef.collection("audit_log").doc(), {
      action: "dispatcher_sessions_revoked",
      actorId,
      details: { uid },
      timestamp
    });
  });
  return { uid, requiresReauthentication: true };
}

async function updateDispatcherProfile({ db, admin, companyId, uid, name, email, phone, actorId }) {
  const dispatcher = await readCompanyDispatcher({ db, companyId, uid });
  const { companyRef, userRef, userData } = dispatcher;
  uid = dispatcher.uid;
  if (userData.deletionPending === true) {
    throw new ProvisioningError("dispatcher-deleting", "Brisanje ovog disponenta je već pokrenuto.");
  }

  const nextName = String(name || "").trim();
  const nextEmail = String(email || "").trim().toLowerCase();
  const nextPhone = String(phone || "").trim();
  const previousEmail = String(userData.email || "").trim().toLowerCase();
  const emailChanged = nextEmail !== previousEmail;

  const authUser = await admin.auth().getUser(uid);
  const previousClaims = authUser.customClaims || {};
  const previousAuth = {
    displayName: authUser.displayName || previousClaims.name || userData.name || "",
    email: String(authUser.email || previousEmail).trim().toLowerCase()
  };

  const authUpdate = { displayName: nextName };
  if (emailChanged) authUpdate.email = nextEmail;
  try {
    await admin.auth().updateUser(uid, authUpdate);
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      throw new ProvisioningError("email-exists", "Email adresa je već u upotrebi.");
    }
    if (error.code === "auth/invalid-email") {
      throw new ProvisioningError("email-invalid", "Email adresa nije ispravna.");
    }
    throw error;
  }

  const nextClaims = {
    ...previousClaims,
    role: "dispatcher",
    companyId,
    name: nextName,
    mustChangeLoginCode: false,
    groups: Array.isArray(previousClaims.groups) ? previousClaims.groups : (userData.groups || [])
  };
  await admin.auth().setCustomUserClaims(uid, nextClaims);

  try {
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const sessionsValidAfterEpoch = emailChanged ? Math.floor(Date.now() / 1000) : undefined;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(userRef);
      const data = current.exists ? current.data() : null;
      if (!data || data.companyId !== companyId || data.role !== "dispatcher") {
        throw new ProvisioningError("user-not-found", "Dispatcher nije pronađen u ovoj firmi.");
      }
      const patch = {
        name: nextName,
        email: nextEmail,
        phone: nextPhone,
        updatedAt: timestamp
      };
      if (sessionsValidAfterEpoch !== undefined) patch.sessionsValidAfterEpoch = sessionsValidAfterEpoch;
      transaction.set(userRef, patch, { merge: true });
      transaction.set(companyRef.collection("audit_log").doc(), {
        action: "dispatcher_profile_updated",
        actorId,
        details: {
          uid,
          emailChanged,
          fields: ["name", "email", "phone"]
        },
        timestamp
      });
    });
  } catch (error) {
    try {
      await admin.auth().updateUser(uid, {
        displayName: previousAuth.displayName,
        email: previousAuth.email
      });
      await admin.auth().setCustomUserClaims(uid, previousClaims);
    } catch (cleanupError) {
      throw new ProvisioningError("compensation-failed", "Profil nije bezbedno vraćen.", cleanupError);
    }
    throw error;
  }

  if (emailChanged) await admin.auth().revokeRefreshTokens(uid);
  return {
    uid,
    name: nextName,
    email: nextEmail,
    phone: nextPhone,
    requiresReauthentication: emailChanged
  };
}

module.exports = {
  ProvisioningError,
  STAFF_ROLES,
  COMPANY_SUBCOLLECTIONS,
  COMPANY_ADMIN_SLOT_DOC,
  createCompanyAtomic,
  deleteCompanyAtomic,
  deleteDispatcher,
  provisionUser,
  provisionCompanyAdminMissingOnly,
  normalizeFirebaseUid,
  readCompanyDispatcher,
  revokeDispatcherSessions,
  setDispatcherActive,
  updateDispatcherGroups,
  updateDispatcherProfile
};
