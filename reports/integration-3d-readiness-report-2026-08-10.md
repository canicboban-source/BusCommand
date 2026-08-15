# Integration Checkpoint 3D — Staging Deploy Readiness (READ-ONLY)

**Datum:** 2026-08-10  
**Režim:** read-only pregled + plan (ništa nije deployovano)  
**Verdict staging isolation:** **RED** — staging deploy **nije** spreman za izvršenje.

---

## 1) Checkpoint / remote / main identitet

| Stavka | Vrednost | Match |
|--------|----------|-------|
| Repo path | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import` | OK |
| Local branch | `checkpoint/phases-0-3-d2421a1` | OK |
| Local HEAD | `d087d67ede7c36761ae52dd213bfbd787444eb81` | OK |
| Remote checkpoint SHA | `d087d67ede7c36761ae52dd213bfbd787444eb81` | OK |
| Remote main SHA | `1875d015586f5ddb981591fc9974daa23805b4f7` | OK |
| PR from checkpoint | none (`[]`) | OK |
| Gate 3C | PASS · RUN_ID `31410530175` | OK |
| Dirty tree | retained (reports evidence; not cleaned) | OK |

Preflight SHA uslovi ispunjeni — nastavljen read-only rad.

---

## 2) Deploy topologija

| Komponenta | Postoji? | Gde se hostuje (dokaz) | Deploy control files |
|------------|----------|------------------------|----------------------|
| Frontend/staff/driver UI | DA | Isti Node web servis služi `dist/` (`api-server.js` → `express.static`) | `package.json` `build`/`start`, Vite, `render.yaml` |
| API/server | DA | Render web service (Blueprint: `buscommand-preview`) | `api-server.js`, `render.yaml`, `package.json` |
| Firestore Rules | DA | Firebase project `buscommand-preview` | `firestore.rules`, `firebase.json`, `.firebaserc` |
| Firestore indexes | DA (minimal) | Isto Firebase project | `firestore.indexes.json` |
| Firebase Hosting | **NE** | `firebase.json` nema `hosting` bloka; `firebase target` prazan | — |
| Storage rules | **NE** | `storage.rules` odsutan | — |
| Render cron | DA (Blueprint) | `buscommand-confirm-dispatch` → URL ka `buscommand.com` | `render.yaml` |
| GitHub auto-deploy | **NE** | Jedini workflow: `integrated-qa.yml` (QA only; push trigger samo `preview/dispatcher-cockpit-qa`) | `.github/workflows/integrated-qa.yml` |

### Hosting model (zaključak)

- **Nema odvojenog frontend hosting targeta** (nema Firebase Hosting / Vercel / Netlify).
- Frontend + API = **jedan** Render web process (`npm run build` → `npm start`).
- Firestore Auth/data plane = Firebase project **`buscommand-preview`** (jedini projekat vidljiv CLI nalogu).
- Custom domain `buscommand.com` / `www.buscommand.com` je istorijski live surface (prior deploy report 2026-08-08); **nije** poseban katalog u `firebase.json`.

### Automatski deploy trigger

| Trigger | Status |
|---------|--------|
| GitHub Actions deploy | **NE postoji** |
| `integrated-qa.yml` push | samo `preview/dispatcher-cockpit-qa` — **ne** checkpoint |
| Render Blueprint `branch` | **`main`** za web + cron |
| Checkpoint auto-deploy | **NE** (zahteva dashboard/manual ili promenu branch binding-a) |

### Planirani redosled zavisnosti (NOT EXECUTED)

1. Server/API (+ ugrađeni frontend build) na **izolovanom** staging Render servisu  
2. Firestore Rules (+ indexes ako potrebno) na **izolovanom** Firebase staging project-u  
3. Auth authorized domains / CORS usklađivanje  
4. Synthetic smoke → owner live test  
5. Tek onda eventualni production put (van ovog checkpoint-a)

---

## 3) Staging isolation verdict: **RED**

### Per-target matrix

| Target | ID/name | Staging vs prod | Git branch | Auto-deploy | Region | API/origin | Firebase project | Auth domains | CORS | Firestore | Prod data risk |
|--------|---------|-----------------|------------|-------------|--------|------------|------------------|--------------|------|-----------|----------------|
| Render web (Blueprint) | `buscommand-preview` | **AMBIGUOUS** (name=preview; CORS+cron mešaju prod) | **`main`** (yaml) | **UNKNOWN** (dashboard) | frankfurt (yaml) | `https://buscommand-preview.onrender.com` — **live GET 404** | `buscommand-preview` (yaml VITE_*) | **UNKNOWN** (Auth console) | yaml + hardcoded includes prod + preview origins | same project as client config | **HIGH** if live tenants share project |
| Render cron | `buscommand-confirm-dispatch` | points at **prod URL** in yaml | `main` | **UNKNOWN** | frankfurt | `CONFIRMATION_DISPATCH_URL` → `https://buscommand.com/...` | n/a | n/a | n/a | n/a | **HIGH** if enabled against prod |
| Firebase | `buscommand-preview` (current) | Only project listed; soft-pilot / also used historically by live domain | n/a | manual CLI | [Not specified] | client expects this project ID | **`buscommand-preview`** | **UNKNOWN** | n/a | Rules/indexes target this | **HIGH** — no separate staging project visible |
| Firebase Hosting | — | MISSING | — | — | — | — | — | — | — | — | n/a |
| GitHub Actions | Integrated QA | CI only | checkpoint dispatch OK | no deploy | GitHub-hosted | n/a | emulator project id in tests | n/a | n/a | emulator | none |

