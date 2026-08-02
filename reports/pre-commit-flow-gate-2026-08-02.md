# Pre-commit gate — tok pre linija koda

Datum usvajanja: **2026-08-02**  
Status: **zaključano** (vlasnik: „idemo 1. pa 2. pa 3“)

Cilj: Swiss-watch. Commit nije dozvoljen samo zato što „ima redova“.

## Obavezno pitanje za svaku izmenu

1. Da li svaka nova/izmenjena **akcija** ima jasnu funkciju?
2. Da li ta funkcija ima **kompletan tok**?
3. Da li taj tok **rešava stvarni problem** (happy + fail put)?

## Kompletan tok (minimum)

`UI → validacija → auth/RBAC → API → baza/transakcija → audit → osvežavanje UI → greška/uspeh`

Rupa u lancu = **nije gotovo** = nema commit-a te stavke.

## Gate checklist (pre svakog commit-a)

| # | Provera | Prolazi ako |
|---|---------|-------------|
| A | `npm run lint` | 0 grešaka |
| B | `npm run test:unit` | svi zeleni; novi tok ima ≥1 relevantan test |
| C | `npm run build` | uspešan |
| D | Tok-inventura u commit poruci / belešci | svaka dirnuta akcija ima UI→…→audit (ili eksplicitno „docs-only“) |
| E | Smoke (browser / Playwright / lokalni demo) | ≥1 happy + ≥1 fail za UI feature |
| F | Zaključane odluke | ne krši CA uvid / dispo operacija / jezike / verzije |

**Commit zabranjen** ako UI feature nema E, ili D pokazuje rupu.

## Šta NIJE dokaz funkcije

- Samo lint / build
- Samo „kod postoji“
- Placeholder dugme / toast bez serverske potvrde

## Izuzeci (uski)

- Čista dokumentacija / odluke → A opciono, B/C/E ne moraju; D = `docs-only`
- Refaktor bez ponašanja → A–C + napomena „no behavior change“; E ako dirnuti UI tokovi

## Posle gate-a

Tek onda: commit → (po dogovoru) push/PR. Bez gate-a nema „gotovo“.
