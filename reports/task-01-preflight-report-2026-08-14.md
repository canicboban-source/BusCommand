# TASK-01-CLEAN-SLATE-AND-SU-CREDS — Pre-flight i verifikacija (2026-08-14)

**Grana:** `staging/phase-3-isolation` · **HEAD:** `c267f97` · **Ahead:** 2, nije push-ovano
**Izvršilac:** Claude (Cowork, cloud sandbox + read/write most ka `C:\Users\cane\Desktop\BusCommand-ca-monthly-import`)
**Status:** tačke 1 i 2 izvršene sa dokazom. Tačke 3–5 blokirane — vidi §5.

---

## 1. Pre-flight — stvarno stanje repoa

| Provera | Rezultat |
|---|---|
| Grana | `staging/phase-3-isolation` ⟶ `origin/staging/phase-3-isolation [ahead 2]` ✔ |
| HEAD | `c267f97 chore: normalize line endings to LF` ✔ |
| Prethodni | `fda11b1 feat(sa): guarded missing Company Admin recovery (B2C-01-R1-F1)` ✔ |
| Modifikovani tracked fajlovi | 0 ✔ |
| Staged | 0 ✔ |
| **Untracked** | **NIJE 0** — vidi §1.1 |

### 1.1 Odstupanje od prijavljenog stanja: `git status` nije čist

`git status --porcelain` prijavljuje veliki broj untracked fajlova:

- **67 × `.fuse_hidden*`** artefakata, po direktorijumima `css/`, `js/`, `js/admin/`, `js/core/`,
  `server/`, `reports/`, `tests/e2e/`, `tests/rules/`, `tests/unit/`.
  Poreklo: FUSE mount (fajl obrisan dok je bio otvoren). Nisu deo koda i **ne smeju ući ni u jedan commit**.
- **~250 untracked fajlova u `reports/`** (izveštaji, `.txt` logovi, `*-shots/` direktorijumi) i
  **~55 untracked `.mjs` skripti u `scripts/`** (visual-trail, pack-artifacts, d17-measure iz faza 0–3).
- `public/LOGO PREDLOG.jpeg`

Po dogovoru: **ništa nije menjano ni brisano.** Komanda za čišćenje artefakata je u §6.
Napomena: most ka računaru **ne može da briše** fajlove — brisanje mora ručno.

### 1.2 Blokada za lokalno izvršavanje build-a preko mosta

`node_modules/` u radnom folderu sadrži **isključivo Windows binarije**:
`@esbuild/win32-x64`, `@rollup/rollup-win32-x64-gnu`, `@rollup/rollup-win32-x64-msvc`.
Most ka računaru radi u Linux VM-u **bez mrežnog pristupa**, pa `vite build` tamo ne može da se pokrene
niti se mogu doinstalirati Linux binarije.

**Odluka vlasnika:** build i unit testovi izvršeni u cloud sandboxu nad kopijom izvornog koda
(bez `node_modules/`, bez `reports/`, bez `dist/`), uz `npm ci` iz **istog `package-lock.json`**.
CRLF završeci iz radnog stabla su očuvani u kopiji, pa su ulazi u bundler identični lokalnim.

---

## 2. Tačka 1 — `npm run build` + D17 staff headroom ✅

```
komanda : npm ci && npm run build
okruženje: cloud sandbox, node v22.22.2, npm 10.9.7
EXIT    : 0
vite    : ✓ built in 2.07s
```

Lanac koji je prošao: `check-no-secrets` → `clean-dist` → `build-surface-html` → `ensure-favicon`
→ `vite build` → `copy-static-to-dist` → `check-firebase-isolation` → `check-bundle-budgets`.

### 2.1 D17 bundle budgets (`scripts/check-bundle-budgets.js`)

| Budžet | Izmereno | Limit | Headroom |
|---|---:|---:|---:|
| driver app JS excl. translations | 173 241 B | 225 280 B | **52 039 B** |
| **staff app JS excl. translations** | **572 596 B** | **581 632 B** | **9 036 B** |
| largest non-translations driver chunk | 140 548 B | 153 600 B | 13 052 B |
| translations chunk | 349 563 B | 377 856 B | 28 293 B |

