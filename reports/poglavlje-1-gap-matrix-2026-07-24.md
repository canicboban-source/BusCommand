# Poglavlje 1 — Gap matrica (master prompt vs kod)

Datum: 2026-07-24  
Grana: `work/master-prompt-ch1` @ `bb6c4aa`  
Statusi: `DONE` | `PARTIAL` | `MISSING` | `UNKNOWN`  
Izvor: kod + docs; bez nagađanja.

Zaključane odluke (ne tretirati kao gap):

- Uvoz plana = **samo** BusCommand XLSX + CSV + strukturirani BC PDF (opcija 1).
- Vozač = PWA; staff = desktop.
- Jezici = sr / de / en (cilj; kompletnost PARTIAL).

---

## Matrica po poglavljima master prompta

| § | Tema | Status | Prioritet | Dokaz / napomena |
|---|------|--------|-----------|------------------|
| 0 | Cilj proizvoda (dispo-first) | PARTIAL | — | Ops postoji; nije još „3 sekunde / 5 pitanja“ cockpit |
| 1.1 | Uređaji (PWA / desktop) | DONE | — | `driver.html`, `staff.html`, ADR-001 |
| 1.2 | i18n sr/de/en | PARTIAL | High | `translations.js`; hardkodovi (quick-reports DE, avatar, check-in); nema globalnog missing-key testa |
| 1.3 | Čist projekat (bez demo/`123456`) | PARTIAL | High | Shared `123456` **uklonjen** iz produkcionog path-a; demo state i dalje postoji za localhost |
| 1.4 | Granica proizvoda | DONE | — | `PRODUCT-SCOPE.md`; finansije van obima |
| 3.1 / 16 | Super Admin platforma | PARTIAL | High | Create/suspend/counts; **MISSING**: support session, feature flags, scheduler UI, hard close |
| 3.2 / 17 | Company Admin | PARTIAL | Medium | Overview/branding/groups/team/drivers/settings/plans/audit — jak WIP; nije „release gate“ kompletan |
| 3.3 / 10 | Disponent cockpit | PARTIAL | High | Ops + daily/monthly; bez punog §8, undo, concurrency |
| 3.4 / 14 | Vozač PWA | PARTIAL | Medium | Shell/PWA/SOS/quick/messages; check-in lokalni; next-confirm delimično |
| 3.5 | RBAC matrica artefakt | PARTIAL | High | Artefakt **DONE** `reports/rbac-matrix-2026-07-24.md`; enforcement još ima UI-bypass rupe (G1–G7) |
| 4 | Aktivacija (OTP 24h + SMS) | PARTIAL | High | Unique OTP + TTL + consume + personal code **DONE** (2026-07-24). SMS stub DONE; real provider MISSING |
| 5 | Kanonski model plana | PARTIAL | **Critical** | Catalog (`service_plans`) ≠ roster (`shifts`/`schedules`); incident/solution nisu entiteti |
| 6 | Uvoz kataloga | PARTIAL | Medium | Preview/publish DONE; **rollback MISSING**; proizvoljni PDF van obima (OK) |
| 7 | Mesečni plan | PARTIAL | High | Assign/unavailable; swap/undo MISSING; slabiji server path |
| 7 / 4 | Dnevni plan | PARTIAL | High | Edit + `PUT …/assignment`; nije pun uncovered-slot model |
| 8 | Problem-resolution 10 koraka | PARTIAL | High | Reši/Dodeli; bez healthy-gate, zamena-list, push re-confirm |
| 9 | Potvrda + petak pravila | PARTIAL | High | `driver-work-policy.js` DONE; push/scheduler MISSING |
| 10 | Ops layout | PARTIAL | Medium | 3 kolone + snapshot; vizuelni mockup nepotpun |
| 11 | Poruke | PARTIAL | Medium | Individual/group/all; „all active“ filter MISSING; urgent/read delimično |
| 12 | GPS lifecycle | PARTIAL | High + Legal | Work-window stop; live mapa **simulirana**; map access audit MISSING |
| 13 | Prijava/odjava smene | PARTIAL | Medium | Check-in local; checkout/API MISSING |
| 15 | Pronađeni predmeti + foto | PARTIAL | Medium | Forma/API bez fotografije; statusi nepotpuni |
| 18 | BusCommand znak + brending | PARTIAL | Low | Logo/mark postoji; kontrast/brand validation treba proveriti end-to-end |
| 20 | Arhitektura | PARTIAL | — | Node/Vite/Firebase poštovani; concurrency/idempotency incomplete |
| 21 | Security | PARTIAL | High | Shared `123456` removed; remaining: public driver list + concurrency gaps |
| 22 | Privacy/legal paket | PARTIAL | High | Policy copy; nema ROPA/DPIA/artefakta; GPS čeka pravnu potvrdu |
| 23 | WCAG 2.2 AA | UNKNOWN | Medium | Nije sistemski auditovan u ovoj sesiji |
| 24 | Testovi | PARTIAL | High | Unit bogat; E2E smoke 30/30; rules emulator / full release suite nekompletni |
| 29 | Završni artefakti | PARTIAL | Medium | Forenzika + ovaj gap; RBAC/DPIA/threat model još ne |

---

## Top Critical / High (za Poglavlje 2+)

1. ~~Critical — shared `123456`~~ → **rešeno** OTP (stub SMS).  
2. **Critical** — Jedan kanonski roster model + optimistic concurrency.  
3. ~~High — RBAC matrica artefakt~~ → dokument `reports/rbac-matrix-2026-07-24.md`; zatvoriti G1–G7 u kodu.  
4. **High** — Problem-resolution tok + potvrde/scheduler.  
5. **High** — GPS: isključiti simulaciju kao „live“, audit pristupa, legal gate.  
6. **High** — Service plan rollback.  
7. **Business decision** — pravi SMS provider + Support session model za Super Admin.  
8. **High** — stroža izolacija demo state-a od produkcionog bundla.

---

## Šta je namerno van obima (ne gap)

- Proizvoljni firmi PDF/XLS/TXT import.  
- Finansije / gorivo / plate (PRODUCT-SCOPE).  
- Stanice/navigacija (Almex).  
- Mikroservisi / rewrite stacka.
