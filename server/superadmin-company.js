const { ProvisioningError, normalizeFirebaseUid } = require("./provisioning");

function toIso(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") {
    try { return value.toDate().toISOString(); } catch { return null; }
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateKey(value) {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

function isSupportActive(support = {}) {
  if (support.active !== true || !support.expiresAt) return false;
  const expiresMs = typeof support.expiresAt.toDate === "function"
    ? support.expiresAt.toDate().getTime()
    : new Date(support.expiresAt).getTime();
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

async function readCompanyAdmin({ db, companyId, uid }) {
  uid = normalizeFirebaseUid(uid);
  const companyRef = db.collection("companies").doc(companyId);
  const userRef = companyRef.collection("users").doc(uid);
  const [companySnap, userSnap] = await Promise.all([companyRef.get(), userRef.get()]);
  const userData = userSnap.exists ? userSnap.data() : null;
  if (!companySnap.exists || !userData || userData.role !== "company_admin" || userData.companyId !== companyId) {
    throw new ProvisioningError("user-not-found", "Company admin nije pronadjen u ovoj firmi.");
  }
  return { companyRef, userRef, userData, uid };
}

async function listAllCompanyAdmins({ db }) {
  const companiesSnap = await db.collection("companies").select().get();
  const perCompany = await Promise.all(companiesSnap.docs.map(async (companyDoc) => {
    const usersSnap = await companyDoc.ref.collection("users")
      .where("role", "==", "company_admin")
      .get();
    return usersSnap.docs.map((userDoc) => {
      const data = userDoc.data() || {};
      return {
        id: userDoc.id,
        name: data.name || null,
        email: data.email || null,
        companyId: companyDoc.id,
        active: data.active !== false,
        role: "company-admin",
        createdAt: toIso(data.createdAt)
      };
    });
  }));
  return perCompany
    .flat()
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
}

async function getCompanyDetail({ db, companyId }) {
  const companyRef = db.collection("companies").doc(companyId);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
  }

  const [
    profileSnap,
    settingsSnap,
    supportSnap,
    driversSnap,
    groupsSnap,
    usersSnap
  ] = await Promise.all([
    companyRef.collection("profile").doc("main").get(),
    companyRef.collection("settings").doc("main").get(),
    companyRef.collection("settings").doc("support").get(),
    companyRef.collection("drivers").get(),
    companyRef.collection("groups").get(),
    companyRef.collection("users").get()
  ]);

  const profile = profileSnap.exists ? profileSnap.data() : (companySnap.data() || {});
  const settings = settingsSnap.exists ? settingsSnap.data() : {};
  const support = supportSnap.exists ? supportSnap.data() : {};
  const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const admins = users
    .filter(user => user.role === "company_admin")
    .map(user => ({
      id: user.id,
      email: user.email || null,
      name: user.name || null,
      active: user.active !== false,
      createdAt: toIso(user.createdAt)
    }))
    .sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
  const dispatchers = users.filter(user => user.role === "dispatcher");
  const supportActive = isSupportActive(support);

  return {
    id: companyId,
    name: profile.name || companyId,
    country: profile.country || null,
    contactEmail: profile.contactEmail || null,
    status: settings.status || "unknown",
    plan: settings.plan || "trial",
    maxDrivers: Number.isInteger(Number(settings.maxDrivers)) ? Number(settings.maxDrivers) : null,
    maxDispatchers: Number.isInteger(Number(settings.maxDispatchers)) ? Number(settings.maxDispatchers) : null,
    features: settings.features && typeof settings.features === "object" ? settings.features : {},
    trialEndsAt: toIso(settings.trialEndsAt),
    suspendedAt: toIso(settings.suspendedAt),
    suspendReason: settings.suspendReason || null,
    supportSessionEnabled: settings.features?.supportSession === true,
    supportSessionActive: supportActive,
    supportExpiresAt: supportActive ? toIso(support.expiresAt) : null,
    counts: {
      drivers: driversSnap.size || driversSnap.docs?.length || 0,
      groups: groupsSnap.size || groupsSnap.docs?.length || 0,
      dispatchers: dispatchers.length,
      companyAdmins: admins.length
    },
    admins
  };
}

async function updateCompanyDetails({ db, admin, companyId, input, actorId }) {
  const companyRef = db.collection("companies").doc(companyId);
  const profileRef = companyRef.collection("profile").doc("main");
  const settingsRef = companyRef.collection("settings").doc("main");
  const auditRef = companyRef.collection("audit_log").doc();
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const trialEndsAt = input.trialEndsAt
    ? admin.firestore.Timestamp.fromDate(new Date(`${input.trialEndsAt}T23:59:59.999Z`))
    : null;

  const changedFields = await db.runTransaction(async transaction => {
    const [companySnap, profileSnap, settingsSnap] = await Promise.all([
      transaction.get(companyRef),
      transaction.get(profileRef),
      transaction.get(settingsRef)
    ]);
    if (!companySnap.exists) {
      throw new ProvisioningError("company-not-found", "Firma nije pronađena.");
    }
    if (!settingsSnap.exists) {
      throw new ProvisioningError("license-unavailable", "Licenca firme nije dostupna.");
    }

    const root = companySnap.data() || {};
    const profile = profileSnap.exists ? profileSnap.data() : {};
    const settings = settingsSnap.data() || {};
    const before = {
      name: profile.name || root.name || companyId,
      country: profile.country || null,
      contactEmail: String(profile.contactEmail || "").toLowerCase() || null,
      plan: settings.plan || "trial",
      maxDrivers: Number(settings.maxDrivers),
      maxDispatchers: Number(settings.maxDispatchers),
      trialEndsAt: toDateKey(settings.trialEndsAt)
    };
    const after = {
      name: input.name,
      country: input.country,
      contactEmail: input.contactEmail,
      plan: input.plan,
      maxDrivers: input.maxDrivers,
      maxDispatchers: input.maxDispatchers,
      trialEndsAt: input.trialEndsAt
    };
    const fields = Object.keys(after).filter(field => before[field] !== after[field]);
    if (!fields.length) return fields;

    transaction.set(companyRef, { name: input.name, updatedAt: timestamp }, { merge: true });
    transaction.set(profileRef, {
      name: input.name,
      country: input.country,
      contactEmail: input.contactEmail,
      updatedAt: timestamp
    }, { merge: true });
    transaction.set(settingsRef, {
      plan: input.plan,
      maxDrivers: input.maxDrivers,
      maxDispatchers: input.maxDispatchers,
      trialEndsAt,
      updatedAt: timestamp
    }, { merge: true });
    transaction.set(auditRef, {
      action: "company_details_updated",
      actorId,
      actorRole: "superadmin",
      source: "server",
      details: { companyId, fields },
      timestamp
    });
    return fields;
  });

  return {
    company: await getCompanyDetail({ db, companyId }),
    changedFields
  };
}

async function setCompanyAdminActive({ db, admin, companyId, uid, active, actorId }) {
  const staff = await readCompanyAdmin({ db, companyId, uid });
  const { companyRef, userRef } = staff;
  uid = staff.uid;

  if (active) {
    const settingsSnap = await companyRef.collection("settings").doc("main").get();
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
      if (!data || data.companyId !== companyId || data.role !== "company_admin") {
        throw new ProvisioningError("user-not-found", "Company admin nije pronadjen u ovoj firmi.");
      }
      transaction.set(userRef, { active, sessionsValidAfterEpoch, updatedAt: timestamp }, { merge: true });
      transaction.set(companyRef.collection("audit_log").doc(), {
        action: active ? "company_admin_activated" : "company_admin_deactivated",
        actorId,
        details: { uid, email: data.email || null },
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

async function requestCompanyAdminPasswordReset({ db, admin, companyId, uid, actorId }) {
  const staff = await readCompanyAdmin({ db, companyId, uid });
  const { companyRef, userRef, userData } = staff;
  uid = staff.uid;

  const authUser = await admin.auth().getUser(uid);
  const email = String(authUser.email || userData.email || "").trim().toLowerCase();
  if (!email) {
    throw new ProvisioningError("email-missing", "Company admin nema email adresu.");
  }

  const resetLink = await admin.auth().generatePasswordResetLink(email);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  await db.runTransaction(async transaction => {
    transaction.set(userRef, { updatedAt: timestamp }, { merge: true });
    transaction.set(companyRef.collection("audit_log").doc(), {
      action: "company_admin_password_reset_requested",
      actorId,
      details: { uid, email },
      timestamp
    });
  });

  return { uid, email, resetLink };
}

module.exports = {
  getCompanyDetail,
  updateCompanyDetails,
  listAllCompanyAdmins,
  readCompanyAdmin,
  setCompanyAdminActive,
  requestCompanyAdminPasswordReset
};


