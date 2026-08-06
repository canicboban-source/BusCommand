# Prompt — Disponent: poštena provera svake funkcije i dugmeta

Kopiraj **ceo** blok ispod agentu (Cursor Auto / Composer). Ne skraćuj.
Datum šablona: 2026-08-06. Grana: `work/ca-group-monthly-import` (ili aktivna radna granа koju vlasnik potvrdi).

---

## Uloga

Radi kao senior full-stack + UI/UX + QA + security inženjer za BusCommand.

Radiš **samo Disponent / Dispečer površinu** (staff cockpit). Ne prelazi na Super Admin, Company Admin ili Driver kao primarni obim — osim login-a i gde Dispo tok eksplicitno izlazi (npr. Help escalate kontakt).

Autoritet (redosled):

1. `docs/BusCommand-ULTIMATE-OPERATING-CONTRACT.md` (v2.1+)
2. `docs/BusCommand-MASTER-PROMPT.md` — posebno §1 (šta Dispo mora da vidi za ≤3s), poglavlje 9 (dnevni plan / resolution), §32 (registar interaktivnih elemenata), vizuelna semantika hitnih akcija
3. `.cursor/rules/visual-step-qa.mdc` — **obavezno**
4. Odluke vlasnika u chatu (nadjačavaju starije izveštaje)

**Zabranjeno bez izričitog „da“:** deploy, commit, push, produkcioni Firebase / tuđi tenant podaci, širenje obima van Ultimate Contract (gorivo, SEF, putni nalozi, ERP).

---

## Zakon poštenosti (ne pregovara se)

Ovo nije „brzi smoke“. Cilj je dokaz da je Dispo **najbolji mogući operativni cockpit** — a to se meri **logikom kontrole**, ne osećajem.

### Za SVAKI interaktivni element moraš odgovoriti na 6 pitanja

Zapiši ih u izveštaj **pre** nego što označiš PASS:

1. **Šta piše / kako izgleda?** (label, ikona, lokacija na ekranu)
2. **Kome je namenjeno?** (samo Dispo? sakriveno za CA/Driver?)
3. **Kome vodi?** (sekcija, modal, drawer, spoljni mailto, soft reload, ništa…)
4. **Šta problem rešava u stvarnom radu firme?** (jedna rečenica poslovnog smisla — ne „otvara modal“)
5. **Šta se stvarno desi u lancu?**  
   `klik → UI feedback → validacija → state/API/local → osvežavanje → toast/error`  
   Ako nema API-ja, reci eksplicitno *lokalno / demo / samo UI*.
6. **Dokaz?** screenshot (obavezno) + PASS / FAIL / BLOCKED / STATIC-OK

### Tri dozvoljena stanja (master §32)

| Stanje | Značenje |
|--------|----------|
| **Funkcionalno** | Handler postoji, ugovor (server kad treba) postoji, **ti si izvršio akciju uživo** i snimio rezultat. Čitanje koda ≠ dokaz. |
| **Svesno statično** | Informativno/dekorativno — zapisano sa razlogom. Ne sme izgledati kao dugme koje „radi“. |
| **Uklonjeno / popravljeno** | Izgleda aktivno a ne radi → **FAIL**: popravi ili ukloni. Zabranjeno ostaviti lažno dugme. |

**Zabranjene laži:**

- „radi“ bez snimka tog koraka
- „verovatno OK“ / „u kodu postoji handler“
- prolaz samo kroz konzolu bez Live View
- oceniti 9–10 dok postoji bar jedno lažno dugme ili nerešen Critical/High

Ako nešto ne možeš da proveriš (Firebase, seed, auto-review blokada) — **BLOCKED** + tačan razlog. Ne pretvaraj BLOCKED u PASS.

---

## Vizuelni zakon (obavezno)

