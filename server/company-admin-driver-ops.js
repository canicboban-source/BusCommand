"use strict";

/**
 * Company Admin driver create/list ops (D24.1 / D24.1.1 / D24.2).
 * EID lives only in driver_credentials; profiles stay credential-free.
 * Creates participate in the tenant driver_identity_guard transaction contract.
 */

const {
  CREDENTIAL_FIELDS,
  profileHasCredentialFields,
  profileHasCredentialFieldKey
} = require("./driver-credential-migration");
const {
  readDriverIdentityGuardInTx,
  writeDriverIdentityGuardBumpInTx,
  assertLicenseAllowsDriverCreate,
  findEidConflict,
  eidKey
} = require("./driver-identity-guard");

/** Test-only: runs after in-tx uniqueness reads, before profile/credential/guard writes. */
let _createDriverMutationHookForTests = null;
function setCreateDriverMutationHookForTests(fn) {
  _createDriverMutationHookForTests = typeof fn === "function" ? fn : null;
}

function normalizeEid(value) {
  return String(value || "").trim();
}

/**
 * Atomic manual create under D24.2 guard:
 * read guard + license + groups + uniqueness → write profile + credentials + guard bump.
 */
async function createManualCompanyDriver({
  db,
  FieldValue,
  bcryptHash,
  randomUUID,
  companyId,
  body,
  actorUid
}) {
  const companyRef = db.collection("companies").doc(companyId);
  const profileCol = companyRef.collection("drivers");
  const credentialCol = companyRef.collection("driver_credentials");

  const knownGroupIds = [];
  for (const value of body.knownGroupIds || []) {
    const id = String(value || "").trim();
    if (id && !knownGroupIds.includes(id)) knownGroupIds.push(id);
  }
  if (!knownGroupIds.includes(body.groupId)) knownGroupIds.unshift(body.groupId);

  const eid = normalizeEid(body.eid);
  const loginCodeHash = await bcryptHash(body.companyCode, 12);
  const driverId = randomUUID();

  const { resolveLicenseSnapshot } = require("./license-packages");

  await db.runTransaction(async (tx) => {
    const guard = await readDriverIdentityGuardInTx(tx, companyRef);

    for (const groupId of knownGroupIds) {
      const groupSnap = await tx.get(companyRef.collection("groups").doc(groupId));
      if (!groupSnap.exists) {
        const err = new Error("Jedna ili više grupa ne postoje u ovoj firmi.");
        err.code = "group-not-found";
        throw err;
      }
    }

    const [existingCredentials, existingProfiles, settingsSnap] = await Promise.all([
      tx.get(credentialCol),
      tx.get(profileCol),
      tx.get(companyRef.collection("settings").doc("main"))
    ]);

    const license = resolveLicenseSnapshot(settingsSnap.data() || {});
    assertLicenseAllowsDriverCreate(license);

    const maxDrivers = license.maxDrivers;
    if (maxDrivers != null && existingProfiles.size + 1 > maxDrivers) {
      const err = new Error("DRIVER_LIMIT_REACHED");
      err.code = "DRIVER_LIMIT_REACHED";
      err.maxDrivers = maxDrivers;
      err.licenseType = license.licenseType;
      err.packageLabel = license.packageLabel;
      throw err;
    }

    if (findEidConflict(existingCredentials.docs, [eid])) {
      const err = new Error("EID_EXISTS");
      err.code = "EID_EXISTS";
      throw err;
    }

    if (_createDriverMutationHookForTests) {
      await _createDriverMutationHookForTests({
        tx,
        companyRef,
        knownGroupIds,
        guard,
        phase: "before-writes"
      });
    }

    const nowTs = FieldValue.serverTimestamp();
    tx.set(profileCol.doc(driverId), {
      firstName: body.firstName,
      lastName: body.lastName,
      name: `${body.firstName} ${body.lastName}`.trim(),
      phone: body.phone,
      email: body.email,
      groupId: body.groupId,
      lineId: body.groupId,
      knownGroupIds,
      companyId,
      active: true,
      codeActivated: true,
      createdAt: nowTs,
      personalCodeSetAt: nowTs,
      personalCodeSetBy: actorUid
    });
    tx.set(credentialCol.doc(driverId), {
      eid,
      loginCodeHash,
      activationUsedAt: nowTs,
      activatedAt: nowTs,
      personalCodeUpdatedAt: nowTs,
      personalCodeUpdatedBy: actorUid,
      createdAt: nowTs
    });
    writeDriverIdentityGuardBumpInTx(tx, FieldValue, guard);
  });

  return {
    driverId,
    companyCode: body.companyCode,
    codeActivated: true,
    driver: {
      id: driverId,
      firstName: body.firstName,
      lastName: body.lastName,
      name: `${body.firstName} ${body.lastName}`.trim(),
      phone: body.phone,
      email: body.email,
      eid,
      groupId: body.groupId,
      lineId: body.groupId,
      knownGroupIds,
      companyId,
      active: true,
      codeActivated: true,
      hasPersonalCode: true
    }
  };
}

/**
 * CSV/import create under the same D24.2 guard transaction contract.
 * prepared: [{ driverId, profile, credentials }]
 * OTP hashes must be computed BEFORE the transaction.
 * D24.2.1-A: no company_code / companyCodeHash / bcrypt in this contract.
 */
