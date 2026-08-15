# Integration 3D.4-B2C-CLEAN1-B-BR5-EXECUTE

**Date:** 2026-08-12  
**Verdict:** **PASS**  
**`--execute`:** run **exactly once**  
**Retry:** none  

---

## Preflight (all green before mutation)

| Check | Result |
|-------|--------|
| `$HOME/manifest-a2.json` file SHA | `679ef5b7…4ec8` **OK** |
| A2 canonical / REQUIRED_SHA | `dde57d99…310fdd` **OK** |
| `$HOME/purge-rest-br5.mjs` file SHA | `e52c281c…6411` **OK** |
| State path | `$HOME/clean1b/evidence/br5d1-20260812/execution-state.json` |
| phase | `DRY_RUN_PASS` |
| mode | `DRY_RUN` |
| freshness | `age_ms=355838` (< 600000) → **FRESH** |
| `.ARMED` / `.MUTATED` | **ABSENT** |
| project / company / run | `buscommand-preview` / `buscommand-staging-qa-no-real-data` / `BC-STG-B2C-20260811-5432cb` |
| Token | `TOKEN_OK` |
| **PREFLIGHT** | **GREEN** |

---

## Execute command (single shot)

```bash
node "$HOME/purge-rest-br5.mjs" \
  --manifest "$HOME/manifest-a2.json" \
  --manifest-sha dde57d99c13cb18756fcae7b08620a5e15527c8d720bda8ae4dd9c47ae310fdd \
  --state "$HOME/clean1b/evidence/br5d1-20260812/execution-state.json" \
  --execute
```

Log: `$HOME/clean1b/evidence/br5d1-20260812/execute.log`

---

## PASS markers (required)

```
FIRESTORE_TX_COMMIT_OK deletes=11
FIRESTORE_POSTCHECK_OK 1/0/0/0
AUTH_DELETED_RUN_CA
AUTH_DELETED_DRIVER
BLAGUSS_DELETE_ATTEMPTS=0
OTHER_TENANT_DELETE_ATTEMPTS=0
VERDICT=PASS
```

| Marker | Present |
|--------|---------|
| FIRESTORE_TX_COMMIT_OK deletes=11 | **True** |
| FIRESTORE_POSTCHECK_OK 1/0/0/0 | **True** |
| AUTH_DELETED_RUN_CA | **True** |
| AUTH_DELETED_DRIVER | **True** |
| BLAGUSS_DELETE_ATTEMPTS=0 | **True** |
| OTHER_TENANT_DELETE_ATTEMPTS=0 | **True** |
| VERDICT=PASS | **True** |

### Final state

| Field | Value |
|-------|-------|
| phase | **PASS** |
| mode | EXECUTE |
| firestoreDeletes | 11 |
| authDeletes | 2 |
| manifestSha256 | `dde57d99…310fdd` |
| executorSha256 | `e52c281c…6411` |
| updatedAt | `2026-08-12T17:24:59.964Z` |
| `.ARMED` | present (expected after execute) |
| `.MUTATED` | present (expected after execute) |

Exit: process completed with `VERDICT=PASS` / `phase=PASS` (no FATAL catch → Node exit **0**).

---

## RETAIN live proof (post-execute GET)

All **PRESENT** under QA tenant:

| Path | Result |
|------|--------|
| `companies/buscommand-staging-qa-no-real-data` | PRESENT |
| `.../profile/main` | PRESENT |
| `.../settings/main` | PRESENT |
| `.../ops/driver_identity_guard` | PRESENT (ct/ut `2026-08-11T14:22:34.387710Z`) |
| `.../users/jQYUfo1QjsgVw1zn5ez37ONLYI32` (persistent CA) | PRESENT |

Postcheck baseline after purge: **1/0/0/0** (admins/dispatchers/drivers/groups) — matches persistent CA only.

Audit: in A2 RETAIN freeze / not in DELETE set; postcheck OK. Soft `audit_log` query not re-captured in the final terminal recovery window (session UI glitch after PASS); no evidence of audit deletion.

D1 evidence dirs were not used for this execute; BR5 evidence folder is authoritative.

---

## Scope / safety

- Deletes: **11 Firestore + 2 Auth** only  
- Project/tenant: `buscommand-preview` / `buscommand-staging-qa-no-real-data` only  
- BLAGUSS delete attempts: **0**  
- Other-tenant delete attempts: **0**  
- No source / git / IAM / deploy changes in this turn  
- B2C-02 not touched  
- No retry  

---

## Visual

`reports/integration-3d4-b2c-clean1-br5-execute-visual/01-execute-pass.png`

---

## Trail

1. Exact SHA + DRY_RUN_PASS freshness preflight → GREEN  
2. Single `--execute` against same state  
3. Commit 11 + postcheck 1/0/0/0 + both Auth deletes  
4. RETAIN live GETs for tenant/config/guard/persistent CA  
5. Final state `PASS`  
6. Report + STOP  

**STOP.**
