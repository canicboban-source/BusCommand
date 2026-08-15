# FAZA 1 — Security Closeout (2026-08-09)

**Status:** PASS · **STOP** (nema Faze 2, nema D18.1 implementacije, nema commit/push/deploy)  
**Base commit SHA:** `a6fbcb508c67287c33479f38c3678cd44684ee60`  
**Node:** 22.14.0 (portable `.tools/node-v22.14.0-win-x64`)  
**D18.1:** odluka ostaje zapisana u `docs/decisions.md` — **nije** implementirana.

## Gateovi

| Gate | Exit | Log |
| ---- | ---- | --- |
| secrets | **0** | `reports/phase-1-security-closeout-logs/secrets.txt` |
| lint | **0** | `.../lint.txt` |
| unit | **0** (634) | `.../unit.txt` |
| build | **0** | `.../build.txt` |
| bundle budgets | **0** · staff **578100 ≤ 581632** · translations **377148 ≤ 377856** | `.../bundle-budgets.txt` |
| firebase isolation | **0** | `.../firebase-isolation.txt` |
| audit (`--omit=dev`) | **0** (0 vulns) | `.../audit.txt` |
| rules emulator | **0** (102) | `.../rules.txt` |
| visual trail | **0** | `.../visual.txt` + `reports/phase-1-security-closeout-visual/` |
| relevant E2E (`dispatcher-cockpit` + `ui-smoke`) | **0** | `.../e2e-dispo.txt` |

## Promene (ŠTA / ZAŠTO / DOBIT / RIZIK)

### 1. Firestore query-contract testovi
| | |
| -- | -- |
| **ŠTA** | Novi `tests/rules/firestore.query-contract.test.js` — stvarni list/get query oblici iz `firebase-service.js` (assigned / foreign / unfiltered / knownGroupIds / CA / cross-tenant / driver). Poseban `PROJECT_ID` + `test-concurrency=1` da nema race sa postojećim suite-om. |
| **ZAŠTO** | Doc.get() nije dovoljan dokaz za produkcione query-je. |
| **DOBIT** | Emulator dokaz da Dispo query mora biti group-scoped. |
| **RIZIK** | Nizak. `package.json` test:rules dodaje `--test-concurrency=1` (stabilnost). |

**Buses / groupIds:** Rules dozvoljavaju document get preko `groupIds.hasAny` (dokazano `bus-multi`, `bus-gids-only`). Produkcijski client query ostaje `groupId ==`. List `array-contains` + `get()`-based membership **nije** query-provable u Firestore Rules — foreign `array-contains` list i dalje fail-closed. Rules nisu menjane samo da list prođe.

### 2. API enumeration-safe + executable testovi
| | |
| -- | -- |
| **ŠTA** | `server/driver-routes.js`: message archive → isti `404` / `MESSAGE_UNAVAILABLE` / „Poruka nije dostupna.“ za nonexistent i foreign (bez groupId/driverId). SOS resolve → isti `409` / `SOS_UNAVAILABLE` / „Nema aktivnog SOS alarma.“ za prazan i foreign SOS; foreign se **ne** mutira. Novi `tests/unit/phase1-message-sos-http.test.js` izvršava handlere + proverava bazu. |
| **ZAŠTO** | Prethodni 403/409 sa različitim porukama bili su enumeration oracle. |
| **DOBIT** | Dispo ne može zaključiti postojanje tuđe poruke/SOS-a. |
| **RIZIK** | CA i dalje vidi sopstvene tokove; Dispo UI mora tretirati generički deny. |

### 3. Client defense-in-depth
| | |
| -- | -- |
| **ŠTA** | `sanitizeDispatcherActiveGroups` u `dispatcher-scope.js`; `openGroupHub` / daily / monthly plan odbijaju foreign ID, čiste hub/header, vraćaju fallback; `shell-staff` sanitizuje pri login shell-u. |
| **ZAŠTO** | Forced `activeGroupHubId=202` ranije mogao da ostavi foreign u zaglavlju (UX). |
| **DOBIT** | Header/hub ne ostaju na foreign grupi. |
| **RIZIK** | Nije zamena za Rules/server. |

### 4. Cleanup komentara
| | |
| -- | -- |
| **ŠTA** | Uklonjeni/zamenjeni zastareli komentari da `knownGroupIds` služi Dispo array-contains / primary+known directory (`driver-routes.js`, `group-membership.js`). |
| **ZAŠTO** | Komentari lagali ugovor posle Faze 1. |
| **DOBIT** | Istinita dokumentacija u kodu. |
| **RIZIK** | Nula. |

### 5. Visual trail
| | |
| -- | -- |
| **ŠTA** | `scripts/phase1-security-closeout-visual.mjs` → `reports/phase-1-security-closeout-visual/`. Dispo seed je Rules-shaped (samo 101); nema evaluate-filter kao authz dokaz. Forced foreign proverava sanitize header/hub. |
| **ZAŠTO** | Owner UX path + odvajanje od security dokaza. |
| **DOBIT** | Screenshot trail PASS. |
| **RIZIK** | QA harness ≠ live Firebase. |

## Fajlovi (closeout delta)

- `server/driver-routes.js`
- `js/core/dispatcher-scope.js`
- `js/dispatcher/group-hub.js`
- `js/layout/shell-staff.js`
- `js/data/group-membership.js`
- `package.json` (`test:rules` concurrency)
- `tests/rules/firestore.query-contract.test.js` **(new)**
- `tests/unit/phase1-message-sos-http.test.js` **(new)**
- `tests/unit/phase1-dispatcher-group-api.test.mjs`
- `tests/unit/dispatcher-scope.test.mjs`
- `scripts/phase1-security-closeout-visual.mjs` **(new)**
- `reports/phase-1-security-closeout-visual/*`
- `reports/phase-1-security-closeout-logs/*`
- `docs/decisions.md` (D18.1 zapis — bez implementacije)
- `reports/phase-1-report-2026-08-09.md` / `phase-1-change-ledger.md` (raniji STOP update)

**Napomena:** working tree i dalje sadrži i starije Faza 0/1 izmene iznad `a6fbcb5` (npr. `firestore.rules`, `firebase-service.js`) — nisu commitovane.

## Namerno nije urađeno

- Faza 2
- D18.1 projection endpoint
- Nova kolekcija / schema / dependency
- Commit / push / deploy / live Rules publish

## STOP

Čeka se eksplicitno `NASTAVI FAZU 2` (ili poseban nalog za D18.1 implementaciju).