> **Kriterijum D17 staff headroom ≥ 8 192 B → ISPUNJEN (9 036 B, rezerva 844 B).**
> Rezerva je tanka: svaka nova sinhrona zavisnost u staff bundle-u od ~0,9 kB obara gate.

`Firebase isolation check passed for source and build output.` · `Bundle budgets OK (D17 soft-pilot).`

---

## 3. Tačka 2 — `npm run test:unit` do kraja ⚠️ EXIT=1

```
komanda : npm run test:unit   (node --test tests/unit/**/*.test.js tests/unit/**/*.test.mjs)
EXIT    : 1
# tests 875   # pass 871   # fail 4   # skipped 0   # todo 0
# duration_ms 36478.9
```

Prethodno prijavljenih „358+ prolazi (nije do kraja)" je potvrđeno i **dovršeno**: paket ide do kraja,
ali se **ne završava zeleno**. Četiri pada, sva četiri analizirana do uzroka:

| # | Test | Fajl | Uzrok |
|---|---|---|---|
| 530 | `2R-B: built staff.html must not modulepreload plan-import chunk` | `tests/unit/phase2r-b-lazy-plan-import.test.js:39` | Preširok regex |
| 538 | `2R-B.1 D: plan-import stays lazy; staff.html must not modulepreload it` | `tests/unit/phase2r-b1-lazy-chunk-recovery.test.mjs:217` | Isti uzrok kao 530 |
| 599 | `SA toast paths use i18n keys instead of hardcoded EN status strings` | `tests/unit/poglavlje-16-i18n-a11y.test.mjs:42` | Zastareo target fajla |
| 698 | `demo company status becomes active when a CA exists` | `tests/unit/sa-demo-company-status.test.mjs:10` | Assert na oblik implementacije |

### 3.1 Nalaz 530 / 538 — lazy contract je ISPRAVAN, test je preširok

Testovi zabranjuju bilo koji `modulepreload` href koji matchuje `/plan-import/i`.
Stvarno stanje `dist/staff.html`:

- `plan-import-fB0WDfUf.js` (**22 315 B**, stvarni plan-import chunk) — **NIJE preload-ovan** (0 pojava) ✔
- `plan-import-loader-zjek5rUW.js` (**2 119 B**) — jeste preload-ovan, i regex ga hvata

`js/dispatcher/plan-import-loader.js` je generički `createLazyModuleLoader` (race-safe wrapper,
faza 2R-B.1/2R-B.1.1). Ne sadrži logiku uvoza plana — samo dinamički `import()`.
**Lazy ugovor nije prekršen**; test je napisan pre nego što je loader dobio ime sa prefiksom `plan-import-`.

### 3.2 Nalaz 599 — i18n ključ postoji, ali u drugom fajlu

Test čita samo `js/admin/superadmin.js` i traži `t("sa_pin_length_error")`.
Ključ danas živi u **`js/admin/sa-create-company-flow.js`** (lazy chunk izdvojen u B2C-01).
Provereno grep-om: ključ postoji u kodu → **nema hardkodovanog EN stringa**, test cilja stari fajl.

### 3.3 Nalaz 698 — ponašanje očuvano, assert vezan za stari oblik koda

Od četiri asserta u testu:

- `function _demoCompanyHasAdmin(` → postoji (`superadmin.js:431`) ✔
- `_demoCompanyHasAdmin(companyKey)` → postoji (`superadmin.js:444`) ✔
- `/Creating a CA means the firm is no longer/` → **ne postoji nigde u `js/`** (komentar preformulisan u
  `// Active once a CA exists for the firm, or the lead account finished first login.`) ✘
- `companyDisp.status = "active"` → **ne postoji** ✘ (logika izmeštena u `_demoCompanyStatus()` koji vraća `"active"`)

