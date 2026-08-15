# B2C-01-R1-D1.1 — Server-truth matrix (no new schema)

HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`

## What GET `/api/admin/company/:companyId` can honestly return today

Source: Firestore only (`getCompanyDetail` → `users` where `role == company_admin`).

| Honest state label | Derivable without schema/Auth scan? | Derivation |
|--------------------|-------------------------------------|------------|
| `present_active` | **Yes** | ≥1 admin with `active !== false` |
| `present_inactive` | **Yes** | ≥1 admin and all are `active === false` (or expose list; CTA uses Enable) |
| `missing_firestore_ca` | **Yes** | `admins.length === 0` after successful GET |
| `unknown` | **Yes** | GET fails / 5xx / network — UI must not show Create |

### Labels that must **not** be claimed from GET alone

| Label | Why forbidden |
|-------|----------------|
| `inconsistent` (Auth-only orphan) | Firestore empty does **not** prove Auth orphan exists or not |
| `auth_only_orphan` | Requires Auth directory scan or email probe — not tenant-bounded from detail GET |
| `missing` as “no Auth and no FS” | Overclaim; only FS emptiness is proven |

**Use `missing_firestore_ca`, not bare `missing` / `inconsistent`.**

---

## Auth-only orphan (claims CA, no Firestore user doc)

### Product authorization

| Layer | Requires live Firestore `users/{uid}`? | Auth-only outcome |
|-------|----------------------------------------|-------------------|
| Firestore Rules `isCompanyMember` / `isCompanyAdmin` | **Yes** (`exists(users/uid)` + active) | **No** client data access |
| HTTP `requireCompanyAdmin` / `requireCompanyStaff` | **Yes** (`requireProfile: true` → loadStaffProfile) | **403** “Nalog nije aktivan.” |
| `requireUserProvisioner` | **No** profile | CA actor still **403** on create-user route branch |
| `requireSuperAdmin` | SA role | N/A for orphan CA |

Conclusion: Auth-only company_admin is **not** an authorized staff principal for Rules or tenant APIs. It remains an **Auth identity** (email globally reserved; can obtain ID token).

Safe UI stance without schema:

- Do **not** label detail empty state as proven `inconsistent`.
- Treat empty successful detail as `missing_firestore_ca` for CTA gating **only if** Create path uses transactional FS uniqueness + Auth compensate (still needs write anchor — see concurrency contract).
- Email collision on create → generic 409 (existing privacy-safe behavior).

There is **no** bounded, tenant-safe way to list Auth-only orphans for a company without scanning Auth users or storing a FS pointer.

---

## Firestore-only orphan (user doc, Auth missing)

| Question | Answer |
|----------|--------|
| Visible in GET detail today? | **Yes** as admin row |
| Can detail mark Auth missing without mutation? | **Yes, optionally** — Admin SDK `auth.getUser(uid)` per listed admin (0–few). Not implemented today. |
| Without that probe? | Limitation: UI may offer Reset/Enable; Reset already 404s via provisioning when Auth missing |

Honest enrichment (no schema): `admins[].authPresent: boolean` via getUser — read-only. Still not an Auth-only detector for empty lists.

---

## CTA gating (future R1, contract)

| State | Create missing CA | Other actions |
|-------|-------------------|---------------|
| `present_active` | no | Reset / Disable |
| `present_inactive` | no | Enable / Reset |
| `missing_firestore_ca` | only after successful GET + server mutation guard | — |
| `unknown` | **no** | error banner |
| Suspected Auth-only (unproven) | **no** special CTA; create may 409 on email | ops outside this UI |

---

## Company status vs Create

Mutation (future) must re-check inside tx:

- company root exists  
- `settings/main.status` not `suspended` (and not deleted — delete removes tree)  
- still `missing_firestore_ca` (+ slot if approved)  
- actor Super Admin (middleware)  
- path companyId only  

Middleware ≠ substitute for tx re-check.
