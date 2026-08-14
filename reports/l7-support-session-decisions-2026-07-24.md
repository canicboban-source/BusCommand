# L7 — Super Admin support session (decision brief)

Datum: 2026-07-24  
Status: **Odluke odobrene (OK predlog)** — skeleton implementiran, feature flag **OFF** dok legal ne potvrdi uključivanje.

## Zaključane odluke

1. TTL **1 h**
2. Pokreće samo **Super Admin**
3. Obim **read-only** (bez tajni / credentials)
4. Kategorija (`incident` | `onboarding` | `billing`) + razlog ≥ 20
5. **Badge za CA + immutable audit**
6. Prekid: **SA i CA**
7. Extenzija: **zabranjena** (nova sesija + novi razlog)
8. Skeleton + **`features.supportSession: false`** default

## Implementacija (skeleton)

| Deo | Lokacija |
|-----|----------|
| Server | `server/support-session.js` |
| Rute | `POST/GET /api/admin/companies/:id/support-sessions…`, `POST …/end`, CA get/end |
| Rules | `support_sessions` write false; CA/SA read |
| Flag | `settings.main.features.supportSession` default false in provisioning |
| SA UI | Start/End dugmad + modal |
| CA UI | Badge na license kartici + revoke |
| Testovi | `tests/unit/support-session.test.js` |

## Uključivanje u preview (kasnije)

Na tenant-u postaviti `features.supportSession: true` tek posle legal OK. Bez toga API vraća `403 SUPPORT_SESSION_DISABLED`.

## Šta namerno nije urađeno

- Nema impersonate tokena / ulaska kao CA ili disp.
- Nema čitanja `driver_credentials`.
- Nema tenant-snapshot “deep read” API-ja još — start/end/status + badge su dovoljni za skeleton.
