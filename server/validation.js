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

const driverLoginBody = z.object({
  companyId: z.string().trim().min(1).max(64),
  driverId: z.string().trim().min(1).max(128),
  pin: z.string().trim().min(4).max(12)
});

const companyStatusBody = z.object({
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().max(500).optional().nullable()
});

const hashPinBody = z.object({
  pin: z.string().trim().min(4).max(12)
});

const createCompanyBody = z.object({
  companyId: z.string().trim().max(64).optional(),
  name: z.string().trim().min(1).max(200),
  country: z.string().trim().max(64).optional(),
  contactEmail: z.string().trim().email().max(254).optional()
});

const createUserBody = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(128),
  name: z.string().trim().max(200).optional(),
  role: z.enum(["superadmin", "company_admin", "dispatcher"]),
  companyId: z.string().trim().max(64).optional()
}).superRefine((data, ctx) => {
  if (data.role !== "superadmin" && !data.companyId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "companyId je obavezan za ovu ulogu.",
      path: ["companyId"]
    });
  }
});

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
  driverLoginBody,
  companyStatusBody,
  hashPinBody,
  createCompanyBody,
  createUserBody
};
