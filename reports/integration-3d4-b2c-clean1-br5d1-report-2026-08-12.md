# Integration 3D.4-B2C-CLEAN1-BR5-D1 — Fresh Cloud Shell dry-run

**Date:** 2026-08-12  
**Verdict:** **DRY_RUN_PASS**  
**EXIT:** **0**  
**`--execute`:** not used  

---

## Identity / SHA preflight

| Artifact | Expected | Result |
|----------|----------|--------|
| `$HOME/manifest-a2.json` file SHA | `679ef5b797986a5630c7b5fe457bfafa3aa2b9a2e56b6af7ce35fe04c19c4ec8` | **OK** (`sha256sum -c`) |
| A2 canonical / embed / REQUIRED_SHA | `dde57d99c13cb18756fcae7b08620a5e15527c8d720bda8ae4dd9c47ae310fdd` | **OK** |
| `$HOME/purge-rest-br5.mjs` file SHA | `e52c281ccfb38e8ed5cdfb4334e4b5901bfd503b73b887c8ee00ca84aa1c6411` | **OK** |
| Checkpoint | `3D.4-B2C-CLEAN1-BR5` / manifest `A.2` | **OK** |
| Auth token | — | `TOKEN_OK` |

---

## Fresh evidence (D1 untouched)

| Path | Role |
|------|------|
| `$HOME/clean1b/evidence/br5d1-20260812/` | **new** dry-run evidence |
| `$HOME/clean1b/evidence/br5d1-20260812/execution-state.json` | state |
| `$HOME/clean1b/evidence/br5d1-20260812/dry-run.log` | log |
| `$HOME/clean1b/evidence/br4d1/` | preserved (not touched) |
| `$HOME/clean1b/evidence/br4d1r/` | preserved (not touched) |

Command (no `--execute`):

```bash
node "$HOME/purge-rest-br5.mjs" \
  --manifest "$HOME/manifest-a2.json" \
  --manifest-sha dde57d99c13cb18756fcae7b08620a5e15527c8d720bda8ae4dd9c47ae310fdd \
  --state "$HOME/clean1b/evidence/br5d1-20260812/execution-state.json"
```

---

## Dry-run markers

```
PROJECT_OK
MANIFEST_HASH_OK
DELETE_FS_COUNT=11
DELETE_AUTH_COUNT=2
BLAGUSS_CANDIDATES=0
ADMIN_READ_PROBE_OK
AUTH_PREVALIDATION_OK
DELETE_DOCS_LIVE_OK
VERIFY_ABSENT_OK
BASELINE_COUNTS_OK 2/0/1/1
RETAIN_OK
COMMIT_BODY_OK
DRY_RUN_PASS
```

### State

| Field | Value |
|-------|-------|
| phase | `DRY_RUN_PASS` |
| mode | `DRY_RUN` |
| manifestSha256 | `dde57d99…310fdd` |
| executorSha256 | `e52c281c…6411` |
| deleteFsCount | 11 |
| deleteAuthCount | 2 |
| updatedAt | `2026-08-12T17:16:43.619Z` |
| `.ARMED` | **ABSENT** |
| `.MUTATED` | **ABSENT** |

### Mutation zero-proof (log grep)

| Pattern | Hits |
|---------|------|
| `beginTransaction` | 0 |
| `commit` | 0 |
| `accounts:delete` | 0 |
| `FIRESTORE_TX_COMMIT` | 0 |
| `AUTH_DELETED` | 0 |
| `--execute` | 0 |

(`BLAGUSS_CANDIDATES=0` is the only blaguss-string line; candidates remain 0.)

---

## Visual

Screenshot: `reports/integration-3d4-b2c-clean1-br5d1-visual/01-dry-run-pass.png`

---

## Explicit non-actions

- No `--execute`
- No IAM / source / git / commit / push / deploy
- No D1 state overwrite
- B2C-02 not touched
- BLAGUSS forbidden / unchanged

---

## Trail

1. Reconnected Cloud Shell + auth token OK  
2. Exact SHA verify of A2 manifest + BR5 executor → OK  
3. Created fresh `br5d1-20260812` evidence folder  
4. Ran dry-run only → `EXIT=0` / `DRY_RUN_PASS`  
5. Confirmed locks absent + mutation patterns = 0  
6. Screenshot + report  

**STOP.** Ready for owner review before any execute order.
