# Integration Checkpoint 3D.1 / 3D.1.1 — Staging Isolation + Fail-Fast Correction

**Datum:** 2026-08-10  
**Verdict 3D.1.1:** **GREEN** (lokalna izolacija + fail-fast) — **DEPLOY I DALJE ZABRANJEN**

---

## 1) Branch / SHA identitet

| Stavka | Vrednost |
|--------|----------|
| Repo | `C:\Users\cane\Desktop\BusCommand-ca-monthly-import` |
| Working branch | `staging/phase-3-isolation` (local only, **unpushed**) |
| Branch HEAD (base commit) | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Frozen remote checkpoint | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Remote main | `1875d015586f5ddb981591fc9974daa23805b4f7` |
| Gate 3C | PASS · `31410530175` · Node pin **22.14.0** |
| Commit on 3D.1 / 3D.1.1 | **none** (working tree corrections only) |
| PR / push / deploy / workflow | none |

Owner odluka: Firebase `buscommand-preview` = TEST-ONLY staging target.

---

## 2) Autoritativna staging identity (3D.1.1)

| Stavka | Vrednost |
|--------|----------|
| Firebase staging project | `buscommand-preview` |
| Render planned service name | `buscommand-preview-staging` |
| Staging origin | **UNVERIFIED — OWNER/DASHBOARD ACTION REQUIRED** |
| Assumed prior onrender hostname as staging origin | **FORBIDDEN as fallback** |
| Production domain in staging YAML | **absent** |
| Cron in staging | **ABSENT — NOT CREATED / NOT DEPLOYED** |
| `CORS_ORIGINS` / `APP_PUBLIC_URL` | both `sync: false` (dashboard after real origin) |
| `NODE_VERSION` | `22.14.0` |

Stvarni onrender.com URL **nije** hardkodovan u Blueprint-u. Nakon kreiranja servisa owner unosi isti dodeljeni origin u oba dashboard polja.

---

## 3) Šta / zašto / donosi / dokaz / dashboard (po nalazu)

### Nalaz 1 — Staging identity

| | |
|--|--|
| **Šta** | Zadržan `name: buscommand-preview-staging`; uklonjene pretpostavke staging origin-a iz report/test/docs; Blueprint bez hardkodovanog HTTPS URL-a; `APP_PUBLIC_URL` + `CORS_ORIGINS` `sync: false`. |
| **Zašto** | Review: ambiguous Render identity + pretpostavljeni preview origin. |
| **Donosi** | Jasna planirana service identity; origin ostaje dashboard-required. |
| **Test/dokaz** | `staging-config-guards.test.js`; `static-staging-yaml-scan.txt`; visual `03-isolation-summary.html`. |
| **Dashboard** | Kreirati servis `buscommand-preview-staging`; upisati stvarni assigned origin u `CORS_ORIGINS` i `APP_PUBLIC_URL`. |

### Nalaz 2 — Staging Firebase fail-fast

| | |
|--|--|
| **Šta** | `server/runtime-isolation.js` + wire u `api-server.js` pre listen-a. Staging (bez QA) zahteva validan `FIREBASE_SERVICE_ACCOUNT_JSON` sa `project_id === buscommand-preview`. |
| **Zašto** | Staging je mogao da startuje sa `HAS_FIREBASE=false` i health 200. |
| **Donosi** | Missing/invalid/wrong project → exit 1 pre listen-a; generičke greške bez credential sadržaja. |
| **Test/dokaz** | `runtime-isolation.test.js` (missing/malformed/wrong/pass/QA/no-leak/process exit); log `failfast-missing-credential.stderr.txt`; visual `06-failfast-credential.html`. |
| **Dashboard** | Popuniti `FIREBASE_SERVICE_ACCOUNT_JSON` za `buscommand-preview` na staging servisu. |

### Nalaz 3 — APP_PUBLIC_URL fail-fast

| | |
|--|--|
| **Šta** | `.env.example`: `APP_PUBLIC_URL=` (prazno). Staging runtime zahteva validan HTTPS origin, bez path/query/hash/credentials, bez `buscommand.com`, mora biti u `CORS_ORIGINS`. |
| **Zašto** | Cross-env default i nedostatak staging binding-a. |
| **Donosi** | Mismatch/missing/invalid → fail pre listen-a; vrednost se ne loguje. |
| **Test/dokaz** | `runtime-isolation.test.js` APP_PUBLIC_URL suite; log `failfast-app-public-url-mismatch.stderr.txt`; visual `07-failfast-app-public-url.html`. |
| **Dashboard** | Postaviti `APP_PUBLIC_URL` = stvarni staging origin (isti kao CORS). |

### Nalaz 4 — Node reproducibility

