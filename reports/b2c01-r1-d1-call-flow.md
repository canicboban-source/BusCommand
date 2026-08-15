# B2C-01-R1-D1 — Call flow (read-only)

Workspace: `C:\Users\cane\Desktop\BusCommand-ca-monthly-import`  
HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`

## 1. SA Companies table (production)

```
renderSuperAdminDashboardProduction()
  ├─ ApiClient.getCompanies()           → GET  /api/admin/companies          (requireSuperAdmin)
  ├─ ApiClient.getSuperAdminOverview()  → GET  /api/admin/overview           (requireSuperAdmin)
  └─ ApiClient.getCompanyAdmins()       → GET  /api/admin/company-admins     (requireSuperAdmin)
         └─ listAllCompanyAdmins({ db })
              • for each companies/* doc
              • users where role == "company_admin"
              • returns { id, name, email, companyId, active, createdAt }
```

**Admin cell truth today**

- Joins `companies[]` with `window.state.companyAdmins` (from GET company-admins on success).
- Active CA: first `admins.find(a => a.companyId === c.id && a.active !== false)`.
- Empty → UI string `sa_no_company_admins` (“No company admins created”).
- If GET company-admins **fails**, code keeps prior `window.state.companyAdmins` if any, else `[]` — **not** an authoritative “unknown” state. Risk: false empty or stale list.

Does **not** distinguish: inactive-only CA, Auth-only orphan, Firestore-only orphan, API unknown.

## 2. Manage account modal

```
superadminOpenCompanyDetail(companyId)
  └─ ApiClient.getCompanyDetail(id) → GET /api/admin/company/:companyId (requireSuperAdmin)
         └─ getCompanyDetail({ db, companyId })
              • companies/{id} must exist else company-not-found
              • loads profile/settings/support + users/*
              • admins = users.filter(role == company_admin) → { id, email, name, active, createdAt }
              • counts.companyAdmins = admins.length
  └─ fillCompanyDetailModal(company)
         └─ renderCompanyDetailAdmins(company)
              • admins.length === 0 → text sa_detail_no_admins only (NO create CTA)
              • else → Reset password + Enable/Disable per admin
```

`companyId` for the open modal is held in module `_pendingDetailCompanyId` (from table row / action args), not from an editable free-text field in the admin list.

## 3. Create-user path (existing)

```
ApiClient.createUser({ email, password, name, role, companyId, groups? })
  → POST /api/admin/create-user
       rateLimit(20 / 5min)
       requireUserProvisioner   // claims roles: superadmin | company_admin (no tenant profile required)
       validateBody(createUserBody)  // role ∈ {company_admin, dispatcher}; password letter+digit; companyId required
       if actor.role === company_admin → 403 (must use CA dispatcher endpoint)
       provisionUser({ db, admin, email, password, name, role, companyId, groups, actorId })
```

### provisionUser (server/provisioning.js)

1. Role / companyId guards (`company-not-found` before Auth if company missing).
2. `admin.auth().createUser({ email, password, displayName })`.
3. `setCustomUserClaims` (`role`, `companyId` for staff, `name`, …).
4. Firestore transaction: set `companies/{companyId}/users/{uid}` + `audit_log` `user_created`.
5. On failure after Auth user exists: delete Firestore user doc (if any) + `auth.deleteUser` (compensation). If cleanup fails → `compensation-failed`.

**Not present today**

- No check “company already has a company_admin (active or inactive)”.
- No Auth↔Firestore consistency probe for R1.
- No single-CA uniqueness under concurrency (two parallel succeeds → two CA docs possible).

### Authz summary

| Actor | create-user company_admin | Notes |
|-------|----------------------------|-------|
| superadmin | allowed | claims-based provisioner |
| company_admin | 403 | blocked at route |
| others | 401/403 via authenticate | |

### Error surface (privacy-relevant)

| Condition | HTTP | Body |
|-----------|------|------|
| company missing | 404 | generic company-not-found message |
| email exists (Auth) | 409 | `"Email već postoji."` — **no companyId / other-tenant leak** |
| role/company rules | 400 | validation messages |
| other | 500 | generic create failure |

## 4. Refresh recovery gap (R1 symptom)

```
page refresh
  → in-memory saCreateFlow (COMPANY_CREATED_CA_PENDING) gone
  → Manage account shows admins=[] text only
  → no Create company admin action
  → createCompany must NOT be re-invoked (correct constraint)
  → only recovery today: full create-company modal flow (wrong — would try new company)
```

## 5. Recommended future call flow (not implemented)

```
GET /api/admin/company/:companyId
  → server returns admins + derived caProvisionState
       missing | present_active | present_inactive | inconsistent | unknown

[only if caProvisionState === missing && company operable]
  POST /api/admin/company/:companyId/create-missing-admin   (Option B)
       requireSuperAdmin
       companyId from path only (ignore/forbid mismatched body)
       transactional: zero company_admin docs → Auth+Firestore+audit
       fail-closed if any CA doc exists
  → refresh GET company detail + companies table
```