### Env presence (names only — no values)

| Name | Presence | Source |
|------|----------|--------|
| `NODE_ENV` | PRESENT (declared) | `render.yaml` |
| `NODE_VERSION` | PRESENT (declared `"22"`) | `render.yaml` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | UNKNOWN (sync:false) | `render.yaml` / dashboard |
| `CONFIRMATION_JOB_SECRET` | UNKNOWN (sync:false) | `render.yaml` / dashboard |
| `VITE_FIREBASE_API_KEY` | PRESENT (declared in yaml/example) | `render.yaml`, `.env.example` |
| `VITE_FIREBASE_AUTH_DOMAIN` | PRESENT | `render.yaml`, `.env.example` |
| `VITE_FIREBASE_PROJECT_ID` | PRESENT (`buscommand-preview`) | `render.yaml`, `.env.example`, code |
| `VITE_FIREBASE_STORAGE_BUCKET` | PRESENT | `render.yaml`, `.env.example` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | PRESENT | `render.yaml`, `.env.example` |
| `VITE_FIREBASE_APP_ID` | PRESENT | `render.yaml`, `.env.example` |
| `CORS_ORIGINS` | PRESENT (declared) | `render.yaml`, `.env.example` |
| `CONFIRMATION_DISPATCH_URL` | PRESENT (prod URL in yaml) | `render.yaml` |
| `APP_PUBLIC_URL` | PRESENT in example (prod domain) | `.env.example` |
| `SMS_PROVIDER` / SMS keys | UNKNOWN on host | `.env.example` / dashboard |
| Local `.env` file | PRESENT (exists) | filesystem `Test-Path` only — **values not read** |
| `firebase-admin-key.json` | MISSING in tree | filesystem |

### Isolation blockers (why RED)

1. **Live preview origin 404** for `/`, `/staff.html`, `/api/health`, `/api/config` — staging URL **nije** operativno potvrđen.  
2. **Render Blueprint vezan na `main`**, ne na `checkpoint/phases-0-3-d2421a1`.  
3. **Samo jedan Firebase project** vidljiv CLI-ju (`buscommand-preview`); nema dokazanog odvojenog staging projekta (docs O1 i dalje otvoren).  
4. **CORS i cron Blueprint mešaju production domen** (`buscommand.com`).  
5. Render dashboard autoDeploy / secret presence / Auth authorized domains = **UNVERIFIED — AUTH REQUIRED** (Render CLI missing; browser GitHub/Firebase private = unauthenticated).  
6. Po pravilu zadatka: **ne proglašavati staging spremnim** dok target/branch/env ostanu UNKNOWN.

---

## 4) Firebase readiness

| Check | Result |
|-------|--------|
| Staging alias/ID | `.firebaserc` default = `buscommand-preview`; CLI current = same |
| Separate staging project | **MISSING** in `firebase projects:list` (1 project total) |
| Hosting in `firebase.json` | **NO** |
| Rules deploy target | would be `buscommand-preview` if `--project` omitted/default |
| Indexes | only `shifts(driverId, date)`; **no new composite index** evident for `ops/driver_identity_guard` (direct doc get) |
| Storage config | **MISSING** |
| Emulator isolation | emulators in `firebase.json` (127.0.0.1:8080/9099); rules tests use project id `buscommand-preview` under emulator |
| Wrong `--project` risk | **HIGH** — single project + live domain history ⇒ Rules deploy affects the only data plane |

