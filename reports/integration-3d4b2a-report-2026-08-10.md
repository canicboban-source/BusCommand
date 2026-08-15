# Integration Checkpoint 3D.4-B2A — Firestore Rules-Only Deploy

**Datum:** 2026-08-10  
**Verdict:** **PASS**

---

## Identity

| Item | Result |
|------|--------|
| Project | `buscommand-preview` |
| Database | `(default)` |
| Commit / branch | `80bd34b…` / `staging/phase-3-isolation` |
| Rules source | `firestore.rules` (byte-identical to HEAD) |
| Local SHA-256 | `14d5515f0a81b46ff2b56acfdc6d644865f8502240887e1b37ad48d60a83c4d0` |
| Remote CI `31418767332` | success on same SHA |
| Config shape | single default DB, `rules: firestore.rules`, staging alias → `buscommand-preview`, no pre/postdeploy hooks |
| CLI | `15.11.0`, authenticated, project available |

---

## Pre-deploy rollback point

| Field | Value |
|-------|-------|
| Active ruleset (pre) | **5 Aug 2026, 00:47:32** (Active) |
| Previous history | Present (≥9 prior releases in Rule sets panel) |
| Rollback UI | Rule sets panel + Clone / New rule set available |
| Database | `(default)` confirmed |

Visual: `reports/integration-3d4b2a-visual/01-predeploy-rules-history.png`

---

## Deploy

```text
firebase deploy --only firestore:rules --project buscommand-preview --non-interactive
```

| Field | Value |
|-------|-------|
| Start (UTC) | 2026-08-10T20:24:59.5646281Z |
| End (UTC) | 2026-08-10T20:25:07.8030580Z |
| EXIT | **0** |
| Compile | `firestore.rules compiled successfully` |
| Release | `released rules firestore.rules to cloud.firestore` |
| Deploy complete | yes |
| `--force` | absent |
| Indexes create/update/delete | **none** (CLI only *read* `firestore.indexes.json`) |
| Other services | none |

---

## Post-deploy remote proof

| Field | Value |
|-------|-------|
| Active release | `projects/buscommand-preview/releases/cloud.firestore` |
| Ruleset ID | `projects/buscommand-preview/rulesets/a6c1353f-7429-466d-8c76-2f74b13b7559` |
| Active updateTime | `2026-08-10T20:25:06.593454Z` (after deploy start) |
| Remote SHA-256 | `14d5515f0a81b46ff2b56acfdc6d644865f8502240887e1b37ad48d60a83c4d0` |
| Local SHA-256 | identical |
| Byte-identical | **true** (SHA-256 authoritative) |
| Markers | `driver_identity_guard`, `driver_credentials`, `ops/{opsId}`, `D24.2` — all present |

---

## Minimal remote DENY proof

| Field | Value |
|-------|-------|
| Method | Firebase Rules API `ruleset:test` (not live Firestore data) |
| Path | `/databases/(default)/documents/companies/__rules_probe__/ops/driver_identity_guard` |
| Auth | `null` (unauthenticated) |
| Expectation | `DENY` |
| Result state | `SUCCESS` (= expectation met → access denied) |
| Verdict | **DENY_PASS** |
| Document created | no |

---

## Indexes

| | Pre | Post |
|--|-----|------|
| Composite count | 1 (`shifts`) | 1 (`shifts`) |
| Field overrides | 0 | 0 |
| Unchanged | **true** | |

---

## Render / Git

| Check | Result |
|-------|--------|
| Service | `srv-d9t2ek6417fc7391958g` |
| Deploy count | **1** failed (unchanged) |
| Auto Sync | **No** |
| App healthy | no (expected) |
| HEAD / staged / source dirty | `80bd34b…` / 0 / 0 |

---

## Rollback

**Not required.** Remote ruleset matches local SHA; DENY proof passed.

---

## Confirmations

- no indexes deploy  
- no Render deploy  
- no data mutation  
- no source / commit / push / PR / workflow  
- no Phase 4  
- no production Firebase project  

**STOP** after 3D.4-B2A.
