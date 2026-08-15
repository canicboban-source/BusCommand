# Integration Checkpoint 3D.3 — Read-only Staging Deploy Runbook & Dashboard Preflight

**Datum:** 2026-08-10  
**Verdict:** **CONDITIONAL**

Kod/config na SHA su konzistentni sa izolovanim staging ugovorom, ali obavezne owner-authenticated dashboard činjenice (Render workspace/service, stvarni origin, env presence, Auth domain) ostaju **UNVERIFIED**. Po ugovoru ovo **nije READY**.

**Deploy:** nije izvršen (i nije odobren ovom fazom).

---

## 1) Identity preflight — PASS

| Check | Result |
|-------|--------|
| Repo | `C:/Users/cane/Desktop/BusCommand-ca-monthly-import` |
| Branch | `staging/phase-3-isolation` |
| Local SHA | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Remote staging SHA | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Parent | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Remote main | `1875d015586f5ddb981591fc9974daa23805b4f7` (unchanged) |
| Frozen checkpoint | `d087d67ede7c36761ae52dd213bfbd787444eb81` (unchanged) |
| PR | none |
| Runs on staging | only Integrated QA `31418767332` success — **no deploy workflow** |
| Staged index | 0 |
| Tracked source/config dirty vs HEAD | 0 (reports-only local evidence OK) |
| Remote CI | `31418767332` success on this SHA |

Log: `reports/integration-3d3-logs/01-identity-preflight.txt`

---

## 2) Render Blueprint — static PASS / workspace UNVERIFIED

| Item | Result |
|------|--------|
| File | `render.staging.yaml` |
| Branch | `staging/phase-3-isolation` only |
| Service | `buscommand-preview-staging` |
| `autoDeployTrigger` | `"off"` |
| Node | `22.14.0` |
| Build / start / health | `npm ci --include=dev && npm run build && npm prune --omit=dev` / `npm start` / `/api/health` |
| Cron | **absent** |
| `buscommand.com` | absent |
| Hardcoded onrender URL | absent |
| `sync: false` count | 9 (Admin JSON, CORS, APP_PUBLIC_URL, 6× VITE_*) |
| QA harness in Blueprint | absent |
| Production `render.yaml` | still `branch: main` + cron; **not** in staging commit |
| Render CLI validate | **UNAVAILABLE** → **UNVERIFIED — OWNER/RENDER DASHBOARD ACTION REQUIRED** |

### Bootstrap finding (docs + code)

