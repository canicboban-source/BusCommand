function createRequireSuperAdmin({ hasFirebase, admin }) {
  return async function requireSuperAdmin(req, res, next) {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ success: false, error: "Nema tokena." });
    if (!hasFirebase()) return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    try {
      // checkRevoked: deaktivacija ili „odjavi sve uređaje“ mora odmah zatvoriti
      // i najprivilegovaniji API, a ne nakon isteka ID tokena.
      const decoded = await admin().auth().verifyIdToken(token, true);
      if (decoded.role !== "superadmin") return res.status(403).json({ success: false, error: "Pristup odbijen." });
      req.adminUser = decoded;
      return next();
    } catch (error) {
      req.log?.warn({ err: error }, "SuperAdmin token verification failed");
      return res.status(401).json({ success: false, error: "Nevažeći token." });
    }
  };
}

function aggregationCount(snapshot) {
  const count = Number(snapshot?.data?.().count);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("invalid-aggregation-count");
  return count;
}

async function getSuperAdminOverview(database) {
  const companiesRef = database.collection("companies");
  const [companyCountSnap, companyIdsSnap] = await Promise.all([
    companiesRef.count().get(),
    companiesRef.select().get()
  ]);
  const tenantCounts = await Promise.all(companyIdsSnap.docs.map(async (companyDoc) => {
    const [driversSnap, dispatchersSnap] = await Promise.all([
      companyDoc.ref.collection("drivers").count().get(),
      companyDoc.ref.collection("users").where("role", "==", "dispatcher").count().get()
    ]);
    return {
      drivers: aggregationCount(driversSnap),
      dispatchers: aggregationCount(dispatchersSnap)
    };
  }));
  return Object.freeze({
    companies: aggregationCount(companyCountSnap),
    drivers: tenantCounts.reduce((sum, value) => sum + value.drivers, 0),
    dispatchers: tenantCounts.reduce((sum, value) => sum + value.dispatchers, 0)
  });
}

function createSuperAdminOverviewHandler({ db }) {
  return async function superAdminOverview(req, res) {
    try {
      return res.json({ success: true, stats: await getSuperAdminOverview(db()) });
    } catch (error) {
      req.log?.error({ err: error }, "SuperAdmin overview aggregation failed");
      return res.status(500).json({ success: false, error: "Statistika trenutno nije dostupna." });
    }
  };
}

module.exports = { createRequireSuperAdmin, createSuperAdminOverviewHandler, getSuperAdminOverview };
