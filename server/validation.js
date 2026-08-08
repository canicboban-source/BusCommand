// BusCommand — Zod šeme za API POST body validaciju
const { z } = require("zod");

const companyIdSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "companyId mora imati najmanje 2 karaktera.")
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/, "companyId sme sadržati samo mala slova, brojeve i crtice.");

const RESERVED_COMPANY_IDS = new Set(["demo", "superadmin", "admin", "www"]);

function sanitizeCompanyId(raw) {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "");
}

const companyStatusBody = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500).optional().nullable()
});

const createCompanyBody = z.object({
  companyId: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().max(64).optional(),
  contactEmail: z.string().trim().email().max(254).optional(),
  licenseType: z.enum(["starter", "pro", "fleet_master", "enterprise"]).optional()
});

const deleteCompanyBody = z.object({
  confirmCompanyId: z.string().trim().min(1).max(64)
});

// Super Admin accounts are bootstrap-only — never mint via this public admin API.
const createUserBody = z.object({
  email: z.string().trim().email().max(254),
  // Align SA→CA with CA→dispatcher: min 6 + letter + digit (MASTER §4 interim floor).
  password: z.string().min(6).max(128)
    .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Lozinka mora sadrzati slovo i broj."),
  name: z.string().trim().max(200).optional(),
  role: z.enum(["company_admin", "dispatcher"]),
  companyId: z.string().trim().max(64),
  groups: z.array(z.string().trim().min(1).max(64)).max(100).optional().default([])
}).superRefine((data, ctx) => {
  if (!data.companyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "companyId je obavezan za ovu ulogu.",
      path: ["companyId"]
    });
  }
});

const updateUserGroupsBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  groups: z.array(z.string().trim().min(1).max(64)).max(100)
});

const companyDispatcherBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(6).max(128)
    .refine(value => /[A-Za-z]/.test(value) && /\d/.test(value), "Lozinka mora sadrzati slovo i broj."),
  name: z.string().trim().min(2).max(80),
  groups: z.array(z.string().trim().min(1).max(64)).min(1).max(100)
});

const companyDispatcherStatusBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  active: z.boolean()
});

const companyDispatcherActionBody = z.object({
  companyId: z.string().trim().min(1).max(64)
});

const companyDispatcherDeleteBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  confirmEmail: z.string().trim().toLowerCase().email().max(254)
}).strict();

const companyDispatcherProfileBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().max(40).optional().default("")
    .refine(
      (value) => !value || value.replace(/\D/g, "").length >= 8,
      "Telefon mora imati najmanje 8 cifara."
    )
}).strict();

const companyAdminStatusBody = z.object({
  active: z.boolean()
});

const companyProfileSettingsBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  country: z.enum(["AT", "RS"]),
  defaultLanguage: z.enum(["de", "sr", "en"]),
  contactEmail: z.string().trim().toLowerCase().email().max(254)
});

const httpsLogoUrl = z.string().trim().max(350000).superRefine((value, ctx) => {
  if (!value) return;
  if (value.startsWith("data:")) {
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo fajl mora biti PNG, JPG, WEBP ili GIF." });
    }
    if (value.length > 350000) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo fajl je prevelik." });
    }
    return;
  }
  if (value.length > 2048) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo URL je predugacak." });
    return;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo URL mora koristiti HTTPS." });
    }
    if (parsed.username || parsed.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo URL ne sme sadrzati pristupne podatke." });
    }
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Logo URL nije validan." });
  }
});

const companyBrandingBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(80),
  primaryColor: z.string().trim().toUpperCase().regex(/^#[0-9A-F]{6}$/, "Primarna boja mora biti u #RRGGBB formatu."),
  logoUrl: httpsLogoUrl.optional().default("")
});

const companyGroupFields = {
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).optional().default(""),
  color: z.string().trim().toUpperCase().regex(/^#[0-9A-F]{6}$/, "Boja grupe mora biti u #RRGGBB formatu.")
};

const companyGroupBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  id: z.string().trim().regex(/^\d{1,6}$/, "ID linije mora imati od 1 do 6 cifara."),
  ...companyGroupFields
});

const companyGroupUpdateBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  ...companyGroupFields
});

/** Profile-only driver update — never accepts eid/pin/company_code/credentials. */
const companyDriverProfileBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(3).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
  groupId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
  /** Extra lines the driver can operate (home groupId is always stored too). */
  knownGroupIds: z.array(
    z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/)
  ).max(40).optional().default([])
}).strict();

/** CA-only: set a new personal login code (PIN) — plaintext returned once. Must match driver login rules. */
const companyDriverPersonalCodeBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  companyCode: z.string().trim().regex(/^\d{5,12}$/, "Lični kod mora imati 5–12 cifara.")
}).strict();

function validateBody(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const message = first?.message || "Nevalidan zahtev.";
      return res.status(400).json({
        success: false,
        error: message,
        details: parsed.error.flatten()
      });
    }
    req.validatedBody = parsed.data;
    next();
  };
}

function assertCompanyIdUsable(companyId) {
  if (!companyId || companyId.length < 2) {
    return "Nedostaje ili je nevažeći companyId.";
  }
  if (RESERVED_COMPANY_IDS.has(companyId)) {
    return "companyId je rezervisan.";
  }
  const check = companyIdSlug.safeParse(companyId);
  if (!check.success) {
    return check.error.issues[0]?.message || "Nevalidan companyId.";
  }
  return null;
}

module.exports = {
  validateBody,
  sanitizeCompanyId,
  assertCompanyIdUsable,
  companyStatusBody,
  createCompanyBody,
  deleteCompanyBody,
  createUserBody,
  updateUserGroupsBody,
  companyDispatcherBody,
  companyDispatcherStatusBody,
  companyDispatcherActionBody,
  companyDispatcherDeleteBody,
  companyDispatcherProfileBody,
  companyAdminStatusBody,
  companyProfileSettingsBody,
  companyBrandingBody,
  companyGroupBody,
  companyGroupUpdateBody,
  companyDriverProfileBody,
  companyDriverPersonalCodeBody
};
