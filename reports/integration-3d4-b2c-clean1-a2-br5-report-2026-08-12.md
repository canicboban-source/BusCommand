# Integration 3D.4-B2C-CLEAN1-A2 / BR5 — offline refreeze + executor

**Date:** 2026-08-12  
**Verdict:** **READY_FOR_BR5_EXECUTOR_REVIEW**  
**Not done:** Cloud Shell upload, dry-run, `--execute`, IAM/Auth mutations, commit/push/deploy, B2C-02, BLAGUSS

---

## 1) Credentials gate (read-only, live)

Path: `companies/buscommand-staging-qa-no-real-data/driver_credentials/5b3d1050-a58b-4d05-9949-f90fbcb73593`

| Check | Result |
|-------|--------|
| `personalCodeUpdatedBy` | `xfoYMF95iUdBWUKQnMKyLlLMuMh1` (run CA) — **MATCH** |
| `createdAt` exists | **YES** = `2026-08-11T14:22:34.361Z` |
| `createTime` | `2026-08-11T14:22:34.387710Z` — **MATCH** frozen |
| `updateTime` | `2026-08-11T14:29:55.614057Z` — **MATCH** frozen |
| EID / hashes printed | **NO** (safe keys only) |
| **CRED_GATE** | **PASS** |

---

## 2) A2 manifest (new file; original untouched)

| Item | Value |
|------|--------|
| Original | `...\clean1b-cloudshell\manifest.json` |
| Original file SHA-256 | `44c1ca5a74d065ad63fca0a3c8ad641cea8848eb45d736e6c4df38147fe19555` |
| Original canonical SHA | `d95dc839d9fa30677a27a9d45a19722e94d2c35b087c293aa2c9ebc6c11c70da` |
| **New A2** | `...\clean1b-cloudshell\manifest-a2.json` |
| A2 file SHA-256 | `679ef5b797986a5630c7b5fe457bfafa3aa2b9a2e56b6af7ce35fe04c19c4ec8` |
| **A2 canonical SHA** | `dde57d99c13cb18756fcae7b08620a5e15527c8d720bda8ae4dd9c47ae310fdd` |
| Version / checkpoint | `3D.4-B2C-CLEAN1-A.2` |

### Fingerprint-only deltas

| Resource | From | To |
|----------|------|----|
| Both shifts | `dutyName: 543201.S01` | `name` + `routeCode` = `543201.S01` |
| Duty | `dutyId` + `parentPlanId` | `code: 543201.S01` |
| Credentials | `driverId` | `personalCodeUpdatedBy` + `createdAt` (exact live) |

### Identity invariants (machine)

- DELETE FS **11** identical paths/times/ownership/order  
- DELETE Auth **2** identical  
- RETAIN **8** identical  
- VERIFY_ABSENT **9** identical  

Proof: `a2-identity-proof.json`

---

## 3) BR5 executor (from exact BR4)

| Item | Value |
|------|--------|
| BR4 source SHA-256 | `8a90f6b17370589bbe3a6c8c10279920ea1a36cb32acfa1b4d96ecc569e3a5ba` (unchanged) |
| **BR5** | `...\clean1b-cloudshell\purge-rest-br5.mjs` |
| BR5 SHA-256 | `e52c281ccfb38e8ed5cdfb4334e4b5901bfd503b73b887c8ee00ca84aa1c6411` |
| CHECKPOINT | `3D.4-B2C-CLEAN1-BR5` |
| REQUIRED_SHA | A2 canonical `dde57d99…310fdd` |
| Empty `contentFingerprint` | fail-closed in `assertContentFingerprint` + `assertDeleteAllowlist` |

### Machine reverse-diff proof

Reversing only the five allowed deltas regenerates byte-identical BR4 (`reversedBr5EqualsBr4=true`).  
Proof: `br5-reverse-proof.json`

---

## 4) Offline tests

| Item | Value |
|------|--------|
| Suite | `purge-rest-br5.test.mjs` |
| Test file SHA-256 | `8ff43adb415229295c92161609c4082518673e10cb2ffa37bf851411b68b0f21` |
| `node --check` executor | exit **0** |
| `node --check` tests | exit **0** |
| Offline suite | **46/46 PASS** (39 BR4 preserved + 7 BR5) |

New BR5 coverage:

1. A2 shift fingerprints `name`+`routeCode`  
2. A2 duty fingerprint `code`  
3. A2 credentials `personalCodeUpdatedBy`+`createdAt`  
4. Missing credentials metadata → abort  
5. Wrong credentials metadata → abort  
6. Empty fingerprint → abort  
7. Forbidden manifest scope change → abort  

---

## 5) Explicit non-actions

- No Cloud Shell upload  
- No dry-run / `--execute`  
- No IAM / Firebase Auth mutations  
- No production source changes  
- No commit / push / deploy  
- Original A1.1 manifest + BR4 executor/tests **unchanged**  
- B2C-02 not touched  
- BLAGUSS forbidden / zero  

---

## 6) Artifact paths

All under `C:\Users\cane\AppData\Local\Temp\clean1b-cloudshell\`:

- `manifest-a2.json`
- `purge-rest-br5.mjs`
- `purge-rest-br5.test.mjs`
- `a2-identity-proof.json`
- `br5-reverse-proof.json`
- `build-a2-br5.mjs` (builder; not part of runtime)

**STOP.** Owner review of BR5 executor before any live dry-run.
