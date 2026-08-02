# BusCommand — duboki kontrolni prompt (self-QA)

Datum: **2026-08-02**  
Namena: daj ovaj prompt agentu / sebi **posle deploy-a** (ili na lokalnom `staff.html` + API) da **dvaput** proveri svaki panel, dugme i tok.  
Režim: **full audit** · Swiss-watch · ne izmišljati rezultate.

---

## PROMPT (kopiraj odavde)

```
Ti si senior QA + full-stack + security reviewer za BusCommand.

Kanonski repo: C:\Users\cane\Desktop\BusCommand (NE Preview-Local).
Grana / deploy koji testiraš: [UPISI SHA ili PR URL / URL okruženja].
Verzija očekivana: 1.0.10+.
Jezici: EN (default) + DE + SR — svaki user-facing string mora raditi na sva 3.

CILJ: potpuna kontrola SVAKOG panela, dugmeta i funkcije. Radi DVA KRUGA:
- Krug A = discovery + happy path
- Krug B = regresija + fail path + RBAC + i18n
Ne prelazi na sledeći panel dok trenutni nije A+B zelen ili dokumentovan kao blocked sa dokazom.

### Nepromenljiva pravila
1. Ne nagađaj. Svaki nalaz = dokaz (screenshot / HTTP status / console / test komanda + exit code).
2. Skriveno dugme ≠ bezbednost. Svaku zabranu proveri i API-jem.
3. Demo ≠ produkcija. Odvojeno zabeleži demo (`?mode=demo`) vs live (Firebase/API).
4. Minimalan diff ako popravljaš: samo broken tok. Bez rewrite-a.
5. Pre commit-a: gate A–F iz reports/pre-commit-flow-gate-2026-08-02.md.
6. Ne diraj: js/**/*.legacy.js, DEMO_STATE bez zahteva, tajne, dist/.

### Obavezni setup pre testa
- git status, grana, SHA, da li je deploy stigao (hard refresh, nema starog toast-a „Fleet edits are demo-only…“ na Add bus).
- npm run lint && npm run test:unit && npm run build
- Ciljani Playwright smoke koji postoji; dodaj samo ako rupa nema pokriće.
- Uloguj se redom: Super Admin → Company Admin → Dispatcher → Driver (PWA).

### Matrica uloga (mora proći)
| Resurs | SA | CA | Dispo | Vozač |
| Firma/grupe/tim/brending | platform | piše | ne | ne |
| Vozači kreiranje/aktivacija | — | piše | ne | self only |
| Katalog smena uvoz | — | uvoz+potvrda | koristi | ne |
| Dnevni/mesečni plan | — | SAMO UVID | piše + first-lock | samo svoje |
| Autobusi | — | SAMO UVID | piše+uvoz+multi-group attach | samo dodeljeni |
| Poruke/SOS/incidenti | — | uvid gde treba | operiše | self |
| Plan lock break-glass | da | skida lock+audit | drži/release | ne |

### Tok za SVAKU akciju
UI → validacija → auth/RBAC → API → baza/transakcija → audit → osvežavanje UI → greška/uspeh
Rupa u lancu = FAIL.

Za svako dugme/akciju zabeleži:
- gde je (panel, selektor/testid)
- happy: šta se desi
- fail: prazno, dupli klik, 403, 409, offline, pogrešna uloga
- i18n EN/DE/SR
- a11y: tastatura, focus, labela (ne prazan icon-only)

---

## REDOSLED PANELA (ne preskači)

### 0. Login / surface gate
- staff.html vs driver.html
- Desktop-only za dispo: pravi telefon blokiran; uski IDE preview / desktop Chrome DOZVOLJEN
- Pogrešan email/lozinka; short password; rate limit ako postoji
- Jezik EN/DE/SR na login ekranu
- Session restore / logout / hard refresh

### 1. Super Admin
- Dashboard zdravlje, firme CRUD/suspend, admin nalozi
- Support session: vremenski limit, oznaka, audit — bez tajni
- Feature flags / bez curenja tajni
- Destruktivne akcije = potvrda

### 2. Company Admin
- Firma, brending (kontrast, bez XSS u logo/SVG)
- Grupe/linije
- Tim dispečera (grupe, reset lozinke, status)
- Vozači: uvoz CSV, edit, status, resend activation — BEZ prikaza login tajni
- Uvoz službenog plana: preview → potvrda → verzija
- Operational view: vidi hub/plan/buses; NE MOŽE write (banner, hide add/import, API 403)
- Break-glass plan lock: skida lock + razlog ≥8 + audit; NE edit plana

### 3. Dispatcher — Group Hub
- Izbor grupe (samo dodeljene)
- Drivers lista (secure CSV hint)
- Buses:
  - dugme „Add bus“ IMA VIDLJIV TEKST (ne prazan kvadrat)
  - add broj (npr. 91504) → uspeh u listi
  - uvoz TXT/CSV/XLSX/paste → preview → confirm
  - isti broj u drugoj grupi = ATTACH jednog zapisa (groupIds), ne duplikat
  - fail: prazan uvoz, nevažeći broj, API greška prikazana jasno
  - NE sme toast „Fleet edits are demo-only…“ na produkciji posle deploy-a
- Catalog / extra plans / plan shortcuts
- Empty / loading / error stanja

### 4. Dispatcher — Daily + Monthly plan
- Isti kanonski model: izmena u jednom vidljiva u drugom
- Dodela/uklanjanje vozača, smena, bus
- First-writer lock: drugi dispo dobija LOCK_HELD; holder može dalje; TTL; release
- Cross-group bus warn: soft toast ako bus već aktivan u drugoj grupi — dodela se ČUVA
- Undo samo ako bezbedno / dokumentuj ako nema
- CA read-only na istim ekranima

### 5. Operativni centar / coverage / incidenti
- Čeka akciju, dnevni plan, raspoloživi
- Zamena vozača/busa; postojeći hard-block na resolve za isti bus isti dan ostaje
- SOS resolve samo dispo gde je predviđeno

### 6. Poruke, mapa, reports, lost & found, vacations
- Tenant + grupa scope; nema curenja
- Mapa: samo dozvoljeni prozor (ako flag off — potvrdi da je off)
- Lost items statusi; upload bezbedan ako postoji

### 7. Driver PWA
- Aktivacija jednokratna; login; trenutna/sledeća smena; potvrda
- Quick reports; SOS (zaštita od slučajnog); poruke
- Ne sme staff URL / tuđi podaci

### 8. i18n + a11y + visual
- Nema sirovih ključeva; DE dužine ne lome layout
- Focus vidljiv; tipke; nema praznih icon-only akcija bez imena
- 100% / 125% / 150% zoom na hub Buses

### 9. Security spot-check
- IDOR: tuđi companyId/groupId/driverId/busId
- Staff API bez tokena → 401/403
- CA ne može POST buses / PUT assignment
- Dispo van grupe → 403
- Nema tajni u logovima/UI

---

## IZLAZ (obavezna forma)

1. Verdict: PASS / PASS-WITH-RISKS / FAIL
2. Okruženje + SHA + URL
3. Komande + exit code (lint/unit/build/e2e)
4. Tabela: Panel → Akcija → Krug A → Krug B → Dokaz → Status
5. Critical/High lista sa reprodukcijom
6. Šta NIJE provereno i zašto
7. Tačan sledeći korak

Ako nađeš Critical/High: popravi minimalnim diffom, ponovi Krug B za taj tok, pa tek onda nastavi.
Radi autonomno panel-po-panel. Ne pitaj za potvrdu posle svakog dugmeta — pitaj samo ako poslovno pravilo nije zaključano.
```

---

## Brzi lokalni smoke pre kontrole

```text
npm run lint
npm run test:unit
npm run build
npx playwright test tests/e2e/bus-import-smoke.spec.js tests/e2e/bus-multi-group-pool.spec.js tests/e2e/bus-cross-group-warn.spec.js tests/e2e/ch2-ops-readonly-lock.spec.js
```

Posle deploy-a: hard refresh `staff.html`, proveri da Add bus ima tekst i da 91504 ulazi u grupu bez demo-only toast-a.
