# Poglavlje 8 — Mesečni plan

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 7 (`07ac15f` / `3372d03`)
- Checkpoint commit: *(vidi git SHA na kraju / follow-up note)*
- Master prompt: v3.2 §7, §5 (SoT), odluka D8

## 1. Cilj

Zatvoriti disponentski mesečni plan: sticky grid, ćelije preko kanonskog
assignment API-ja, masovno odsustvo uz preview/potvrdu, kontrolisani undo nove
revizije, disciplina aktivnog kataloga, bez lažnog „sačuvano“ i bez
nekompletnog dispo bulk importa u UI.

CA group monthly import ostaje zatvoren iz ranijeg rada (nije predmet P8 polish-a).

## 2. Pronađeno / rešeno

| ID | Nalaz | Status |
| --- | --- | --- |
| C8-1 | Nema kontrolisanog undo-a nove revizije | Rešeno (`priorSnapshot` + `POST …/undo`, audit `shift_undone`) |
| C8-2 | Nema masovnih operacija sa preview/potvrdom | Rešeno (off/vacation/sick opseg) |
| C8-3 | Tabela bez sticky zaglavlja / slab group pregled | Rešeno (sticky day table + group matrix) |
| C8-4 | Dispo bulk import u hub UI bez CA-grade commit-a | Rešeno (UI sakriven / deferred) |
| C8-5 | `createEmptyMonthlyPlan` + `saveState` lažni lokalni upis | Rešeno (lokalni shell, bez `saveState`) |
| C8-6 | Katalog inventiše F/S fallback šifre | Rešeno (nema inventa; locked = samo active plan) |
| C8-7 | Tanko pokriće mesečnog undo/mass puta | Rešeno (unit + wiring tests) |

Namerno odloženo: puni E2E live Firebase monthly edit (demo E2E pokriva cockpit;
server undo/mass su unit-dokazani); dublji overlap engine vozač/bus → P9;
dispo bulk commit parity sa CA → kasnije ako vlasnik zatraži.

## 3. Izmene

### Server
- `server/shift-assignment.js` — `capturePriorSnapshot`, `buildClearedShift`,
  `simulateUndoWrite`, `previewMassDayRange`; assign nosi `priorSnapshot`
- `server/driver-routes.js` — soft-clear tombstone; `POST /api/staff/shifts/assignment/undo`
- `server/driver-work-policy.js` — ignoriše `type: "clear"` tombstone pri čitanju

### Klijent
- `js/dispatcher/monthly-plans.js` — sticky grid, group matrix, mass ops, undo,
  catalog lock, local shell
- `js/dispatcher/shifts.js` — `undoShift`; clear zadržava reviziju
- `js/core/line-shift-catalog.js` — bez fallback inventa po defaultu
- `js/core/shift-plan.js` — clear tombstone u lokalnom state-u
- `js/core/api-client.js` — `undoStaffShift`
- `js/core/monthly-plan-ops.js` — pure mass helpers
- `staff.html` / legacy — undo dugme; hub bulk import `hidden`
- `css/staff-desktop.css` — sticky/matrix/mass stilovi
- i18n EN/DE/SR

### Dokumentacija
- `docs/canonical-plan-model.md` §7 undo
- `docs/decisions.md` **D8**
- Roadmap §27 #8 → završeno

## 4. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz (0 errors; postojeći warning u `service-plans.test.js`) |
| `npm run test:unit` | **484/484** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| Playwright chromium | **57/57** |

## 5. Ocena

**8.5/10** — §7 Critical/High zatvoreni za disponentski mesečni plan.
Sledeće: Poglavlje 9 (dnevni plan, problem-resolution, cockpit).
