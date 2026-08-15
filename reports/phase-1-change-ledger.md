# FAZA 1 — Change Ledger (Dispatcher group authorization)

| ID | Fajl/tok | Šta menjaš | Zašto | Dobit | Rizik | Kako dokazuješ |
| -- | -------- | ---------- | ----- | ----- | ----- | -------------- |
| P1-01 | `firestore.rules` | Dispo read = dodeljena grupa; CA own-tenant; Driver own/explicit; `knownGroupIds` ne otvara read | Direktni SDK bypass company-wide | Authz na Rules sloju | Query mora biti usklađen | `npm run test:rules` |
| P1-02 | `js/core/firebase-service.js` (+ policy po potrebi) | Ukloni Dispo `knownGroupIds` directory query; uskladi query sa Rules; driver scoped load | Req 5–6 | Client ≠ directory | D18 other-group pool prazan do projekcije | unit source + rules |
| P1-03 | `server/driver-routes.js` | `loadDriverDocsForGroups` samo home `groupId`; ops-activity drop ungrouped; message archive bez `groupId` deny; SOS `groupId` + resolve gate | API rupa / oracle | Server autoritet | SOS bez grupe → deny | unit + HTTP gde postoji |
| P1-04 | `tests/rules/firestore.rules.test.js` | Negativni Dispo cross-group + pozitivni CA + Dispo-own po kolekcijama | Req 9–10 | Emulator dokaz | Fixtures sa `groupId` | rules exit 0 |
| P1-05 | unit testovi koji forsiraaju `knownGroupIds` client/directory load | Preokreni na “nema client directory”; server home-only load | Inače gate pada / lažni ugovor | Istinit baseline | Regresija D18 UI hint | `test:unit` |
| P1-06 | Visual trail + izveštaj | Dispo dozvoljena grupa / odsustvo tuđe / access-denied / CA own-tenant | v4.1 screenshot gate | Owner path | QA harness only | `reports/phase-1-visual/` |

## Pre-flight

| | |
| -- | -- |
| **Found** | Rules: Dispo company-wide na većini ops kolekcija (samo `reports` group-scoped). Client soft-scope + `knownGroupIds` expansion. API mutacije uglavnom gated; rupe: ops-activity ungrouped, message archive bez `groupId`, SOS resolve company-wide. |
| **Changing** | Rules group scope; client queries; API rupe; rules/unit tests; visual + report. |
| **Not changing** | Novi projection endpoint / nova schema kolekcija (STOP — owner odluka za D18 other-group pool). Push/deploy. Faze 2–6. |
| **Risks** | Needs Attention “other groups” pool prazan do bezbedne projekcije. Busovi samo sa `groupIds[]` bez `groupId` — Rules `hasAny`, client i dalje `groupId==` (postojeći jaz). |
| **Proof plan** | rules + unit + lint/build/budgets; visual trail; STOP. |

## Namerno STOP (req 7–8)

Company-wide / other-group **replacement pool** zahteva usku server projekciju. Bez owner “yes” na novi/prošireni endpoint — ne implementira se. D18 polje `knownGroupIds` ostaje CA metadata; ne otvara Firestore/API direktorijum.

## Rezultat Faze 1

| Gate | Exit |
| ---- | ---- |
| rules | 0 (44) |
| unit | 0 (628) |
| lint / build / budgets | 0 · staff 576761 ≤ 581632 |
| secrets / firebase-isolation / audit | 0 |
| visual | PASS → `reports/phase-1-visual/` |

Izveštaj: `reports/phase-1-report-2026-08-09.md`

**STOP — čeka se `NASTAVI FAZU 2`**

### D18.1 (2026-08-09) — zabeleženo, nije implementirano

Owner odobrio usku server projekciju (tenant-bound, server-authoritative, bounded, data-minimal; bez credentials/PII profila; mutation re-check; bez nove kolekcije/šeme; Firestore direktorijum zatvoren).  
Zapis: `docs/decisions.md` § D18.1. Kod projekcije **nije** pokrenut u ovom STOP-u.

### Security Closeout (2026-08-09)

Izveštaj: `reports/phase-1-security-closeout-2026-08-09.md`  
Visual: `reports/phase-1-security-closeout-visual/`  
Logs: `reports/phase-1-security-closeout-logs/`  
ZIP: `reports/phase-1-security-closeout-deliverable-2026-08-09.zip`  
Gates: secrets/lint/unit(634)/build/budgets/firebase/audit/rules(102)/visual/e2e → exit 0
