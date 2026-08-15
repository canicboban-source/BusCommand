# Integration Checkpoint 3D.4-A — Controlled Render Staging Provision + Origin Capture

**Datum:** 2026-08-10  
**Verdict:** **PASS**

---

## Identity preflight — PASS

| Check | Result |
|-------|--------|
| Branch | `staging/phase-3-isolation` |
| Local/remote SHA | `80bd34bdd85e07bea23cb9bc52793c72e3b31660` |
| Staged / source dirty | 0 / 0 |
| CI | `31418767332` success |
| PR | none |
| main / checkpoint | unchanged |

---

## Collision guard — PASS

| Check | Result |
|-------|--------|
| Service `buscommand-preview-staging` before create | absent (overview: no active services) |
| Blueprint name `buscommand-preview-staging` | absent |
| Existing Blueprint | `buscommand-preview` (`exs-d9e234rbc2fs73f3a6pg`) → repo `BusCommand-Preview`, branch `main`, path **`render.yaml`** — **not edited** |
| `render.staging.yaml` already bound | no |
| Name suffix forced | **no** (exact name used) |
| Plan | Free (expected; no unexpected paid plan) |

---

## Provision result

| Field | Value |
|-------|--------|
| Blueprint name | `buscommand-preview-staging` |
| Blueprint ID | `exs-d9t2co6gekts73ckic8g` |
| Blueprint path | `render.staging.yaml` |
| Linked repo | `canicboban-source/BusCommand` |
| Linked branch | `staging/phase-3-isolation` |
| Blueprint Auto Sync | **No** (create UI defaulted Yes; set to **No** immediately after provision; no second sync/deploy) |
| Service name | `buscommand-preview-staging` |
| Service ID | `srv-d9t2ek6417fc7391958g` |
| **Real public origin** | `https://buscommand-preview-staging.onrender.com` |
| Region / plan | frankfurt / Free |
| Service Auto Deploy | **Off** (`autoDeployTrigger Off`) |
| Deploy attempts | **1** (`dep-d9t2ekm417fc739195vg`, trigger Blueprint) |
| Deployed commit | `80bd34b…` |
| Initial deploy | **Failed** (expected) |
| Fail-fast | `Runtime configuration invalid: staging-firebase-credential-missing` |
| Build | successful; start exit status 1 |
| App Live/Healthy | **no** |
| Origin health probe | timeout / unreachable (expected) |

### sync:false handling

All prompted values left **empty** (Firebase Admin JSON, VITE_*, `APP_PUBLIC_URL`, `CORS_ORIGINS`). No dummy/placeholder URLs. No QA harness. Environment screen not edited after provision. No secrets printed in reports.

---

## Confirmations

- no Firebase change / Auth domain / Rules deploy  
- no successful application deploy  
- no Manual Deploy / Retry / Clear cache / Blueprint resync / restart  
- no source/config change  
- no commit / push / PR / workflow / Phase 4  
- no secrets displayed in artifacts  
- production Blueprint untouched  

---

## Visual evidence

| File | Content |
|------|---------|
| `02-blueprints-collision-guard.png` | existing blueprints list |
| `03-blueprint-review-pre-deploy.png` | review: staging path + service name + empty sync:false |
| `04-blueprint-sync-deploy-failed.png` | sync create service deploy failed |
| `05-service-identity-origin.png` | service + assigned origin |
| `06-service-auto-deploy-off.png` | settings / identity |
| `07-initial-deploy-failfast.png` | deploy logs fail-fast code |
| `08-blueprint-auto-sync-no.png` | Auto Sync = No |

---

## Owner next (NOT this phase)

1. Set `CORS_ORIGINS` + `APP_PUBLIC_URL` to `https://buscommand-preview-staging.onrender.com` (same exact origin).  
2. Set Firebase Admin JSON (`project_id=buscommand-preview`) + VITE_* (same project).  
3. Firebase Auth authorized domain = `buscommand-preview-staging.onrender.com` (host only).  
4. Rules/indexes then **one** Manual Deploy of `80bd34b…` — only after explicit owner approval.

**STOP.** Staging app remains non-functional by design until env/Auth/Rules phase.
