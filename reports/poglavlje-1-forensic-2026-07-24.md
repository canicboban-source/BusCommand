# Poglavlje 1 — Forenzički pregled (početni)

Datum: 2026-07-24  
Projekat: `C:\Users\cane\Desktop\BusCommand-Preview-Local`  
Grana: `work/master-prompt-ch1` (kreirana sa postojećim WIP; bez commit-a)  
Master prompt: `.cursor/rules/buscommand-master.mdc` + `docs/BusCommand-MASTER-PROMPT.md`

## Git / checkpoint

| Stavka | Vrednost |
|--------|----------|
| Prethodna grana | `main` (ahead of `origin/main` za **11** commit-a) |
| HEAD commit | `c7aba59` — Redesign company shift plan workspace |
| `origin/main` | `9455f3e` — Fix secure superadmin overview counts |
| Radno stablo | **Prljavo** — ~167 promenjenih/nepraćenih putanja (surface split, CA, ops, E2E, docs…) |
| `AGENTS.md` | **Ne postoji** u root-u (spominje se u `reports/continuation-state.md`) |

Poslednjih 10+ commit-a na `main` pre WIP: od hardening vozača/CA service plan do `c7aba59`.

**Rizik:** sav surface-split / ops / CA multi-format rad još **nije commitovan**. Gubitak radnog stabla = gubitak napretka. Checkpoint commit preporučen čim vlasnik odobri.

## Šta postoji (mapa)

- **Stack:** Node 22 / Express (`api-server.js` + `server/`), Vite 6 ESM frontend, Firebase Admin + Firestore rules, Playwright + `node --test`, Render (`render.yaml`).
- **Površine:** `driver.html` (PWA), `staff.html` (SA/CA/dispo), `index.html` chooser, legacy `index.legacy-monolith.html`.
- **Uloge u kodu:** superadmin, company-admin, dispatcher, driver.
- **Dokumentacija:** `README.md`, `PRODUCT-SCOPE.md`, `docs/ADR-001-surface-split.md`, `docs/SURFACE-SPLIT-PROGRESS.md`, `docs/OPS-CENTER-EDIT.md`, `reports/continuation-state.md`, `reports/full-pages-audit-2026-07-20.md`.
- **Testovi:** bogat `tests/unit/`, E2E `ui-smoke` (poslednje lokalno **30/30** 2026-07-24), `tests/rules/firestore.rules.test.js` (emulator; ranije Java ograničenja).

## Šta radi (dokazano / dokumentovano)

- Surface split driver/staff + PWA stubovi (ADR + progress).
- CA moduli: overview, branding, groups, team, drivers, settings, service plans, audit (unit + delimično E2E).
- Service plan ugovor `BUSCOMMAND-DIENSTPLAN-1`: XLSX kanonski + CSV twin + **strukturirani** BusCommand PDF šablon (ne proizvoljni firmi PDF).
- Ops centar: Reši/Dodeli + edit bus/shift (vidi `docs/OPS-CENTER-EDIT.md`) — ograničen opseg, ne pun mockup problem-resolution state machine.
- E2E smoke usklađen sa surface split-om.

## Šta je nepotpuno vs master prompt

| Oblast | Gap (iskreno) |
|--------|----------------|
| Super Admin „maksimalna kontrola“ | Pregled postoji; nema pun lifecycle tenant / support session / scheduler health kao u §3.1/§16 |
| Jedan kanonski model plana | Dnevni/mesečni moduli postoje; nije dokazan jedinstven concurrency/audit model iz §5 |
| Problem-resolution tok §8 | Delimičan (ops Reši/Dodeli), ne pun 10-korak workflow |
| Potvrde smene + petak/vikend scheduler §9 | Delimična privatnost radnih sati; pun idempotentni scheduler nije potvrđen |
| GPS lifecycle §12 | Postoji kod; pravni/DPIA gate i strogi prozor nisu „release ready“ |
| SMS aktivacija §4 | Adapter/stub očekivanje; produkcioni provajder nije izabran |
| Arbitrary firm PDF import §6 | **Konflikt** sa postojećom odlukom (XLSX kanonski) — vidi dole |
| RBAC matrica artefakt | Nije formalno izvezena kao `uloga × resurs × …` |
| Čist produkcioni projekat §1.3 | Demo login/PIN i dalje u README i demo mode (namerno za preview) |
| Legal readiness paket §22/§29 | Nije kompletan paket artefakata |

## Poslovna odluka — uvoz plana (zaključano 2026-07-24)

**Vlasnik proizvoda izabrao opciju 1.**

Produkcioni / pilot uvoz kataloga smena koristi **samo BusCommand ugovor** `BUSCOMMAND-DIENSTPLAN-1`:

| Format | Status |
|--------|--------|
| XLSX šablon | ✅ kanonski |
| CSV twin | ✅ |
| Strukturirani BusCommand PDF šablon | ✅ |
| Proizvoljni firmi PDF / XLS / TXT | ❌ namerno van obima |

Master prompt §6 tumačiti kao: uvoz **zvaničnog plana firme** kroz naš šablon (PDF/XLSX/CSV), ne kao obavezu da se parsira proizvoljni izvorni PDF svakog prevoznika.

Adapter za konkretan spoljni format = nova poslovna odluka + primer fajla (ranija opcija 2).

## Ocene (dokazano, ne marketinški)

- Napredak Poglavlja 1: **7/10** — forenzika, gap matrica, data-flow i legal open lista gotovi; WCAG sistemski audit i pun inventory svih API ruta još nisu.
- Ukupna spremnost projekta ka pilotu: **~4/10** (nepromenjeno: jak WIP, Critical gapovi ostaju).

## Artefakti Poglavlja 1

| Fajl | Sadržaj |
|------|---------|
| `reports/poglavlje-1-forensic-2026-07-24.md` | Git / mapa / rizici |
| `reports/poglavlje-1-gap-matrix-2026-07-24.md` | § vs kod statusi |
| `reports/poglavlje-1-dataflow-2026-07-24.md` | Površine + tokovi |
| `reports/poglavlje-1-legal-open-2026-07-24.md` | Legal open + izvori |

## Sledeći logičan korak

1. ~~Opcija 1 uvoz.~~ zaključano  
2. ~~Checkpoint commit.~~ `bb6c4aa`  
3. ~~Gap + data-flow + legal.~~  
4. **Poglavlje 2** — prioritet redom: (a) ukloniti/`replace` shared `123456` OTP dizajn, (b) RBAC matrica artefakt, (c) kanonski roster + concurrency sketch/implementacija.  
5. Pre live GPS — legal L1.

## Komande (ova sesija)

- Explore forenzika (roles/plan/driver) — read-only  
- Artefakti upisani u `reports/poglavlje-1-*.md`  
- Unit/lint **nisu** re-run u ovom koraku
