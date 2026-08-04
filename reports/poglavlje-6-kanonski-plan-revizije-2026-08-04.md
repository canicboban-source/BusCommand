# Poglavlje 6 — kanonski model plana i revizije

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: Poglavlje 5 (`7708b49` / `8a1e75c`)
- Checkpoint commit: `e6dd4c5`
- Master prompt: v3.2 §5, §21, §26

## 1. Cilj

Zaključati jedan SoT za dnevne dodele, optimistic concurrency, vezu potvrde
za reviziju, i sprečiti tihi overwrite na klijentu posle 409.

## 2. Stanje pre izmene

Već radilo: `PUT /api/staff/shifts/assignment` sa `expectedRevision`, schedule
mirror u transakciji, plan locks, Rules deny client writes.

Nedostajalo (Critical/High):

| ID | Nalaz | Status |
| --- | --- | --- |
| C6-1 | Čitanje meša shift+schedule (`override`); nejasan SoT | Rešeno |
| C6-2 | Potvrda nije eksplicitno vezana za reviziju | Rešeno (`confirmationBoundRevision`) |
| C6-3 | Nema dokaza dva pisca → conflict bez overwrite | Rešeno (`simulateOptimisticWrite` test) |
| C6-4 | 409 na klijentu samo toast, bez primene `conflict.shift` | Rešeno |
| C6-5 | Mirror ćelija mogla da pošalje lažnu pozitivnu reviziju | Rešeno (samo `source:"shift"`) |

## 3. Izmene

- `server/shift-assignment.js` — schema komentar, `confirmationBoundRevision`,
  nulliranje confirm polja, `simulateOptimisticWrite`,
  `assertConfirmationMatchesRevision`
- `server/driver-work-policy.js` — `source: "shift" | "schedule_mirror"`
- `js/core/shift-plan.js` — isto za klijentsko čitanje
- `js/dispatcher/shifts.js` — `applyServerShiftConflict`; expectedRevision samo
  sa kanonskog shift izvora
- `docs/canonical-plan-model.md`, `docs/decisions.md` D6
- Testovi u `tests/unit/shift-assignment.test.js`

## 4. Mutacija

| Mutacija | Rezultat |
| --- | --- |
| `simulateOptimisticWrite` drugi pisac sa expectedRevision 0 posle rev 1 | `REVISION_CONFLICT` ✓ |
| Stale confirmationBoundRevision | `confirmation_revision_mismatch` ✓ |

## 5. Gate

| Komanda | Rezultat |
| --- | --- |
| `npm run lint` | prolaz |
| `npm run test:unit` | **470/470** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| `npx playwright test --project=chromium` | **57/57** |

## 6. Namerno odloženo

- Puni HTTP Express race sa plan-lock middleware (algoritam je pokriven;
  Express wiring ostaje statički + E2E lock demo)
- Outbox re-enqueue posle invalidate → Poglavlje 10
- Problem/resolution entititi → Poglavlje 9
- CA katalog / mesečni undo UI → P7/P8

## 7. Ocena

**8.5/10** — ugovor SoT + concurrency zaključan i testiran; puni paralelni
browser race i dalje čeka staging/multi-tab dokaz. Sledeće: Poglavlje 7.