1. Otvori Cursor browser **desno** (`position: "side"`) — vlasnik gleda uživo.
2. Posle **svake** smislene akcije: screenshot.
3. Traži tok kao kontinuiran Live View trag — putanja, ne samo krajnji verdict.
4. Preferiraj `staff.html?mode=demo` + lokalni server (`BUSCOMMAND_FORCE_LOCAL_DEMO=1`, tipično PORT=8766). Rebuild `dist/` posle JS/CSS (runtime često služi `dist/`).
5. Markup: ako menjaš shell, uređuj `index.legacy-monolith.html` pa `scripts/build-surface-html.js` — ne samo `staff.html` (overwrite).
6. Na kraju:
   - `reports/dispo-interaction-ledger-YYYY-MM-DD.md` (registar svih elemenata)
   - `reports/dispo-visual-step-report-YYYY-MM-DD.md` (koraci K1…Kn)
   - `reports/dispo-visual-YYYY-MM-DD/` (screenshoti)

---

## Referenca kvaliteta (NE kopirati proizvod)

**Bar:** jasnoća, gustina operativnih informacija, „jedan posao → jedna akcija → jasna potvrda“, miran premium osećaj (npr. flota.rs kao aspiracija kvaliteta).

**Zabranjeno:** prepisati tuđi UI/copy/module; graditi gorivo / putne naloge / SEF / TCO.

BusCommand Dispo ostaje: smene, grupe, dnevni plan, problemi, autobusi/vozači u operativnom smislu, alarmi, Help self-recovery.

---

## Faza A — Mapiranje (pre klikova)

1. Pronađi Dispo shell, header, nav, glavne sekcije, modale, register-onclick / action mapu.
2. Napravi **draft ledger**: lista svih `#id` / `data-action` / vidljivih dugmadi iz DOM-a posle login-a kao Dispo.
3. Grupiši po površini (sledeća faza). Ne ocenjuj još.

---

## Faza B — Površine redom (komplet)

Ne prelazi na sledeću dok trenutna nije: inventarisana → svaki element proveren uživo → Critical/High popravljen ili FAIL zabeležen → snimljeno.

### 0. Priprema + login

- Lokalni demo; uloguj se kao **dispatcher** (ne CA, ne SA).
- Potvrdi Dispo home (cockpit), ne `#company-admin-nav` kao primarni.
- Snimi login → home. Proveri da CA/SA kontrole nisu lažno dostupne.

### 1. Header / shell

Za svaku stavku u headeru (logo, naslov, jezik, notifikacije, Help/Pomoć, logout, user chip, alarm badge…):

- kome vodi, šta rešava, ko sme da vidi
- **Help / Pomoć** (`#dispatcher-help-btn`): samo Dispo; modal self-recovery (soft reload → logout hint → network/Firebase status → escalate preko `contactEmail` copy/mailto **bez** lozinki/PIN-ova); CA/Driver ne smeju da vide dugme
- Logout: čisti sesiju, vraća login, nema curenja tenant podataka u URL-u

### 2. Navigacija / levi meni / tabovi

Svaki nav item: tačna sekcija, aktivno stanje, deep-link/hash ako postoji, back/forward ponašanje.

### 3. Pregled / cockpit (≤3s pitanje)

Šta Dispo mora odmah da vidi (master): ko vozi / gde su problemi / šta je hitno.
Svaki KPI, kartica, filter, „osveži“, deep-link u problem — 6 pitanja.

### 4. Dnevni plan

- Redovi, filteri, datum, grupa/linija
- Dodela / izmena smene, lock banner ako postoji
- Problem red (crveno) + **„Reši problem“** (amber `urgent-action`, ne crveno dugme)
- Guided resolution: jedna jasna putanja, potvrda, audit/revizija gde postoji
- Empty / loading / conflict / read-only

### 5. Group Hub / grupe / linije

- Otvaranje grupe, uvoz/plan koraci u Dispo obimu
- Autobusi: attach/create po pravilima projekta (ne izmišljati bus iz monthly CSV)
- Cross-group warn: toast ali ne lažna blokada ako je warn-only

### 6. Vozači (Dispo obim)

Lista, search, status, dodela, poruke ka vozaču ako postoji — bez CA-only akcija.

### 7. Autobusi (Dispo obim)

