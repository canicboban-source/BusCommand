# BusCommand — RBAC matrica (uloga × resurs × akcija)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1`  
Izvor: `js/core/ui-permissions.js`, `api-server.js`, `server/driver-routes.js`, `firestore.rules`  
Status: **živ dokument** — opisuje *trenutno* ponašanje, ne željeni krajnji cilj.

**Osveženje 2026-07-26:** vidi `reports/poglavlje-8-2-security-privacy-2026-07-26.md` i `reports/release-readiness-2026-07-26.md` (release gate + legal/owner blokeri). Ovaj fajl ostaje detaljna RBAC tabela; High/Critical preostalo je uglavnom legal/ops, ne novi IDOR iz G1–G7.

Legenda dozvola:

| Oznaka | Značenje |
|--------|----------|
| `Y` | Dozvoljeno i serverom (ili Rules deny + Admin SDK) |
| `R` | Samo čitanje |
| `U` | Samo UI / client Firestore (`saveState`) — **nije pouzdana kontrola** |
| `N` | Zabranjeno |
| `-` | Nije primenljivo |
| `?` | UNKNOWN / delimično |

Tenant scope (podrazumevano): `companies/{companyId}/…` + token `companyId` mora da se poklopi gde postoji `requireOwnCompany` / staff path.

---

## 1. Uloge (kanonska imena)

| UI role | Token / claim | Surface |
|---------|---------------|---------|
| `superadmin` | `superadmin` | `staff.html` |
| `company-admin` | `company_admin` | `staff.html` |
| `dispatcher` | `dispatcher` | `staff.html` |
| `driver` | `driver` | `driver.html` |

UI section gate: `canOpenSection` — prefiksi `company-admin-*`, `superadmin-*`, `dispatcher-*`, `driver-*`.  
`dispatcher-settings` uvek `N`.

---

## 2. Matrica po resursima

### 2.1 Platforma / tenant lifecycle

| Resurs | Akcija | SA | CA | Disp | Driver | Audit | Napomena |
|--------|--------|----|----|------|--------|-------|----------|
| Company list/overview | read | Y | N | N | N | ? | `/api/admin/*` |
| Company create | create | Y | N | N | N | Y | provisioning |
| Company suspend/activate | update | Y | N | N | N | Y | settings status |
| Company hard-close | delete | N | N | N | N | - | MISSING |
| Support session TTL | Y* | N† | N | N | Y | Skeleton; flag OFF; *SA start/end; †CA can end only |
| Feature flags | ? | R | N | N | - | `features.supportSession` default false |

### 2.2 Firma (profile / branding / settings)

| Resurs | Akcija | SA | CA | Disp | Driver | Polja / scope | Audit |
|--------|--------|----|----|------|--------|---------------|-------|
| profile | read | R* | R | R | R? | member read Rules | - |
| profile settings | write | N | Y | N | N | server-only (`write: if false` Rules) | Y |
| branding | write | N | Y | N | N | server-only | Y |
| settings/license | write | Y† | N | N | N | CA vidi read-only licence | Y† |
| CSV export | read/export | N | Y | N | N | bez tajni | Y |

\* SA čita kroz broad Rules (osim credentials).  
† SA status toggle.

### 2.3 Grupe / linije

| Resurs | Akcija | SA | CA | Disp | Driver | Audit |
|--------|--------|----|----|------|--------|-------|
| groups | CRUD | Y* | Y | N† | N | Y (CA API) |
| groups | assign to dispatcher | Y‡ / CA Y | Y | N | N | Y |

\* Rules allow SA write under company except credentials.  
† Disp može čitati operativno; ne kreira grupe.  
‡ Legacy `/api/admin/users/:uid/groups` (SA); CA ima sopstveni endpoint.

### 2.4 Tim dispečera

| Resurs | Akcija | SA | CA | Disp | Driver | Polja zabranjena | Audit |
|--------|--------|----|----|------|--------|------------------|-------|
| dispatcher account | create | Y‡ | Y | N | N | password hash server | Y |
| groups on dispatcher | update | Y‡ | Y | N | N | - | Y |
| activate/deactivate | update | ? | Y | N | N | - | Y |
| revoke sessions | update | ? | Y | N | N | - | Y |
| password / secrets | read | N | N | N | N | nikad plaintext | - |