async function commitImportedDriversWithIdentityGuard({
  db,
  FieldValue,
  companyId,
  groupId,
  prepared
}) {
  if (!Array.isArray(prepared) || !prepared.length) {
    const err = new Error("Nema vozača za uvoz.");
    err.code = "import-empty";
    throw err;
  }
  // Firestore transaction write limit is 500; each driver = profile + credentials (+ 1 guard).
  if (prepared.length > 249) {
    const err = new Error("CSV može sadržati najviše 249 vozača.");
    err.code = "import-too-large";
    throw err;
  }

  const companyRef = db.collection("companies").doc(companyId);
  const profileCol = companyRef.collection("drivers");
  const credentialCol = companyRef.collection("driver_credentials");
  const { resolveLicenseSnapshot } = require("./license-packages");

  const eids = prepared.map((row) => normalizeEid(row.credentials?.eid || row.profile?.eid));

  await db.runTransaction(async (tx) => {
    const guard = await readDriverIdentityGuardInTx(tx, companyRef);

    const groupSnap = await tx.get(companyRef.collection("groups").doc(groupId));
    if (!groupSnap.exists) {
      const err = new Error("Izabrana grupa nije pronađena.");
      err.code = "group-not-found";
      throw err;
    }

    const [existingCredentials, existingProfiles, settingsSnap] = await Promise.all([
      tx.get(credentialCol),
      tx.get(profileCol),
      tx.get(companyRef.collection("settings").doc("main"))
    ]);

    const license = resolveLicenseSnapshot(settingsSnap.data() || {});
    assertLicenseAllowsDriverCreate(license);

    const maxDrivers = license.maxDrivers;
    if (maxDrivers != null && existingProfiles.size + prepared.length > maxDrivers) {
      const err = new Error("DRIVER_LIMIT_REACHED");
      err.code = "DRIVER_LIMIT_REACHED";
      err.maxDrivers = maxDrivers;
      err.licenseType = license.licenseType;
      err.packageLabel = license.packageLabel;
      throw err;
    }

    if (findEidConflict(existingCredentials.docs, eids)) {
      const err = new Error("EID_EXISTS");
      err.code = "EID_EXISTS";
      throw err;
    }

    if (_createDriverMutationHookForTests) {
      await _createDriverMutationHookForTests({
        tx,
        companyRef,
        knownGroupIds: [groupId],
        guard,
        phase: "before-writes"
      });
    }

    for (const row of prepared) {
      tx.set(profileCol.doc(row.driverId), row.profile);
      tx.set(credentialCol.doc(row.driverId), row.credentials);
    }
    writeDriverIdentityGuardBumpInTx(tx, FieldValue, guard);
  });
}

/**
 * List drivers for CA: merge EID from credentials into response only.
 * Never backfills eid onto the Firestore profile.
 */
async function listCompanyDriversForAdmin({ db, companyId }) {
  const companyRef = db.collection("companies").doc(companyId);
  const [profileSnap, credSnap] = await Promise.all([
    companyRef.collection("drivers").get(),
    companyRef.collection("driver_credentials").get()
  ]);
  const eidById = new Map(
    credSnap.docs.map((doc) => [doc.id, normalizeEid(doc.data()?.eid)])
  );
  const hasLoginCodeById = new Map(
    credSnap.docs.map((doc) => [doc.id, Boolean(doc.data()?.loginCodeHash)])
  );

  const drivers = profileSnap.docs.map((doc) => {
    const data = doc.data() || {};
    const eid = eidById.get(doc.id) || "";
    const homeGroup = data.groupId || data.lineId || "";
    const known = Array.isArray(data.knownGroupIds)
      ? data.knownGroupIds.map((id) => String(id || "").trim()).filter(Boolean)
      : [];
    if (homeGroup && !known.includes(homeGroup)) known.unshift(homeGroup);
    return {
      id: doc.id,
      firstName: data.firstName || "",
      lastName: data.lastName || "",
      name: data.name || `${data.firstName || ""} ${data.lastName || ""}`.trim(),
      phone: data.phone || "",
      email: data.email || "",
      groupId: homeGroup,
      lineId: data.lineId || data.groupId || "",
      knownGroupIds: known,
      companyId,
      eid,
      active: data.active !== false,
      codeActivated: data.codeActivated === true,
      hasPersonalCode: hasLoginCodeById.get(doc.id) === true || data.codeActivated === true,
      _profileHasCredentialFields: profileHasCredentialFields(data)
    };
  });

  return {
    drivers: drivers.map(({ _profileHasCredentialFields, ...row }) => row),
    legacyCredentialProfiles: drivers
      .filter((row) => row._profileHasCredentialFields)
      .map((row) => row.id)
  };
}

module.exports = {
  createManualCompanyDriver,
  commitImportedDriversWithIdentityGuard,
  listCompanyDriversForAdmin,
  setCreateDriverMutationHookForTests,
  profileHasCredentialFields,
  profileHasCredentialFieldKey,
  CREDENTIAL_FIELDS,
  normalizeEid,
  eidKey
};