Funkcionalno pravilo („firma je aktivna čim CA postoji") je **implementirano i čitljivo u kodu**.
Test proverava tekst komentara i staru dodelu polja.

### 3.4 Klasifikacija sva 4 pada

Dokazi pokazuju **zastarela test-tvrđenja posle refaktora 2R-B.1 i B2C-01**, ne funkcionalnu regresiju.
Ni jedan pad ne pokazuje promenu ponašanja aplikacije.
**Ipak nisu ispravljeni bez odobrenja** — ispravka menja testove, a pravilo projekta je da se test ne
prilagođava kodu bez izričitog razloga. Predlozi u §6.

---

## 4. Bezbednosni nalaz nastao tokom pre-flight-a

**`.env` je bio uključen u prenos.** `tar` je pokupio `.env` (198 B) jer je gitignore-ovan, a ne
tar-excluded. **Odmah je obrisan iz cloud kopije pre `npm ci` i pre bilo kakvog builda**, nije zapisan
ni u jedan izveštaj, log ni artefakt. Nijedna vrednost iz njega nije pročitana ni prikazana.
Preporuka: rotirati sve što je u `.env` ako je reč o živim ključevima — jer je fajl nakratko postojao
van tvoje mašine. **Odluka je tvoja; ja ne mogu da procenim koliko su te vrednosti osetljive.**

---

## 5. Tačke 3–5 — BLOKIRANE, uz konflikt u samim skriptama

### 5.1 Ne mogu ih izvršiti

Sve tri tačke traže Firebase Admin SDK + mrežu + tajni ključ. Most ka tvom računaru **nema mrežu**,
a ključ **ne sme** u cloud sandbox. → **Ovo pokrećeš ti, lokalno.**

### 5.2 Kritičan konflikt: `GOOGLE_APPLICATION_CREDENTIALS` NEĆE raditi

Plan je bio `GOOGLE_APPLICATION_CREDENTIALS → C:\Users\cane\.secrets\firebase-admin-key.json`.
**Nijedna od tri skripte ne čita tu promenljivu.** Sve tri traže ključ na fiksnoj putanji:

```js
const SERVICE_ACCOUNT_PATH = path.join(ROOT, "firebase-admin-key.json");   // = koren repoa
```

(`scripts/set-claims.js:13`, `scripts/purge-all-companies.js:15`, `scripts/wipe-company-ops.js:13`)

A `scripts/check-no-secrets.js` **obara build** ako taj fajl postoji u korenu repoa
(`FORBIDDEN_BASENAMES` uključuje `firebase-admin-key.json`).

> Dakle: sa ključem u korenu — admin skripte rade, `npm run build` pada.
> Bez ključa u korenu — build prolazi, admin skripte odmah izlaze sa `❌ ... nije pronađen`.
> **Ne postoji trenutno stanje u kome oboje radi.** Ovo mora da se razreši pre tačaka 3–5.

### 5.3 Rizik: `purge-all-companies.js` nema proveru ciljnog projekta — **High**

Skripta uzima projekat isključivo iz service-account ključa i briše **sve** firme
(`deleteCompanyAtomic`, uključujući Auth korisnike) čim dobije `--yes`. Nema ispisa `project_id`,
nema potvrde da je cilj `buscommand-preview`, nema dry-run. Pogrešan ključ = nepovratan gubitak
podataka u pogrešnom projektu. `.firebaserc` pokazuje `buscommand-preview` za `default` i `staging`,
ali `.firebaserc` **ne utiče** na Admin SDK.

---

## 6. Predlozi (bez izvršenja — čekam odluku)

**A. Kredencijali (blokira tačke 3–5) — max 3 opcije**

1. **Zajednički resolver (preporuka).** Novi `scripts/_admin-credentials.js`: prvo
   `process.env.GOOGLE_APPLICATION_CREDENTIALS`, pa fallback na koren repoa, uz obavezan ispis
   `project_id` i `--expect-project buscommand-preview` guard za destruktivne skripte.
   Tri skripte prelaze na njega. Ključ ostaje van repoa, `check:secrets` ostaje zelen trajno.
   Cena: izmena koda + unit test.
2. **Ručni „prozor".** Kopiraš ključ u koren repoa → pokreneš admin skripte → **obrišeš ključ** → tek onda build.
   Bez izmene koda, ali build je slomljen dok ključ stoji i oslanja se na disciplinu. Rizik ljudske greške.
3. **Hardlink** (`mklink /H`) iz korena repoa na `.secrets` fajl. Ne rešava ništa — `check-no-secrets`
   vidi fajl u korenu isto kao kopiju. **Ne preporučujem.**

**B. Četiri pala testa — max 3 opcije**

1. **Uskladi testove sa stvarnim ugovorom (preporuka).** 530/538: suziti assert tako da zabranjuje
   preload stvarnog `plan-import` chunk-a, a eksplicitno dozvoli `plan-import-loader` — plus novi
   assert da `plan-import-<hash>.js` nikada nije preload-ovan (ojačava, ne slabi ugovor).
   599: čitati i `sa-create-company-flow.js`. 698: assert na `_demoCompanyStatus(...) === "active"`
   umesto na tekst komentara.
2. **Promeni build tako da loader ne bude preload-ovan** (npr. preimenovanje chunk-a ili `manualChunks`).
   Testovi ostaju netaknuti, ali menjaš izlaz builda zbog imena fajla — i troši D17 headroom.
3. **Ostavi crveno i dokumentuj kao poznato odstupanje.** Ne preporučujem: release gate traži zelen unit paket.

**C. Higijena repoa (nije izvršeno, po tvojoj odluci)**

```powershell
# 67 FUSE artefakata — pregled pa brisanje
Get-ChildItem -Recurse -Force -Filter ".fuse_hidden*" | Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object FullName
Get-ChildItem -Recurse -Force -Filter ".fuse_hidden*" | Where-Object { $_.FullName -notmatch "node_modules" } | Remove-Item -Force
```

Moji artefakti prenosa premešteni su u **`_to_delete\`** u korenu repoa (`_cloud-transfer.tgz`,
delimičan log). Slobodno obriši ceo taj folder — most ne može da briše.

---

## 7. Komande sa dokazom

| # | Komanda | Gde | EXIT |
|---|---|---|---|
| 1 | `git status --porcelain=v1 -b` / `git log --oneline -10` | tvoj disk (read-only) | 0 |
| 2 | `npm ci` | cloud kopija | 0 |
| 3 | `npm run build` | cloud kopija | **0** |
| 4 | `npm run test:unit` | cloud kopija | **1** (871/875) |

Pun izlaz testova: `reports/task01-unit-cloud-2026-08-14.txt`.

---

## 8. Ocena

| Stavka | Ocena /10 | Obrazloženje |
|---|---:|---|
| TASK-01, tačka 1 (build + D17) | **9** | EXIT 0, headroom 9 036 B ≥ 8 192 B. Minus 1: dokaz iz clouda, lokalna potvrda tek predstoji. |
| TASK-01, tačka 2 (unit do kraja) | **7** | Paket dovršen sa exit kodom i puna dijagnostika 4 pada. Nije zeleno. |
| TASK-01, tačke 3–5 (SU creds + clean slate) | **1** | Nije započeto; otkriven blokirajući konflikt kredencijala. |
| **Ukupna spremnost projekta** | **4** | Build i skoro ceo unit paket stoje, ali: unit nije zelen, clean slate nije izvršen, SA nalog ne postoji, `purge-all` nema zaštitu projekta, e2e/rules/browser QA neproveravani u ovom prolazu. |

**Tačan sledeći korak:** odluka po §6.A (kredencijali) i §6.B (testovi).
Bez §6.A tačke 3–5 se ne mogu ni započeti.

---

*Ovaj izveštaj beleži samo ono što je stvarno pokrenuto i pročitano. Ništa u repou nije izmenjeno:
0 fajlova promenjeno, 0 commit-ova, 0 push-eva.*