### 2.5 Vozači (profil vs credentials)

| Resurs | Akcija | SA | CA | Disp | Driver | Polja | Audit |
|--------|--------|----|----|------|--------|-------|-------|
| driver profile | read | R | R | R | own | ime, grupa, telefon, email OK za disp | - |
| driver_credentials | read/write | **N** (Rules) | **N** (client) | **N** | **N** | eid, hashes, OTP — samo Admin SDK | - |
| driver import CSV | create | N | Y | N | N | OTP hash; no plaintext in response | Y |
| resend activation | update | N | Y | N | N | new OTP hash | Y |
| status active/inactive | update | N | Y | N | N | revoke tokens | Y |
| general CRUD / PIN UI | create/update | N | N* | N | N | client sync skip + Rules deny; demo only | - |
| login codes / OTP / hashes | read | N | N | **N** | N | CA import preview may show company_code before confirm — not login OTP | - |
| public driver list | read | - | - | - | - | **410** `PUBLIC_DRIVER_DIRECTORY_DISABLED` | identify-by-EID only |

\* CA mutacije samo kroz import/status/resend Admin SDK; nema client profile edit API.

### 2.6 Aktivacija / prijava vozača

| Resurs | Akcija | Ko | Server | Audit |
|--------|--------|-----|--------|-------|
| identify by EID | public | rate-limited | Y | fail closed |
| login OTP / personal code | public | rate-limited | Y | login success/fail |
| set personal code | pending driver | Y | Y | personal_code_activated |
| activate-company-code | - | **410** | - | removed |

### 2.7 Katalog smena (service plans)

| Resurs | Akcija | SA | CA | Disp | Driver | Audit |
|--------|--------|----|----|------|--------|-------|
| preview/publish/history | write/read | N | Y | N* | N | Y |
| active catalog | read | N | Y | Y† | N | - |
| Rules write | - | - | **false** | **false** | - | server-only |

\* Disp ne publish-uje.  
† `requireCompanyStaff` + group claim za active.

### 2.8 Operativni roster (shifts / schedules)

| Resurs | Akcija | SA | CA | Disp | Driver | Server API | Client bypass |
|--------|--------|----|----|------|--------|------------|---------------|
| day assignment | write | N | N | Y | N | `PUT …/shifts/assignment` + `expectedRevision` + group ACL | daily + monthly day-edit → `persistShift` |
| monthly schedules | write | N | N | Y* | N | mirror u istoj transakciji kao assignment | *empty plan / CA import još mogu biti U |
| shift confirm | write | N | N | N | Y | `POST …/shift-confirmations` | - |
| read own shifts | read | - | R | R | Y (window) | - | - |
| optimistic concurrency | - | - | - | **Y** | - | `REVISION_CONFLICT` 409 | - |

### 2.9 Poruke

| Resurs | Akcija | SA | CA | Disp | Driver | Server | Bypass |
|--------|--------|----|----|------|--------|--------|--------|
| send message | create | N | Y | Y | N | `POST /api/staff/messages` + group ACL | demo `saveState` only |
| mark read / archive | update | N | N | N | Y | driver APIs | - |
| dispatcher archive | update | N | U | U | N | client update (`dispArchivedBy`) | soft-archive only |
| Rules create | - | - | **deny** | **deny** | - | Admin SDK only | - |

### 2.10 Prijave / SOS / lost / vacation

| Resurs | Akcija | Disp | CA | Driver | Server |
|--------|--------|------|----|--------|--------|
| quick report | create | R | R | Y | Y (+ work policy) |
| resolve report | update | Y | N | N | Y (dispatcher + group) |
| SOS create | create | - | - | Y | Y |
| SOS resolve | update | Y | N | N | Y (dispatcher) |
| lost item create | create | R | R | Y | Y |
| lost item status | update | Y | Y* | N | Y (returned + group ACL) |
| vacation request | create | R | R | Y | Y |
| vacation approve | update | Y | Y* | N | Y (staff) |

\* lost-item: CA može bez group ACL; vacation staff middleware — i CA i disp.

