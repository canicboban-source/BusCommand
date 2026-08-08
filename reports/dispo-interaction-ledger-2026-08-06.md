# Dispo interaction ledger — 2026-08-06

Autoritet: master §32 + `reports/dispo-interaction-honesty-prompt-2026-08-06.md`.  
Okruženje: `staff.html?mode=demo` na `localhost:8766`, uloga **Demo Dispatcher** (`demo@buscommand.com`).  
Dokaz: `reports/dispo-visual-2026-08-06/`.

## Brojevi

| Metrika | Vrednost |
|---------|----------|
| Primarni elementi u registru | 42 |
| Funkcionalno (uživo) | 36 |
| Svesno statično / sekundarni ulaz | 1 |
| FAIL | 0 |
| BLOCKED (namerno nije izvršeno do kraja) | 5 |
| Popravljeno overnight | 5 (Help status, vacations nav, contactEmail seed, baseline gating, shift-grid bereitshaft) |
| E2E overnight | **70/70 × 3** |
| Unit overnight | **565/565 × 2** |

Preciznost pokrivenosti (provereno uživo ÷ registar): **37/42 ≈ 88%** + e2e lanac SA→CA→Dispo→Driver zeleno. BLOCKED ostaju soft-reload / logout / mailto / Claim lock mutacija / Assign save (namerno da ne unište Live View sesiju).

## Registar