### D24.2 `driver_identity_guard`

| Question | Answer |
|----------|--------|
| Path | `companies/{companyId}/ops/driver_identity_guard` |
| Fields | `revision`, `updatedAt` only |
| Needs schema migration batch? | **NO** — created/bumped on first server write (`revision` starts 0 if absent) |
| Extra deploy step beyond Rules + server? | **NO** dedicated migration; server code creates doc lazily |
| Browser access | deny via `ops/*` Rules |
| Backward compatible? | Mostly yes for readers; writers must use new server paths |
| Credential dirty migration (D24.1.1 future) | **NOT** required for this checkpoint freeze; still a later rollout item |

**Firebase staging deploy readiness:** **NOT READY** without owner-confirmed isolated project **or** explicit acceptance that `buscommand-preview` is the shared soft-pilot data plane.

---

## 5) Render / server readiness

| Check | Result |
|-------|--------|
| Service (yaml) | `buscommand-preview` (web), `buscommand-confirm-dispatch` (cron) |
| Environment | **UNVERIFIED — AUTH REQUIRED** (dashboard) |
| Repo/branch (yaml) | GitHub BusCommand · branch **`main`** |
| AutoDeploy | **UNKNOWN** (dashboard; yaml implies branch-linked service) |
| Build/start | `npm ci --include=dev && npm run build && npm prune --omit=dev` / `npm start` |
| Health path | `/api/health` |
| Region | frankfurt |
| Runtime | Node 22 |
| Staging URL live | **FAIL** — HTTP 404 on preview origin |
| Rollback | Render deploy history **UNKNOWN** without dashboard |
| Deploy checkpoint without changing main? | **Possible only via manual “deploy specific commit/branch” in dashboard** (owner action) — **NOT** via current Blueprint branch field |

**Render staging readiness:** **NOT READY** (URL down/missing + branch binding ≠ checkpoint + dashboard UNVERIFIED).

---

## 6) Data / schema rizici

| Change | Schema migration? | Backward compatible? | Reversible? | Synthetic tenant first? | Rollback consequence |
|--------|-------------------|----------------------|-------------|-------------------------|----------------------|
| Firestore Rules (D24.x privacy/ops deny, SA scope) | No (rules-only) | Mostly; may break clients relying on broader browser reads | Redeploy prior rules file | **YES — mandatory** | Temporary restore of wider browser reads if old rules restored |
| `ops/driver_identity_guard` doc | Lazy create; no batch | Yes for existing tenants until first create/import | Delete guard doc possible but risky mid-flight | **YES** | Loses revision fencing until recreated |
| `monthly_plan_imports` / `monthly_plan_import_locks` | App-level docs; no index migration found | Yes if old clients ignore | Locks/jobs can be cleared carefully | **YES** | In-flight imports may fail/compensate |
| Driver credentials/profile split + EID uniqueness | No mass migration in D24.2.1-A; legacy `companyCodeHash` retained server-side | Import path ignores CSV company_code | Code rollback; data remains | **YES** | Old import semantics return only after code rollback |
| Duty catalog assignment guards | Logic in server; no new global schema | Fail-closed tighter | Code rollback | **YES** | Assignments may succeed that new guards block |
| Credential dirty migration (future D24.1.1) | **YES later** — not this freeze | N/A now | N/A now | YES | Out of scope for 3D deploy |

**Do not create real docs or read PII in this gate.**

---

## 7) NOT EXECUTED deploy redosled (predlog)

> Sve komande su **NOT EXECUTED**. Nijedna ne sme ići na production bez eksplicitnog environment/`--project` targeta koji owner potvrdi.

### 1. Pre-deploy snapshot/provere (NOT EXECUTED)
- Potvrdi checkpoint SHA `d087d67ede7c36761ae52dd213bfbd787444eb81`
- Potvrdi main i dalje `1875d015586f5ddb981591fc9974daa23805b4f7`
- Owner potvrdi **izolovani** Render service + Firebase project IDs
- Export/snapshot Rules from target project (console/CLI read-only)
- Confirm synthetic tenant IDs only

