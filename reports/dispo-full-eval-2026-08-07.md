# Dispo — kompletna ocena (2026-08-07)

Demo: `staff.html?mode=demo` · dispečer Line 101 · lokalni server :8766  
Artefakti: `reports/dispo-eval-live-pass.json`, `reports/dispo-eval-shots/`, e2e logovi pass1/pass2.

## Testovi

| Provera | Rezultat | Napomena |
|---------|----------|----------|
| Unit | **569 / 572** | 3 brittle source-string testa zastarela posle UX promena |
| E2E Dispo+UI (pass 1) | **47 / 50** | 3 pada: zastareo free-text reason, stress očekuje ≥5 kartica, Close visibility race |
| Core Dispo (pass 2) | **8 / 8** | guided incident, soft-remove, help — stabilno |
| Live click inventory | OK | sve nav sekcije otvorene; screenshots snimljeni |

Unit padovi nisu “aplikacija ne radi”, već kontrakt testovi na stari tekst:
- `ops-incident-reason` (sada `#ops-incident-reason-code` select)
- `subtitle.textContent = items.length` (sada progress `1 of N`)
- `saveState(` u monthly (ponovo uvezen zbog demo change-reason audita)

## Inventar — šta disponent stvarno ima

### Navigacija (9 stavki)
1. **Operations center** — jutarnji cockpit  
2. **Daily plan** → picker grupe → full plan  
3. **Monthly plan** → picker → matrica  
4. **Vehicles** — flota linije + soft-remove  
5. **Messages** — personal / group  
6. **Map** — Leaflet GPS (demo)  
7. **Problem reports** — tabela prijava  
8. **Lost & Found**  
9. **Vacation Requests**  

### Van navigacije (postoji u DOM, teško / drugačije otkrivanje)
- `dispatcher-group-hub` — nema u nav; “Click for group management” na Ops kartici vodi na **daily plan**, ne hub  
- `dispatcher-shifts`, `dispatcher-daily-schedule` — orphan sekcije  
- Needs attention sheet — overlay, ne nav item  

### Ključni tokovi provereni
| Tok | Stanje |
|-----|--------|
| Plan gap → banner → Needs attention → Assign bus → Apply | Radi (live + e2e guided) |
| Driver sick: dropdown razlog → plan sick → attention | E2E 2/2 |
| Bus AC/breakdown: dropdown → bus status → attention | E2E 2/2 |
| Soft-remove bus/driver sa linije (ostaje u firmi) | E2E 4/4 |
| Clear daily shift + reason confirm | E2E OK |
| Claim edit lock na daily | UI prisutan |
| Monthly day edit / create empty plan | UI prisutan |
| Vehicles Edit / Remove from line / Deactivate | UI prisutan |
| Messages šabloni + send | UI prisutan |
| Vacation Approve/Reject | Dugmad postoje; **demo red pokvaren** (`—`, `undefined days`) |
| Reports tabela vs Ops alerts | **Nesinhron** — Ops vidi gap, Reports kaže prazno / “No drivers…” |
| Group Hub | **Teško otkrivanje** |
| Daily “Situation overview” aside | **Uvek hidden** |
| Bulk plan import (hub) | Namerno deferred (CA) |

## Ocene (1–10) — za austrijskog disponenta

| Dimenzija | Ocena | Zašto |
|-----------|------:|-------|
| **Izgled** | **7.0** | B/B2 je čist, tamni ops, jasan “Resolve now” / attention sheet. Kvari ga: raw i18n ključ (`vehicles_panel_sub_group`), kontradiktorni KPI (2 Buses vs 0 Active Buses), vacation tabela. |
| **Funkcionalnost** | **7.5** | Jezgro (plan → problem → razlog → rešenje) je stvarno. Soft-remove i guided reason su pravi dispo alati. Sporedni moduli (reports sync, vacations demo, hub, orphan pages) zaostaju. |
| **Upotrebna vrednost** | **7.5–8.0** | Za **jednu liniju, jutarnji gap/kvar/bolovanje** — da, može da radi. Za **gužvu sa 5+ paralelnih incidenata** — jedan-po-jedan sheet je dobar fokus, ali testovi/stres i sekundarni ekrani još nisu “max nivo”. |
| **Ukupno** | **7.5** | Pilot-spremno za jednu grupu; nije još “svaki klik savršen”. |

## Šta je najjače (moje mišljenje)

1. **Jedan panel za ispravke** — problem + solution + Apply na istom mestu. To je prava dispo vrednost.  
2. **Dropdown razlog** umesto eseja — brzo, auditabilno, usklađuje plan.  
3. **Soft-remove sa linije** — tačno ono što si tražio (lista vs firma).  
4. **Daily lock + health banner** — svesti o konfliktu i o “šta je pokvareno”.  

## Šta najviše smeta disponentu

1. **KPI lažu oči** — “2 Buses” na kartici grupe vs “0 Active Buses” u statistikama.  
2. **Reports ≠ Ops** — prazna tabela dok banner viče “No bus”. Gubi poverenje.  
3. **Group Hub skriven** — copy kaže “group management”, akcija otvara daily.  
4. **Vacation demo red** — `undefined days` izgleda kao bug u produkciji.  
5. **i18n rupa** na Vehicles.  
6. **Stari e2e/unit** nisu uhvatili novi B2 (jedna kartica + select) — signal da QA još mora da stigne UX.

## Preporuka prioriteta (sledeće, ne sada bez tvog “da”)

1. High — uskladiti Live Issues / Reports / Attention na isti izvor istine  
2. High — popraviti vacation red + missing i18n  
3. High — ažurirati cockpit/stress e2e na dropdown + single-card attention  
4. Medium — Group Hub u nav ili iskren CTA (“Open daily plan”)  
5. Medium — Situation aside: uključiti ili ukloniti  
6. Low — orphan `dispatcher-shifts` / daily-schedule očistiti ili spojiti  

## Ograničenja ove ocene

- Lokalni **demo**, ne Firebase produkcija.  
- Jedna linija (101), 2 vozača / 2 busa u live prolazu.  
- Nije meren konkurentan rad dva disponenta.  
- Vizuelna ocena iz screenshot + live DOM, ne WCAG alat.