| ID / selektor | Površina | Label | Kome vodi | Šta rešava | Lanac | Stanje | Dokaz | Napomena |
|---------------|----------|-------|-----------|------------|-------|--------|-------|----------|
| `#login-dispatcher-email` + password + `#dispatcher-login-btn` | 0 Login | Log in as dispatcher | App shell Dispo | Ulaz u operativni rad | UI → lokalni demo auth → `#app-container` | Funkcionalno | k01, k02 | Demo nalog |
| `#header-lang-select` | 1 Header | Language EN/DE/SR | i18n refresh | Dispo vidi UI na jeziku smene | change → `t()` → DOM | Funkcionalno | k07 | DE: Operationszentrale, Hilfe… |
| `switchToGroupSetup` / Switch | 1 Header | Switch | Group setup | Promena aktivne linije | klik → group setup view | Funkcionalno | k02 | Vidljivo „Active group: Line 101“ |
| `#theme-toggle-btn` | 1 Header | Theme | light/dark | Kontrast / preferenca | toggle `light-theme` | Funkcionalno | k07 | Radi |
| `#dispatcher-help-btn` | 1 / 10 Help | Help | `#dispatcher-help-modal` | Self-recovery pre eskalacije vlasniku | open → fill → modal | Funkcionalno | k03, k09 | Samo Dispo |
| Help Refresh | 10 Help | Refresh data now | soft reload | Re-sync bez F5 panike | toast → `location.reload` | BLOCKED | k03 | Namerno nije kliknuto mid-pass; kod + e2e postoje |
| Help Sign out | 10 Help | Sign out | logout | Čist re-login | close modal → logout | BLOCKED | k03 | Ne bi uništavali sesiju prolaza |
| Help status | 10 Help | Current status | informativno | Istinit cloud/demo status | `IS_DEMO_MODE` → label | Funkcionalno | k09 | Popravljeno: Local demo (no cloud) |
| Help escalate | 10 Help | mailto / copy | mailto contactEmail | Eskalacija tek posle self-help | note → mailto href | Funkcionalno | k03b | Bez contactEmail: disabled + missing copy — ispravno |
| Help close | 10 Help | X | zatvara modal | Izlaz | closeModal | Funkcionalno | — | CDP close OK |
| Logout header | 1 Header | Log out | login | Kraj smene / bezbedan izlaz | logout | BLOCKED | — | Nije kliknut da zadržimo prolaz |
| Nav Ops | 2 Nav | Operations center | `#dispatcher-dashboard` | ≤3s jutarnji snap | switchSection | Funkcionalno | k02 | CA nav sakriven |
| Nav Daily | 2/4 | Daily plan | pick → full | Dnevne rupe / dodela | switchSection | Funkcionalno | k04, k05 | |
| Nav Monthly | 2/5 | Monthly plan | pick | Mesečni pregled po grupi | switchSection | Funkcionalno | CDP walk | |
| Nav Messages | 2/9 | Messages | compose | Poruka vozaču / grupi | section + form | Funkcionalno | CDP | Personal/Group tabovi |
| Nav Map | 2/8 | Map | Leaflet mapa | GPS pregled (opciono) | section | Funkcionalno | CDP | Zoom kontrole |
| Nav Reports | 2/8 | Problem reports | tabela | Pregled kvarova/kašnjenja | section + filter | Funkcionalno | CDP | Filter Line 101/105 |
| Nav Lost & Found | 2/9 | Lost & Found | lista + filter | Evidencija pronađenog | section | Funkcionalno | CDP | Status filter |
| `#ops-plan-health` | 3 Cockpit | Daily plan has gaps | daily pick | Upozorenje na nepokriven plan | klik → daily pick | Funkcionalno | k02, k08 | |
| Group card Line 101 | 3/5 | Group hub | `#dispatcher-group-hub` | Upravljanje grupom | openGroupHub | Funkcionalno | k06 | Drivers/Buses/Plans |
| KPI Unread / Live Issues | 3 | deep links | messages / reports | Brzi skok na problem | switchSection | Funkcionalno | k02 | |
| See all (reports/plan) | 3 | See all | reports / daily | Više stavki | switchSection | Funkcionalno | k02 | |
| Resolve now `urgent-action` | 3/4 | Resolve now | attention panel ILI daily pick | Rešavanje hitnog problema | Ako nema incident stavki → toast + daily pick (Ultimate §8) | Funkcionalno | k08 | Nije bug — namerno |
| Assign / Edit crew | 3 | Assign / Edit | lokalni state | Dodela vozača na smenu | opsAssignDriver | BLOCKED | k02 | UI postoji; full save nije forsiran |
| Vehicle out / Problem | 3 | incident shortcuts | reports/attention | Brzi put ka problemu | buttons | Funkcionalno | snapshot post-rebuild | |
| Daily Back / Claim lock / date | 4 | Back, Claim lock, date | hub / lock / dan | Kontrola izmene plana | UI | Funkcionalno / BLOCKED | k05 | Claim lock nije držan (mutacija) |
| Daily empty state | 4 | No shifts… | tekst | Kaže šta uraditi (import) | STATIC-OK | Svesno statično | k05 | Istinit empty |
| Group hub Back | 5 | Back to Hub | ops/dashboard | Povratak | closeGroupHub | Funkcionalno | k06 | |
| Hub Drivers Edit/Activate | 5/6 | Edit / Activate | driver edit | Kontrola pristupa vozača | actions | Funkcionalno | CDP inventory | |
| Hub Add bus / import / Deactivate | 5/7 | Buses | bus CRUD | Operativni park po grupi | forms | Funkcionalno | CDP | |
| Hub Daily/Monthly open | 5 | Open full plans | plan screens | Plan bez CA EID-a | openDaily/Monthly | Funkcionalno | CDP | |
| Package import dropzone | 5 | Drop files | import | Paketni uvoz | dropzone | Funkcionalno (UI) | CDP | File picker Live View BLOCKED |
| Messages Send | 9 | Send message | lokalno/demo msg | Obaveštavanje vozača | form submit | Funkcionalno (UI) | CDP | Full send nije forsirano |
| `#dispatcher-vacations` | 9 | Vacation Requests | sekcija iz `#dispatcher-nav` | Odobravanje odmora | nav → switchSection → approve/reject | Funkcionalno | k10-ops-nav-vacations.png | **U glavnom nav-u** (overnight fix) |
| Brand / version footer | shell | BusCommand v1.0.10 | — | Identitet | STATIC | Svesno statično | k02 | |

## RBAC spot

| Provera | Rezultat |
|---------|----------|
| Dispo vidi Help | PASS (k03) |
| CA ne vidi Help | PASS (e2e `dispatcher-help` 2/2) |
| CA nav sakriven za Dispo | PASS (CDP `caNavHidden: true`) |
