# 3D.4-A Change Ledger

**Verdict:** PASS — controlled external provision only.

| Area | Change |
|------|--------|
| Render Blueprint | **CREATED** `buscommand-preview-staging` (`exs-d9t2co6gekts73ckic8g`), path `render.staging.yaml`, branch `staging/phase-3-isolation`, repo `BusCommand` |
| Blueprint Auto Sync | Set **No** after create (was Yes by default) |
| Render web service | **CREATED** `buscommand-preview-staging` (`srv-d9t2ek6417fc7391958g`) |
| Service Auto Deploy | **Off** (from Blueprint) |
| Deploys | **1** Blueprint-triggered deploy of `80bd34b` → fail-fast `staging-firebase-credential-missing` |
| Environment values | **none entered** |
| Existing Blueprint `buscommand-preview` | **untouched** |
| Firebase | **none** |
| Git/GitHub | **none** |
| Source/config | **none** |
| Reports | `reports/integration-3d4a-*` evidence only |

### Why

Capture real staging origin and prove fail-closed start without secrets or successful app deploy.

### Residual risk / next owner step

Origin known; env/Auth/Rules/Manual Deploy still required in a later approved phase. Do not set `BUSCOMMAND_QA_HARNESS=1`.