### 2.11 GPS / mapa

| Resurs | Akcija | Disp | Driver | Server | Napomena |
|--------|--------|------|--------|--------|----------|
| live map view | read | U | - | N audit | **simulacija** `live-map-core` |
| GPS write | write | - | session only | N | `gps-track` → sessionStorage, ne Firestore |
| buses/routes write | write | demo U | N | N | Rules deny; sync skip |
| map access audit | - | N | N | MISSING | legal L1 |

### 2.12 Audit log

| Resurs | Akcija | SA | CA | Disp | Driver |
|--------|--------|----|----|------|--------|
| tenant audit list | read | ? | Y | N | N |
| append audit | write | Y* | Y* | Y* | Y* |

\* preko server `logAudit` na pokrivenim rutama; client `state-sync` je samo 202 echo.

---

## 3. Field-level (kritično)

| Polje | SA | CA | Disp | Driver | Gde živi |
|-------|----|----|------|--------|----------|
| `loginCodeHash` / OTP hash | N | N | N | N (client) | `driver_credentials` deny-all |
| `eid` | N client | server import | N | N | credentials |
| personal login code plaintext | N | N | N | transient UI only | never stored |
| driver phone/email | R | R | R | own | profile |
| company_code (CSV) | - | import only | N | N | hashed as companyCodeHash; **not** login after OTP era |

---

## 4. UI-only / bypass rizici (prioritet)

| ID | Problem | Prioritet | Predloženi smer |
|----|---------|-----------|-----------------|
| G1 | Staff poruke samo kroz Rules/`saveState` | **Closed** | `POST /api/staff/messages` + audit; Rules `create: false` |
| G2 | Mesečni plan/`schedules` bez server API | **Mitigated** | Day-edit → assignment + schedule mirror; CA import/empty plan još odvojeno |
| G3 | `drivers.js` CRUD/PIN u produkciji kroz client | **Closed** | sync skip + Rules deny create/delete; demo CRUD ostaje |
| G4 | Lost-item status / SOS resolve bez staff API | **Closed** | `PUT …/sos/resolve` + `PUT …/lost-items/:id/status` |
| G5 | Public driver list bez auth | **Closed** | GET directory → 410; login EID identify |
| G6 | Buses/routes/GPS client writes | **Closed** | Sync skip + Rules deny; demo mutators; mapa simulacija |
| G7 | Nema optimistic concurrency na shift write | **Closed** | `expectedRevision` + `REVISION_CONFLICT` (409) |

---

## 5. Pokrivenost po slojevima (sažetak)

| Sloj | Stanje |
|------|--------|
| UI section RBAC | DONE (prefiksi) |
| CA mutacije (profile, branding, groups, team, plans, export, driver import) | DONE server-owned |
| Driver operativni write (report/SOS/lost/vacation/confirm/messages read) | DONE + work-policy |
| Dispatcher day assignment + report resolve | DONE + group ACL + revision |
| Dispatcher messages / monthly bulk / lost status | **PARTIAL** — send DONE; disp archive/lost još client |
| Super Admin full platform | PARTIAL |
| Formalna matrica (ovaj fajl) | **DONE** (živi dokument) |

---

## 6. Sledeći implementacioni koraci (iz matrice)

1. ~~Zatvoriti **G2/G7**~~ → day-edit + concurrency DONE; ostaje CA import/empty plan path.  
2. ~~Staff **message API** (G1)~~ → DONE; ostaje dispatcher archive API.  
3. ~~Ugasiti produkcione client write putanje za `drivers` (G3)~~ → DONE; ostaje single-driver edit / group reassignment API.  
4. ~~SOS / lost-item staff resolve (G4)~~ → DONE.  
5. ~~Public driver list (G5)~~ → DONE (410 + EID login).  
6. ~~G6 buses/routes/GPS~~ → DONE (client lock; no fleet API by design).  
7. SA support session (legal L7) → **skeleton shipped** (flag OFF by default). See `reports/l7-support-session-decisions-2026-07-24.md`.

Ocena spremnosti RBAC artefakta: **8/10** (dokument postoji i vezan za kod; enforcement još nije 100% server-side).
