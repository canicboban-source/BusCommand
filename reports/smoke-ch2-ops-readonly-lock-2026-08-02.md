# Smoke — Chapter 2 CA read-only + plan lock

Datum: **2026-08-02**  
Grana: `work/ch1-state-checkpoint`  
Verzija: **1.0.10**

## Scope

1. Company Admin operational view = **read-only** (plan/buses): UI hide + client write guard + API already dispatcher-only on mutate.
2. **First-writer plan lock**: acquire / TTL / release / break-glass (engine + staff routes + assignment auto-acquire).

## Gate A–F

| # | Provera | Rezultat |
|---|---------|----------|
| A | `npm run lint` | ✅ 0 errors |
| B | `npm run test:unit` | ✅ **390/390** (incl. `plan-edit-lock.test.mjs`) |
| C | `npm run build` | ✅ |
| D | Tok-inventura | vidi ispod |
| E | Playwright | ✅ `ch2-ops-readonly-lock` 1/1 + `bus-import-smoke` 2/2 |
| F | Zaključane odluke | CA uvid / dispo write / lock TTL+release+break-glass |

## Tok-inventura (D)

### CA ops view (read-only)

| Korak | Dokaz |
|-------|--------|
| UI | Nav `ca_nav_ops_view` → `openCompanyOpsOverview` → group hub; banner `#ops-readonly-banner`; hide `#add-bus-form` / `.hub-bus-import` |
| Validacija / RBAC | `canWriteOperationalRoster` false za CA; `isOperationalReadOnly()`; `persistShift` / `addBus` / bus-import blocked |
| API | `PUT /api/staff/shifts/assignment`, `POST /api/staff/buses` → **403** ako nije dispatcher |
| Audit | Nema CA write na plan/buses (nema mutacije) |
| Happy | CA vidi hub + broj autobusa |
| Fail | `addBus` ne menja `state.buses` |

### First-writer lock

| Korak | Dokaz |
|-------|--------|
| UI (demo) | `ensureDemoDayLock` pre demo `persistShift` |
| API | `POST .../plan-locks/{acquire,heartbeat,release,break}`; `GET .../plan-locks/:lockId` |
| Write path | Assignment PUT: auto-acquire day lock; drugi holder → **409 LOCK_HELD** |
| Break-glass | CA/SA `break` + `logAudit(plan_lock_break)` + razlog ≥8 |
| Unit | acquire / second blocked / TTL / release / break / heartbeat |

## Komande

```text
npm run lint          → exit 0
npm run test:unit     → 390 pass
npm run build         → exit 0
npx playwright test tests/e2e/ch2-ops-readonly-lock.spec.js tests/e2e/bus-import-smoke.spec.js
                      → 3 passed
```

## Ostaje (nije blok za ovaj slice)

- Firestore-backed lock store (sada in-memory / single instance)
- UI dugmad: eksplicitni release / break-glass modal
- Heartbeat timer u dispečerskom UI
- Month-scope lock UX pored day lock na assignment