| | |
|--|--|
| **Šta** | `NODE_VERSION: "22.14.0"` u `render.staging.yaml`. |
| **Zašto** | `"22"` nije pinovan na Gate 3C runtime. |
| **Donosi** | Usklađenost sa Gate 3C / phase Node 22.14.0. |
| **Test/dokaz** | staging-config-guards; static scan; phase reports citiraju 22.14.0. |
| **Dashboard** | Nema (Blueprint pin); lokalni host može biti drugačiji Node — Render koristi Blueprint pin. |

### Dodatni fail-closed guard

| | |
|--|--|
| **Šta** | Ne-prazan `BUSCOMMAND_ENV` van `{development,staging,production}` → `runtime-env-invalid` pre listen-a. |
| **Zašto** | Sprečiti tihi fallback na production/development. |
| **Donosi** | Eksplicitna konfiguraciona greška. |
| **Test/dokaz** | `runtime-isolation.test.js` + `cors-policy.test.js`. |
| **Dashboard** | Nema. |

### QA harness

| | |
|--|--|
| **Šta** | Bypass samo preko `BUSCOMMAND_QA_HARNESS=1` (ne preko `NODE_ENV`). |
| **Zašto** | Testovi/local smoke bez pravih kredencijala. |
| **Donosi** | Health 200 u harness-u; production staging runtime ostaje fail-closed. |
| **Test/dokaz** | runtime-isolation QA tests; `qa-harness-health.txt`; visual `08-qa-harness-health.html`. |
| **Dashboard** | **Nikad** ne postavljati `BUSCOMMAND_QA_HARNESS=1` na pravom staging servisu. |

---

## 4) Gate tabela (3D.1.1 targeted)

| Gate | Result |
|------|--------|
| secrets | PASS (`check-no-secrets: OK`) |
| lint (izmenjeni scope) | PASS (0 errors; unused-var warnings cleaned) |
| runtime-isolation + CORS/health/config unit | PASS (**30** tests) |
| HTTP staging CORS | PASS |
| languages de/en/sr | PASS (5) |
| build | PASS |
| D17 budgets | PASS (no bump) |
| static YAML scan | PASS (service name, sync:false×2, Node 22.14.0, no cron, no buscommand.com, no assumed onrender host) |
| Render CLI `blueprints validate` | **UNAVAILABLE — NOT VALIDATED AGAINST RENDER WORKSPACE** (CLI not installed/authenticated) |
| Local YAML review | PASS (manual + unit guards; no apply) |
| Full Rules/E2E | **NOT RUN** |

D17:

```
OK  driver app JS excl. translations: 172782 <= 225280
OK  staff app JS excl. translations: 577794 <= 581632
OK  largest non-translations driver chunk: 140089 <= 153600
OK  translations chunk: 344300 <= 377856
Bundle budgets OK (D17 soft-pilot).
```

---

## 5) Render Blueprint status

- File: `render.staging.yaml`
- CLI validate: **UNAVAILABLE — NOT VALIDATED AGAINST RENDER WORKSPACE**
- Local: web-only service, `autoDeployTrigger: "off"`, no cron, no hardcoded origins/secrets, Node `22.14.0`
- Production `render.yaml`: **untouched**

---

## 6) Preostale OWNER/DASHBOARD akcije

1. Kreirati/povezati Blueprint path `render.staging.yaml` (ne dirati production Blueprint).  
2. Kreirati servis imena `buscommand-preview-staging`.  
3. Nakon dodeljenog HTTPS origin-a postaviti **isti** origin u `CORS_ORIGINS` i `APP_PUBLIC_URL`.  
4. Popuniti `FIREBASE_SERVICE_ACCOUNT_JSON` + VITE_* za `buscommand-preview`.  
5. Auth authorized domain za stvarni staging origin.  
6. **Ne** postavljati `BUSCOMMAND_QA_HARNESS` na staging.  
7. Deploy ostaje **zabranjen** do eksplicitne owner naredbe.

---

## 7) Residual note (namerno netaknuto)

`server/sms-provider.js` i dalje ima fallback `APP_PUBLIC_URL || … || "https://www.buscommand.com"`.  
U pravom staging runtime-u (bez QA) `APP_PUBLIC_URL` je obavezan pre listen-a, pa se taj fallback ne koristi. Business-layer SMS fallback nije u scope-u 3D.1.1.

---

## 8) Artefakti

- `reports/integration-3d1-report-2026-08-10.md` (ovaj fajl)
- `reports/integration-3d1-change-ledger.md`
- `reports/integration-3d1-logs/` (uklj. fail-fast + 3d11-* + static scan)
- `reports/integration-3d1-visual/` (`03`, `06`, `07`, `08` + prior smoke)
- `reports/integration-3d11-review-source-2026-08-10.zip`

Evidence **nije** staged.

---

## 9) Potvrde

- no commit  
- no push  
- no PR/merge/tag  
- no deploy  
- no workflow dispatch  
- no Phase 4  
- no secret values printed  
- frozen checkpoint SHA unchanged  
- main unchanged  
- no budget bump  

**STOP.** Staging deploy ostaje zabranjen.
