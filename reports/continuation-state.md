# BusCommand — trajna tačka nastavka

Poslednje osvežavanje: **2026-08-02** (Europe/Vienna)

## Aktivni cilj

Završiti pripremu **v1.0.10**, zatim disponent bus-uvoz (kurirani formati) i Poglavlje 2. Kvalitet: Swiss-watch.

## Kanonska lokacija

| Stavka | Vrednost |
|--------|----------|
| Folder | `C:\Users\cane\Desktop\BusCommand` |
| Remote | `https://github.com/canicboban-source/BusCommand.git` |
| `main` baza | `ff7832d` — v1.0.1 |
| Radna grana | `work/ch1-state-checkpoint` |
| Verzija u radu | **1.0.10** |
| Master prompt | `docs/BusCommand-MASTER-PROMPT.md` (v3.1) |

## Zaključane odluke vlasnika

1. Kanonski repo: **BusCommand** (ne Preview).
2. Verzije: važna izdanja **+10** → **1.0.10**.
3. **Jezik:** baza/fallback **EN**; kompletan izbor **EN / DE / SR**; dodatna sučelja po potrebi.
4. Lozinke: min **6** (sada). Jačanje pre hard-pilota = posebna odluka.
5. Ne portovati slepo Preview-Local diffove.
6. **Autobusi:** disponent uvoz + održavanje; CA **samo uvid** (bez write).
7. **CA šef / disponent operacija:** CA nije nonstop online; disponent vodi grupu (planovi, vozači u planu, autobusi, zamene, poruke).
8. **Usvojeno 2026-08-02 (review 1–5):**
   1. CA na **dnevnom/mesečnom planu i autobusima** = **samo uvid (read-only)**, bez write / bez „kontrole“ kao edit.
   2. Bus uvoz = **kurirani formati**: TXT, CSV (`,`/`;`), XLSX, paste + **preview/potvrda**. Novi format tek uz primer fajla firme.
   3. **First-writer lock:** prvi koji menja zaključava ostale; on može dalje. Obavezno: **TTL**, **release** od vlasnika lock-a, **break-glass** CA/SA (skida lock + razlog + audit, **bez** CA edit plana).
   4. „Zamrzni grupu“ = **kasnije** (backlog).
   5. Lozinke min 6 ostaju do posebne odluke pre hard-pilota.
9. **Pre-commit tok-gate (2026-08-02):** pre svakog commit-a — funkcija → kompletan tok → dokaz da rešava problem. Artefakt: `reports/pre-commit-flow-gate-2026-08-02.md`. Lint/unit/build + tok-inventura + smoke (happy+fail) za UI. Bez gate-a nema „gotovo“.

Ranije zaključano:

- Uvoz plana smena = BusCommand XLSX + CSV + strukturirani BC PDF (opcija 1).
- Vozač = PWA; staff = desktop.
- Soft pilot: SMS none, confirmation scheduler OFF, support session flag, live GPS OFF dok legal/owner ne odobri.

## Matrica (posle usvajanja)

| Resurs | CA | Disponent |
|--------|----|-----------|
| Firma, grupe, tim, brending | Piše | Ne |
| Kreiranje vozača / aktivacija | Piše | Ne |
| Zvanični katalog smena | Uvoz + potvrda | Koristi |
| Dnevni / mesečni plan | **Samo uvid** | **Piše** (+ first-lock) |
| Autobusi | **Samo uvid** | **Piše + kurirani uvoz** |
| Poruke / SOS / incidenti | Uvid gde treba | Operiše |
| Plan lock break-glass | Skida lock + audit | Drži / release |

## Trenutni redosled

1. ✅ Poglavlje 1 state checkpoint
2. ✅ Odluke 1–5 usvojene
3. ✅ Priprema **v1.0.10** (verzija + EN default) — unit/lint/build zeleni
4. ✅ Disponent bus-uvoz — unit + **Playwright smoke 2/2** (`reports/smoke-bus-import-2026-08-02.md`)
5. ⏳ Poglavlje 2 (CA uvid-only plan, first-lock)

## Artefakti odluka

- `reports/decision-ca-boss-dispatcher-ops-2026-08-02.md`
- `reports/decision-buses-dispatcher-import-2026-08-02.md`
- `reports/decision-review-legal-logic-2026-08-02.md`
- `reports/decision-1-5-adopted-2026-08-02.md`
- `reports/pre-commit-flow-gate-2026-08-02.md`
- `reports/poglavlje-1-state-checkpoint-2026-08-02.md`
- `reports/smoke-bus-import-2026-08-02.md`
