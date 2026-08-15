# Integration Checkpoint 3D.2 — ALLOWLIST COMMIT + PUSH + REMOTE CI

**Datum:** 2026-08-10  
**Verdict:** **PASS**  
**Deploy:** **ZABRANJEN** (Render/Firebase/Blueprint apply — not executed)

---

## 1) Identity

| Stavka | Vrednost |
|--------|----------|
| Branch | `staging/phase-3-isolation` |
| Parent / base SHA | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Local commit SHA | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Remote staging SHA | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Commit message | `chore(staging): isolate preview runtime and fail closed` |
| Frozen checkpoint (pre/post) | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Remote main (pre/post) | `1875d015586f5ddb981591fc9974daa23805b4f7` |

---

## 2) 3D.2-A fix (owner-approved)

In `tests/unit/cors-local-assets.test.js` only:

- Removed require that `BUSCOMMAND_QA_HARNESS` appear literally in `api-server.js`
- Asserted instead: `api-server` imports `runtime-isolation` + calls `validateRuntimeBeforeListen`; `runtime-isolation.js` contains `BUSCOMMAND_QA_HARNESS` and bypass value `"1"`
- No production/source change; no other tests changed; staged count remained 15

---

## 3) Commit file list (exactly 15)

1. `.env.example`  
2. `.firebaserc`  
3. `api-server.js`  
4. `render.staging.yaml`  
5. `scripts/run-confirmation-dispatch.js`  
6. `scripts/staging-firestore-deploy.NOT_EXECUTED.sh`  
7. `server/cors-policy.js`  
8. `server/runtime-isolation.js`  
9. `tests/e2e/api-smoke.spec.js`  
10. `tests/unit/cors-http-staging.test.js`  
11. `tests/unit/cors-local-assets.test.js`  
12. `tests/unit/cors-policy.test.js`  
13. `tests/unit/health-liveness.test.js`  
14. `tests/unit/runtime-isolation.test.js`  
15. `tests/unit/staging-config-guards.test.js`  

No reports/ZIP/secrets/deletions; `render.yaml` and Rules not included.

---

## 4) Staged audit results

| Check | Result |
|-------|--------|
| Staged count | 15 allowlist only |
| Secret name scan | clean |
| `check-no-secrets` | OK |
| Content notes | Pre-existing checkpoint `VITE_FIREBASE_API_KEY` in `.env.example` (unchanged by delta); `private_key` only in leak-guard asserts |
| `.env` ignored | yes |
| YAML identity | `buscommand-preview-staging`, branch staging, `autoDeployTrigger: "off"`, Node `22.14.0`, both `sync: false`, no cron, no `buscommand.com`, no assumed onrender origin, no QA bypass in Blueprint |
| Whitespace | standard `--check` fails CRLF noise; **authoritative** = `git -c core.whitespace=trailing-space,space-before-tab,cr-at-eol diff --cached --check` → exit 0; `git show --check` same → exit 0 |
| Helper | always exit 2; not in package/workflows; mode `100644` (non-executable) |

---

## 5) Pre-commit targeted gates (3D.2-A)

| Gate | Result |
|------|--------|
| secrets | PASS |
| lint (JS scope) | PASS |
| hit test `cors-local-assets` | PASS (3) |
| targeted unit (30) | PASS |
| languages de/en/sr | PASS (5) |
| approved whitespace | PASS |

---

## 6) Push

- Refspec: `origin staging/phase-3-isolation` (new remote branch)
- No `--force`
- Auto-run guard after push: **0** runs (no unexpected push-triggered workflow)
- PR: none

---

## 7) Remote CI

| Field | Value |
|-------|--------|
| RUN_ID | `31418767332` |
| URL | https://github.com/canicboban-source/BusCommand/actions/runs/31418767332 |
| Event | `workflow_dispatch` |
| Branch | `staging/phase-3-isolation` |
| headSha | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| createdAt | `2026-08-10T18:22:47Z` |
| status | `completed` |
| conclusion | **`success`** |
| Runs on staging for this SHA | **1** (no rerun / no duplicate) |

### Job / steps

| Step | Conclusion |
|------|------------|
| Full application verification | **success** (~26m24s) |
| First complete verification | **success** |
| Second complete verification | **success** |
| Preserve browser diagnostics | **skipped** (success path) |
| Failed/cancelled required steps | **none** |

Annotations (non-blocking): Node 20 deprecation on actions; setup-java v4 deprecation.

---

## 8) Visual

- GitHub Actions HTML screenshot: **UNAVAILABLE** (private URL / no authenticated browser capture)
- CLI JSON saved: `reports/integration-3d2-logs/ci-final.json`, `ci-jobs.json`, `ci-watch.txt`, `dispatch-run.json`
- Summary HTML: `reports/integration-3d2-visual/01-ci-summary.html`

---

## 9) Remaining dashboard blockades (deploy still forbidden)

1. Render Blueprint/workspace validation (CLI unavailable earlier)  
2. Create staging service `buscommand-preview-staging`  
3. Real assigned HTTPS origin (UNVERIFIED until dashboard)  
4. Env presence: `FIREBASE_SERVICE_ACCOUNT_JSON`, `CORS_ORIGINS`, `APP_PUBLIC_URL`, VITE_*  
5. Firebase Auth authorized domain for that origin  
6. Never set `BUSCOMMAND_QA_HARNESS=1` on real staging  

---

## 10) Confirmations

- no PR  
- no merge  
- no deploy  
- no Render service creation  
- no Firebase write / deploy  
- no Blueprint apply  
- no CI rerun  
- no Phase 4  
- main / frozen checkpoint unchanged  

**STOP.** Staging deploy remains forbidden.