- First Blueprint **Deploy Blueprint** **creates/provisions** the service ([Render IaC](https://render.com/docs/infrastructure-as-code)).
- `autoDeployTrigger: "off"` disables **commit auto-deploys**, not the initial provision action.
- Set Blueprint **Auto Sync = No** so later YAML pushes do not surprise-sync.
- `APP_PUBLIC_URL`/`CORS_ORIGINS` cannot be truthfully filled before the assigned origin exists → **CONTROLLED BOOTSTRAP EVENT**: first start may fail fail-fast until both are set to the real origin. Do **not** weaken fail-fast; do **not** use QA harness.

---

## 3) Environment matrix

See `reports/integration-3d3-env-matrix-2026-08-10.md` (names/formats only; no secret values).

Critical: Admin `project_id` must be `buscommand-preview`; browser Vite config pinned to same project; real staging forbids `BUSCOMMAND_QA_HARNESS=1`.

---

## 4) Firebase preflight (read-only)

| Item | Result |
|------|--------|
| `.firebaserc` | `default` + `staging` → `buscommand-preview` only |
| Rules to deploy | `firestore.rules` (entire file via `firebase.json`) |
| Indexes to deploy | `firestore.indexes.json` — only `shifts(driverId, date)` |
| Data migration | **None** required for first staging |
| `driver_identity_guard` | Lazy doc `companies/{id}/ops/driver_identity_guard`; no batch migration |
| Browser access to guard/credentials/EID | Rules: `match /companies/{companyId}/ops/{opsId} { allow read, write: if false; }`; Dispo credential boundary remains server-enforced |
| Auth authorized domain | Add **hostname only** (no `https://`) when Render host known — Firebase docs use domain form `www.example.com` for authorized domains ([email-link auth](https://firebase.google.com/docs/auth/web/email-link-auth), 2026-08-10) |
| Same project | Web config + Admin SA must both be `buscommand-preview` |
| Dashboard Auth/domains list | **UNVERIFIED — OWNER/FIREBASE DASHBOARD ACTION REQUIRED** |

No Firebase mutating commands executed.

---

## 5) Deploy order (summary)

Full detail: `reports/integration-3d3-staging-deploy-runbook-2026-08-10.md`

0. Identity re-check  
1. Owner: new Render Blueprint (`render.staging.yaml`, Auto Sync No) — not production  
2. Controlled bootstrap: secrets + VITE → learn assigned origin → set `APP_PUBLIC_URL`=`CORS_ORIGINS`  
3. Owner: Firebase Auth authorized domain (host only)  
4. Rules/indexes → `--project buscommand-preview` (**before** trusting browser traffic)  
5. Manual Render deploy of `80bd34b…`  
6. Health/assets  
7. Synthetic smoke (matrix)  
8. Owner verdict  

Prefer **Rules before server** for privacy (ops deny). All commands marked NOT EXECUTED.

---

## 6) Smoke matrix

`reports/integration-3d3-smoke-matrix-2026-08-10.md` — **not executed** this phase.

---

## 7) Rollback (document only)

Suspend staging service; Rules history restore on `buscommand-preview` only; Git safe points `80bd34b` / `d087d67`; synthetic data cleanup only; **never** touch production. First deploy has **no prior Render version** → suspend, not “rollback to previous”.

---

## 8) Mandatory STOP conditions (still open → blocks READY)

| Condition | Status |
|-----------|--------|
| SHA/project match | OK (code) |
| Render workspace/service identity confirmed | **UNVERIFIED** |
| Blueprint workspace validation | **UNVERIFIED** |
| Production URL/credential/project in staging config | OK in YAML (static) |
| Real staging origin known | **UNVERIFIED** |
| `APP_PUBLIC_URL` == `CORS_ORIGINS` exact | **UNVERIFIED** (dashboard) |
| Auth domain prepared | **UNVERIFIED** (needs origin) |
| Admin JSON `project_id=buscommand-preview` present | **UNVERIFIED** (secret; not read) |
| QA harness required | Must remain **false** |
| Executable bootstrap + rollback plan | Documented |
| Real user data | Forbidden for future smoke |
| Any required dashboard fact unchecked | **Yes → CONDITIONAL** |

---

## 9) Blockers for READY (owner dashboard)

1. Confirm Render workspace + create/bind Blueprint to `render.staging.yaml` (Auto Sync No).  
2. Confirm service `buscommand-preview-staging` identity after provision.  
3. Record **real** assigned HTTPS origin (do not assume).  
4. Set `CORS_ORIGINS` + `APP_PUBLIC_URL` to that origin; set Admin JSON + VITE_* for `buscommand-preview`.  
5. Add Auth authorized domain (hostname).  
6. Explicit future approval for Rules deploy + Manual Deploy (not this checkpoint).

---

## 10) Artefakti

- `reports/integration-3d3-report-2026-08-10.md` (this file)  
- `reports/integration-3d3-staging-deploy-runbook-2026-08-10.md`  
- `reports/integration-3d3-env-matrix-2026-08-10.md`  
- `reports/integration-3d3-smoke-matrix-2026-08-10.md`  
- `reports/integration-3d3-logs/`  
- `reports/integration-3d3-visual/`  

No ZIP. No packer. No source changes.

---

## 11) STOP confirmations

- no source/config change  
- no stage/commit/push/PR/merge/tag  
- no workflow dispatch/rerun  
- no Render sync/create/deploy  
- no Firebase deploy / Auth domain change / cloud mutate  
- no env value mutation  
- no new tools/deps  
- no secret values recorded  
- no Phase 4  
- no unit/Rules/E2E/build re-run (SHA already CI-green)

**STOP.** Staging deploy remains forbidden until a new explicit owner order after dashboard facts are proven.
