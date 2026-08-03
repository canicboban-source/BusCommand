const STAFF_ROLES = ["company_admin", "dispatcher"];
const PROVISIONER_ROLES = ["superadmin", "company_admin"];

function parseCompanyParam(companyId) {
  if (!companyId || typeof companyId !== "string") {
    return { ok: false, error: "Nedostaje companyId." };
  }
  const id = companyId.trim().toLowerCase();
  if (!id || id.length > 64 || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return { ok: false, error: "Nevalidan companyId." };
  }
  return { ok: true, id };
}

function bearerToken(req) {
  return String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
}

function normalizeGroups(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

/**
 * Staff authorization for every browser-facing API.
 *
 * Claims alone are not sufficient: they are minted at sign-in and a token stays
 * valid for up to an hour. The tenant user profile is therefore the source of
 * truth for `active` and for a dispatcher's assigned groups, exactly like the
 * driver surface already does in `server/driver-routes.js`.
 */
function createStaffAuth({ hasFirebase, admin, db }) {
  async function loadStaffProfile(companyId, uid) {
    const snapshot = await db().collection("companies").doc(companyId)
      .collection("users").doc(uid).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async function authenticate(req, res, { roles, requireProfile }) {
    if (!hasFirebase()) {
      res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
      return null;
    }
    const token = bearerToken(req);
    if (!token) {
      res.status(401).json({ success: false, error: "Nema tokena." });
      return null;
    }
    let decoded;
    try {
      decoded = await admin().auth().verifyIdToken(token, true);
    } catch (err) {
      req.log?.warn({ err }, "Staff token verification failed");
      res.status(401).json({ success: false, error: "Nevažeći token." });
      return null;
    }
    if (!roles.includes(decoded.role)) {
      res.status(403).json({ success: false, error: "Pristup odbijen." });
      return null;
    }
    if (!requireProfile) return decoded;
    if (!decoded.companyId || !decoded.uid) {
      res.status(403).json({ success: false, error: "Pristup odbijen." });
      return null;
    }
    let profile;
    try {
      profile = await loadStaffProfile(decoded.companyId, decoded.uid);
    } catch (err) {
      req.log?.error({ err }, "Staff profile lookup failed");
      res.status(503).json({ success: false, error: "Nalog trenutno nije moguće proveriti." });
      return null;
    }
    if (!profile || profile.active === false || profile.role !== decoded.role) {
      res.status(403).json({ success: false, error: "Nalog nije aktivan." });
      return null;
    }
    return { ...decoded, groups: normalizeGroups(profile.groups), name: decoded.name || profile.name || null };
  }

  async function requireCompanyStaff(req, res, next) {
    const staff = await authenticate(req, res, { roles: STAFF_ROLES, requireProfile: true });
    if (!staff) return undefined;
    req.staffUser = staff;
    return next();
  }

  async function requireCompanyAdmin(req, res, next) {
    const staff = await authenticate(req, res, { roles: ["company_admin"], requireProfile: true });
    if (!staff) return undefined;
    req.staffUser = staff;
    return next();
  }

  // SuperAdmin provisions companies before any tenant profile exists, so this
  // gate stays claims-based on purpose; tenant-scoped effects are re-checked by
  // the route handlers.
  async function requireUserProvisioner(req, res, next) {
    const actor = await authenticate(req, res, { roles: PROVISIONER_ROLES, requireProfile: false });
    if (!actor) return undefined;
    req.adminUser = actor;
    return next();
  }

  /**
   * Tenant metadata (license plan, limits, feature flags) is only for members of
   * that tenant. Without this gate the route was an unauthenticated oracle for
   * which company ids exist and what each one has bought.
   */
  async function requireCompanyMemberParam(req, res, next) {
    const parsed = parseCompanyParam(req.params.companyId);
    if (!hasFirebase()) {
      return res.status(503).json({ success: false, error: "Firebase nije konfigurisan." });
    }
    if (!parsed.ok) {
      return res.status(400).json({ success: false, error: parsed.error });
    }
    const token = bearerToken(req);
    if (!token) return res.status(401).json({ success: false, error: "Nema tokena." });
    let decoded;
    try {
      decoded = await admin().auth().verifyIdToken(token, true);
    } catch (err) {
      req.log?.warn({ err }, "Company member token verification failed");
      return res.status(401).json({ success: false, error: "Nevažeći token." });
    }
    if (decoded.role !== "superadmin" && decoded.companyId !== parsed.id) {
      return res.status(403).json({ success: false, error: "Pristup drugoj firmi nije dozvoljen." });
    }
    req.companyMember = decoded;
    req.tenantId = parsed.id;
    return next();
  }

  function requireOwnCompany(req, res) {
    const parsed = parseCompanyParam(req.body?.companyId || req.query?.companyId);
    if (!parsed.ok) {
      res.status(400).json({ success: false, error: parsed.error });
      return null;
    }
    if (parsed.id !== req.staffUser.companyId) {
      res.status(403).json({ success: false, error: "Pristup drugoj firmi nije dozvoljen." });
      return null;
    }
    return parsed.id;
  }

  return {
    requireCompanyStaff,
    requireCompanyAdmin,
    requireCompanyMemberParam,
    requireUserProvisioner,
    requireOwnCompany
  };
}

module.exports = { createStaffAuth, parseCompanyParam };