CRUD/attach u dozvoljenom obimu; statusi; veza na grupu/plan.

### 8. Alarmi / SOS / incidenti

Prijem, acknowledge, escalate; semantičke boje; nema duplog SOS UI-a na Dispo (SOS je vozački tok — Dispo vidi posledice).

### 9. Poruke / leave / ostali Dispo moduli koji postoje u UI

Svaki modul koji je vidljiv u nav-u — nema „kasnije“. Ako je placeholder → FAIL ili STATIC sa razlogom + predlog uklanjanja.

### 10. Help / Support (novi tok — obavezna dubina)

Prođi **ceo** modal:

| Akcija | Očekivano |
|--------|-----------|
| Soft reload | Osvežava app shell bez „spam F5“ panike; stanje sesije jasno |
| Logout putanja | Vodi na čist re-login |
| Network / Firebase status | Istinit prikaz; ne laži „sve OK“ kad nije |
| Escalate | Koristi company `contactEmail`; copy + mailto; dijagnostika bez tajni |
| Close / Escape | Zatvara modal; focus vraćen |

Proveri i negativ: CA sesija → Help dugme **nije** u DOM-u / nije vidljivo.

### 11. Cross-cutting

- i18n EN/DE/SR — nema sirovih `dispo_*` ključeva na UI
- Responsive: uski side browser ne sme da pojede main
- RBAC: Dispo ≠ CA ≠ SA
- Toasts, confirm, disabled tokom submita, dvostruki klik
- Nema IDOR / curenja drugog tenanta gde se može proveriti u demou

---

## Faza C — Registar (obavezan artefakt)

U `reports/dispo-interaction-ledger-YYYY-MM-DD.md` tabela po redovima:

| ID / selektor | Površina | Label | Kome vodi | Šta rešava | Lanac | Stanje | Dokaz (screenshot) | Napomena |

Brojevi na kraju:

- ukupno elemenata
- Funkcionalno / Svesno statično / FAIL / BLOCKED
- koliko FAIL popravljeno u hodu
- preciznost pokrivenosti (provereno ÷ ukupno)

Bez kompletnog registra **nije dozvoljeno** tvrditi „svako dugme radi“.

---

## Ispravke tokom prolaza

- **Critical/High** odmah: broken dugme, pogrešna uloga, lažni status, XSS, curenje, layout koji krije operativni sadržaj, Help koji šalje tajne.
- Medium/Low: jeftino popravi; inače dokumentuj.
- Posle JS/CSS: rebuild + reload Live View.
- Pokreni relevantne testove (`dispatcher-help`, cockpit/plan e2e, ui-smoke Dispo delovi) — stvarni exit code u izveštaju.
- D17 bundle budget: ne ruši bez dokumentovane soft-limit odluke.

---

## Ocena (iskrena)

Na kraju daj **1–10** za Dispo cockpit uz pravila:

- 10 = svaki vidljivi kontrol ima Funkcionalno ili Svesno statično + dokaz; nema Critical/High; Help i resolution tokovi prošli uživo; registar kompletan
- Svako lažno dugme ≤ 7
- Svaki BLOCKED na kritičnom putu mora biti naveden — ne diži ocenu „jer demo“

Šta fali za 10: konkretna lista, ne marketing.

---

## Izlaz vlasniku (kratko)

Na kraju, bez traženja potvrde posle svake sekcije:

1. Zeleno / crveno / blocked
2. Link ka ledger + step report + folder snimaka
3. Ocena + gap do 10
4. Da li Dispo sme dalje (npr. Driver) — da/ne + zašto

---

## Start komanda (prva poruka agentu)

„Kreni Dispo poštenu proveru svake funkcije i dugmeta po ovom promptu. Otvori Live View desno. Prvo Faza A mapiranje + draft ledger, zatim Faza B površine 0→11. Za svaki element: kome vodi, šta rešava, lanac, dokaz. Popravljaj Critical/High u hodu. Na kraju ledger + step report + iskrena ocena. Ne tvrdi da radi bez snimka.“
