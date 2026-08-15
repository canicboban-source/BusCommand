# B2C-01-R1-D1.1 — Concurrency contract (read-only)

HEAD: `b1d057a74e5fc7a55ba55e3bcb6720372871631f`

## 1. Existing company root shape

`createCompanyAtomic` writes company root as:

```js
{ name, slug: companyId, companyId, status: "active", createdAt }
```

Also always creates singletons: `profile/main`, `branding/main`, `settings/main`, `settings/sos`.

| Candidate anchor | Exists today? | Legitimate mutate for CA create? |
|------------------|---------------|----------------------------------|
| `companies/{id}` `updatedAt` / `revision` | **No** | n/a |
| `companies/{id}.status` | Yes (`active`) | **No** — license/suspend truth lives in `settings/main` |
| `companies/{id}.name` | Yes | **No** — rename/profile race; not a provision lock |
| `settings/main` license/status fields | Yes | **No** for CA slot — concurrent SA license edits |
| `settings/main.updatedAt` | **Not present** on create | Would be a **new field** (soft schema) |
| `ops/*` guard doc | ops tree exists; **no CA slot doc** | New doc path = **new schema** |
| `users/{uid}` alone | Yes | Different UIDs → **no write conflict** |

## 2. Why empty CA query is not a uniqueness lock

Firestore transactions serialize only on **overlapping document reads/writes**.

Two parallel provision attempts with different emails:

1. Both `createUser` in Auth → both succeed (Auth outside Firestore).
2. Both transactions: query `users where role==company_admin` → empty.
3. Both `set(users/{uidA})` and `set(users/{uidB})` → **both commit**.
4. Result: **two** Firestore CAs. No retry forced.

Therefore: “read empty query then insert” **without** a shared write target does **not** guarantee fail-closed uniqueness.

## 3. What would make two transactions fail-closed

Both transactions must **write the same document** (or one reads a write the other committed on retry):

- Minimal new singleton, e.g. `companies/{companyId}/ops/company_admin_slot`
- Or an approved new field on an existing singleton used only as conflict epoch

Without that: **no safe no-schema Option B concurrency**.

## 4. Auth → Firestore order (if schema guard approved later)

Firebase Auth is **not** atomic with Firestore.

```
1) Middleware: requireSuperAdmin (or shared provisioner + SA-only for CA)
2) Path companyId only (body companyId ignored / must match)
3) Auth.createUser(email, password)     // outside tx
4) setCustomUserClaims(...)             // outside tx
5) Firestore transaction:
     - get(companyRef) exists
     - get(settings/main) operable (not suspended/deleted per product rule)
     - get(slotRef) OR query CAs + write slot
     - if any company_admin (active|inactive) OR slot claimed → abort CA_EXISTS
     - set users/{uid}
     - set/update slot anchor
     - set audit_log success
6) Return 201
```

### Failure table

| Step fails | Behavior | Retry? | Auth UID | Password | Success toast |
|------------|----------|--------|----------|----------|---------------|
| 3 Auth create (email exists) | 409 generic email | no (same email) | none new | discarded | no |
| 4 claims fail | delete Auth user (compensate) | yes if still missing | must be deleted | discarded | no |
| 5 tx abort CA_EXISTS (loser) | **mandatory** `auth.deleteUser(uid)` | no for create | loser deleted; prove via getUser → user-not-found | discarded | no |
| 5 tx other fail | compensate Auth delete | careful yes after re-GET | deleted | discarded | no |
| compensate Auth delete fails | `compensation_failed` — **no** success; ops alert | limited | may orphan Auth | discarded | **no** |
| 6 after commit | success | no | keep | discarded | yes |

**Loser Auth proof:** after compensate, `admin.auth().getUser(loserUid)` → `auth/user-not-found` (emulator assertion).  
**Password:** only in request memory for Auth.createUser; never audit/storage/toast; never reused after compensate.  
**Fake success:** HTTP 201 only after tx commit; client must not toast on timeout without re-GET.

## 5. Bypass closure (choose one — design only)

For every production path that can mint `role=company_admin`:

| Path | Today |
|------|-------|
| `POST /api/admin/create-user` | SA can create CA with **no** missing-only guard |
| SA create-company flow follow-up | calls `ApiClient.createUser` |
| `js/admin/index.legacy.js` | still has `createUser(... company_admin)` |
| Demo/local | in-memory only (`USE_LOCAL_STATE`) — not production Auth |

**Chosen design: B** — one internal guarded provisioner (`provisionCompanyAdminMissingOnly`); both generic `create-user` (when role=company_admin) and any future dedicated route call it.  
Rejecting company_admin on create-user alone (A) without moving the create-company follow-up would break F1 flow — so A only if both UIs migrate. **B closes bypass without leaving create-user open.**

Demo/local remains separate and must not call production Auth.

## 6. Company status re-check

| Check | Where |
|-------|--------|
| Actor is Super Admin | Middleware (token), every request |
| companyId from path only | Route parse; body companyId not authoritative |
| Company exists | **Inside** Firestore transaction (`get(companyRef)`) |
| Not suspended / not operable | **Inside** tx via `settings/main` (same source as license gates) |
| CA still missing (+ slot) | **Inside** tx |
| Session still valid | Middleware verifyIdToken(checkRevoked) |

## 7. Audit

| Outcome | Audit |
|---------|-------|
| Winner | exactly one success (`user_created` acceptable if details omit password; or dedicated action string without new collection) |
| Loser tx | **no** success audit |
| compensation_failed | error log + optional audit `user_provision_compensation_failed` with `{ uid, companyId }` — **no password, no peer emails** |

## 8. Future emulator concurrency proof (must pass before R1 ship)

Two parallel POSTs, **different emails**, same companyId, empty CA:

- 1× HTTP 201, 1× 409 `CA_EXISTS` (or equivalent fail-closed)
- exactly 1 Firestore `company_admin`
- exactly 1 surviving Auth UID; loser `getUser` → not found
- exactly 1 success audit
- company root/settings remain valid per schema
- no client-side blind retry in test
- generic `create-user` with `role=company_admin` hits **same** guard (second CA rejected)