### 2. Checkpoint SHA pin
- Deploy artifact = `d087d67ede7c36761ae52dd213bfbd787444eb81` only

### 3. Server/API (+ frontend build) deploy — **staging service only** (NOT EXECUTED)
```text
# NOT EXECUTED — requires owner-approved STAGING Render service ID/name
# Manual dashboard: Deploy commit d087d67… to STAGING service
# OR (only if staging service branch explicitly set to checkpoint): push already done
```

### 4. Rules/indexes — **staging Firebase only** (NOT EXECUTED)
```text
# NOT EXECUTED
# firebase deploy --only firestore:rules --project <OWNER_CONFIRMED_STAGING_PROJECT_ID>
# firebase deploy --only firestore:indexes --project <OWNER_CONFIRMED_STAGING_PROJECT_ID>
# FORBIDDEN without explicit staging project ID ≠ unintended production data plane
```

### 5. Frontend
- Covered by Render web build (`dist/`); no separate Hosting deploy exists

### 6–7. Synthetic smoke → owner live test
- See §9

### 8–9. Rollback criteria / order
- See §8

---

## 8) Rollback plan (NOT EXECUTED)

**Kriterijumi za rollback**
- Auth/role boundary break
- Cross-tenant read/write signal
- Import commit corruption / unrecoverable locks
- Assignment hard-fail false positives blocking operations
- Health failing / blank staff shell / missing lazy plan-import chunk

**Redosled**
1. Rollback Render staging deploy to previous successful deploy (dashboard) — NOT EXECUTED  
2. Redeploy previous known-good `firestore.rules` to **same staging project only** — NOT EXECUTED  
3. Clear synthetic import locks/jobs for test tenant only — NOT EXECUTED  
4. Do **not** touch main / production custom domain unless owner explicitly orders a separate production incident response  

---

## 9) Minimalni staging smoke plan (synthetic only)

| # | Actor | Action | Expected | Proof | Cleanup |
|---|-------|--------|----------|-------|---------|
| 1 | Driver / CA / Dispo / SA | Login on staging origin | Role-correct shell; no cross-role menus | Screenshot role home (no PII) | Sign out; revoke test sessions |
| 2 | CA | Create driver + duplicate EID + maxDrivers | Create OK; EID_EXISTS; capacity deny | API code + UI toast | Soft-delete/retire synthetic drivers |
| 3 | Dispo | Monthly import preview → commit | Job completes; days applied | Import job doc status + UI | Clear month plan / locks for test group |
| 4 | Dispo×2 | Concurrent import / retry / recovery | One winner; no orphan shifts; recovery path | Job statuses | Clear locks + compensate leftovers |
| 5 | Dispo | Bus/duty/driver assignment guards | Hard-fail codes for invalid bus/duty/inactive | Toast/API code | Revert test shifts |
| 6 | SA | Manage account | Allowed SA-only; CA denied | UI + API 403 | None beyond session |
| 7 | Support session | Open/close support | Scoped access; audit entry | Audit event id | End support session |
| 8 | Attacker tenant B | Rules cross-tenant read | Deny | Rules/emulator or staged denied read | None |
| 9 | Dispo/SA browser | EID/privacy deny on credentials/ops | Deny browser read of credentials/ops | Denied read proof | None |
| 10 | Dispo | Lazy plan-import recovery | Chunk loads after failure/retry | Network: `plan-import-*.js` | None |
| 11 | Mobile+desktop | Key CTAs (import, create driver) | CTA visible/usable | Viewport screenshots | Same as above cleanups |

---

## 10) Tačne blokade

1. Preview origin `buscommand-preview.onrender.com` → **404** (service missing/suspended/renamed).  
2. Render Blueprint branch = **`main`**, not checkpoint.  
3. No dedicated Firebase staging project (O1 open; CLI lists only `buscommand-preview`).  
4. No Firebase Hosting target.  
5. Render CLI missing; dashboard fields UNKNOWN.  
6. Browser GitHub/Firebase consoles unauthenticated → screenshots unavailable.  
7. Cron Blueprint targets `buscommand.com` internal job URL.  
8. Shared CORS allowlist includes production domains in server defaults + yaml.  
9. Cannot claim GREEN/AMBER readiness while branch binding + env secret presence + Auth domains remain UNKNOWN.

---

