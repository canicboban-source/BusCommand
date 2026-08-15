# Integration 3D.1 / 3D.1.1 — Change Ledger

**Branch:** `staging/phase-3-isolation` (local only, unpushed)  
**Base checkpoint SHA:** `d087d67ede7c36761ae52dd213bfbd787444eb81`  
**Commit:** none (working tree only)

---

## Nova grana

| Stavka | Detalj |
|--------|--------|
| Grana | `staging/phase-3-isolation` |
| Kreirana iz | `d087d67ede7c36761ae52dd213bfbd787444eb81` |
| Push | **NE** |
| Frozen checkpoint | nepromenjen na remote |

---

## 3D.1.1 korekcije (review nalazi)

### `render.staging.yaml`

- **Šta:** `NODE_VERSION: "22.14.0"`; `APP_PUBLIC_URL` + `CORS_ORIGINS` `sync: false`; komentari bez pretpostavljenog onrender URL-a; zadržan `name: buscommand-preview-staging`; bez cron-a; bez hardkodovanog HTTPS.
- **Zašto:** Identity + Node pin + dashboard-required origin.
- **Donosi:** Ne-dvosmislen planirani service name; origin nije pretpostavljen.
- **Dokaz:** `staging-config-guards`, `static-staging-yaml-scan.txt`.
- **Dashboard:** Kreirati servis; upisati stvarni origin u oba sync:false polja.

### `server/runtime-isolation.js` (NEW in 3D.1.1)

- **Šta:** Pre-listen validator — staging Firebase Admin + APP_PUBLIC_URL; QA bypass samo `BUSCOMMAND_QA_HARNESS=1`; greške bez secret/URL leak-a.
- **Zašto:** Staging bez kredencijala / pogrešan project / loš APP_PUBLIC_URL ne sme da sluša.
- **Donosi:** Fail-closed staging runtime.
- **Dokaz:** `tests/unit/runtime-isolation.test.js` + fail-fast logs.
- **Dashboard:** Secret JSON + APP_PUBLIC_URL.

### `server/cors-policy.js`

- **Šta:** Invalid non-empty `BUSCOMMAND_ENV` → `runtime-env-invalid` (no silent fallback).
- **Zašto:** Dodatni fail-closed guard.
- **Donosi:** Eksplicitna konfiguraciona greška.
- **Dokaz:** cors-policy + runtime-isolation tests.
- **Dashboard:** Nema.

### `api-server.js`

- **Šta:** `validateRuntimeBeforeListen` pre listen-a; exit 1 sa `err.code` only; uklonjene unused `QA_HARNESS`/`RUNTIME_ENV` lokalne konstante.
- **Zašto:** Wire fail-fast + čist lint scope.
- **Donosi:** Proces ne ulazi u listen na lošoj staging konfiguraciji.
- **Dokaz:** process-exit unit test; fail-fast stderr logs.
- **Dashboard:** Nema.

### `.env.example`

- **Šta:** `APP_PUBLIC_URL=` prazno; komentari staging/production/no cross-env fallback; bez pretpostavljenog onrender URL-a.
- **Zašto:** Uklonjen default `https://www.buscommand.com`.
- **Donosi:** Primer bez production default-a.
- **Dokaz:** staging-config-guards env example test.
- **Dashboard:** Production origin samo u production dashboardu.

---

## 3D.1 baza (zadržano)

### `render.staging.yaml` (NEW in 3D.1)

- Staging Blueprint odvojen od production `render.yaml`.

### `.firebaserc`

- Alias `staging` → `buscommand-preview`.

### `scripts/staging-firestore-deploy.NOT_EXECUTED.sh` (NEW)

- Docs-only helper; uvek exit 2.

### `scripts/run-confirmation-dispatch.js`

- Nema host fallback; staging blocks `buscommand.com`.

### Tests

| Fajl | Svrha |
|------|--------|
| `tests/unit/runtime-isolation.test.js` | Fail-fast credential/APP_PUBLIC_URL/QA/invalid env |
| `tests/unit/cors-policy.test.js` | Exact allow/deny + invalid env |
| `tests/unit/cors-http-staging.test.js` | Live server CORS + OPTIONS |
| `tests/unit/health-liveness.test.js` | `{ok:true}` + no-store |
| `tests/unit/staging-config-guards.test.js` | YAML/cron/firebase/env static guards |
| `tests/unit/cors-local-assets.test.js` | Ažuriran CORS model |
| `tests/e2e/api-smoke.spec.js` | Health ugovor (nije pun E2E run) |

### Neizmenjeno (namerno)

- `render.yaml` (production Blueprint)
- `firestore.rules` / indexes semantika
- Firebase Hosting (ne postoji)
- Poslovna logika CA/Dispo/import
- `server/sms-provider.js` production URL fallback (staging fail-fast ga zaobilazi pre listen-a)