## 11) Owner odluke pre bilo kakvog deploya

1. **Izolacija:** Da li je `buscommand-preview` prihvaćen shared soft-pilot data plane, ili se pravi **novi** Firebase staging project?  
2. **Render:** Koji tačan staging service prima checkpoint `d087d67…`? Da li se kreira novi service ili privremeno prebacuje branch (ne preporučeno na postojećem prod-like servisu)?  
3. **Preview URL 404:** Da li je servis obrisan/suspendovan? Koji je kanonski staging URL?  
4. **Cron:** Mora biti disabled ili retargetovan sa production `buscommand.com` URL-a za staging.  
5. **Auth authorized domains:** Dodati samo staging origin; potvrditi listu.  
6. **Secrets presence:** Potvrda `FIREBASE_SERVICE_ACCOUNT_JSON` + `CONFIRMATION_JOB_SECRET` na staging servisu (PRESENT/MISSING) bez deljenja vrednosti.  
7. **Synthetic tenant IDs** odobreni za smoke.  
8. Eksplicitna naredba za **3E deploy** (ova 3D naredba to ne daje).

---

## 12) Read-only komande / API pozivi korišćeni

```text
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git branch -vv
gh api repos/canicboban-source/BusCommand/git/ref/heads/checkpoint/phases-0-3-d2421a1
gh api repos/canicboban-source/BusCommand/git/ref/heads/main
gh pr list --repo canicboban-source/BusCommand --head checkpoint/phases-0-3-d2421a1
gh api repos/canicboban-source/BusCommand/actions/workflows
gh run list --repo canicboban-source/BusCommand --limit 5
firebase --version
firebase projects:list
firebase target
Test-Path storage.rules .env .env.example firebase-admin-key.json dist render.yaml ...
Invoke-WebRequest https://buscommand-preview.onrender.com/api/health
Invoke-WebRequest https://buscommand-preview.onrender.com/api/config
Invoke-WebRequest https://buscommand-preview.onrender.com/
Invoke-WebRequest https://buscommand-preview.onrender.com/staff.html
# File reads: firebase.json .firebaserc render.yaml package.json firestore.indexes.json
#             .env.example js/core/firebase-web-config.js docs/decisions.md
#             server/driver-identity-guard.js reports/deploy-phase1-2-live-2026-08-08.md
# Browser navigate (unauthenticated): GitHub tree URL → 404/Sign in
```

**NOT used:** `firebase use` (avoid active project file mutation), `firebase deploy`, Render deploy/restart, workflow_dispatch, git write, production domain live probe in final pass.

---

## 13) Potvrde

- no source/config/Rules/test changes  
- no commit / push / PR / merge / tag  
- no deploy (Firebase/Render/Hosting)  
- no workflow dispatch / rerun  
- no Phase 4  
- no secret values printed  
- dirty tree not cleaned  
- checkpoint SHA unchanged: `d087d67ede7c36761ae52dd213bfbd787444eb81`  
- main unchanged: `1875d015586f5ddb981591fc9974daa23805b4f7`

### Visual evidence

| Item | Status |
|------|--------|
| GitHub branch/SHA screenshot | **unavailable** — private repo, browser unauthenticated (404/Sign in) |
| Firebase staging identity screenshot | **unavailable** — console not opened; CLI list saved instead |
| Render staging identity screenshot | **unavailable** — Render CLI missing; preview URL 404 |
| CLI identity proof | `reports/integration-3d-readiness-logs/*` |

### Lokalni artefakti (ignored / not staged)

- `reports/integration-3d-readiness-report-2026-08-10.md` (this file)
- `reports/integration-3d-readiness-logs/preflight-summary.txt`
- `reports/integration-3d-readiness-logs/git-status-short.txt`
- `reports/integration-3d-readiness-logs/remote-checkpoint-ref.json`
- `reports/integration-3d-readiness-logs/remote-main-ref.json`
- `reports/integration-3d-readiness-logs/firebase-projects-list.txt`
- `reports/integration-3d-readiness-visual/` (placeholder; screenshots unavailable)

---

## Final statement

**Staging deploy is NOT READY (RED).**  
Checkpoint code + Gate 3C CI are green, but **hosting isolation, live staging URL, Render branch binding, and Firebase project separation** are not verified/safe.

**STOP.** No deploy and no Phase 4 without a new explicit owner order.
