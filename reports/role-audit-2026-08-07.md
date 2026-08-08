# Role audit — SA (prava/nalozi) → CA → Dispo — 2026-08-07

Screenshoti: `reports/role-audit-2026-08-07/` (01–14).  
Demo: `staff.html?mode=demo`

| Uloga | Login |
|-------|--------|
| **SA** | `sa@demo.local` / `sa-demo-ok` |
| **CA** | `admin@demo.com` / `demo123` |
| **Dispo** | `demo@buscommand.com` / `demo123` |

---

## 1. SA — prava i nalozi (RAI / Super Admin)

### Ocena: **7.5 / 10** (prava/bezbednost naloga)

### Šta radi
- Kreiranje firme, suspend/activate, typed delete
- Kreiranje CA naloga, disable (prod), demo delete
- Company detail + soft plan/limits/flags
- Support sesija (prod); demo stealth odvojeno
- Ne vidi EID/PIN / `driver_credentials` (Firestore rules)
- Ne može da mintuje drugog SA preko API

### Šta fali / rizik (zakon & pravo / MASTER §4)
| # | Nalaz | Prioritet | Status |
|---|--------|-----------|--------|
| S1 | SA→CA lozinka bila slabija od CA→Dispo (samo min 6) | High | **Popravljeno** — letter+digit server+UI |
| S2 | MFA za privilegovane uloge nije implementiran | High (prod gate) | Ostaje — dokumentovano defer |
| S3 | Nema tenant export pre purge | Medium | Preporuka |
| S4 | Soft license, nema pravog billinga | Low (by design) | OK za soft-pilot |
| S5 | Demo PIN reset → `1234` | Low (demo only) | Ne dirati u prod UI |

### Popravke urađene
1. `server/validation.js` — `createUserBody` password: min 6 + slovo + broj  
2. `js/admin/superadmin.js` — ista provera u UI  
3. Placeholder na SA create-admin formi usklađen sa `ca_team_password_placeholder`  
4. Unit test za slabu lozinku  

### Preporuke (sledeći potezi)
1. **MFA** za SA i CA pre produkcije (MASTER release gate).  
2. **Export/anonymize** pre firm purge (GDPR-style).  
3. Odvojiti SA login vizuelno od Dispo taba (manje zabune).  
4. Ne koristiti `build:surfaces` samostalno posle Vite build-a — pregazi asset hashove.

### E2E
`superadmin-demo.spec.js` — **6/6 pass** (posle full `npm run build`).

---

## 2. Company Admin — funkcionalnost za rad

### Ocena: **7.8 / 10**

### Šta CA mora (i radi)
| Modul | Stanje | Za rad |
|-------|--------|--------|
| Dashboard / checklist | Radi | Dovoljno |
| Branding | Mutate OK | Dobro |
| Grupe/linije | CRUD praznih | Dobro |
| Tim (dispo) | Create, grupe, reset, revoke | Ključno — radi |
| Vozači + EID import | CA-only credentials | Ključno — radi |
| Autobusi | **Read-only** (D15) | Ispravno; Dispo mutira |
| Service plan / V66 katalog | Preview → publish → activate | Ključno — radi |
| Monthly assignments | **Uklonjeno** (D21) | Ispravno |
| Audit / settings / export CSV | Radi (demo audit prazan) | OK |
| Ops overview | RO u group hub | Može zbuniti |

### Šta treba da radi, a još ne / boli
| # | Nalaz | Prioritet | Preporuka |
|---|--------|-----------|-----------|
| C1 | Mrtvi moduli mesečnog uvoza još u bundle-u | Medium | **Popravljeno** — skinuto iz `register-onclick-staff.js` |
| C2 | Isti login ekran kao Dispo | Medium | Odvojen CA entry ili jasniji role hint |
| C3 | Isti lucide `bus` za Groups i Buses | Low | Druga ikona za Groups |
| C4 | Ops view izgleda kao Dispo edit | Medium | Banner „samo pregled“ uvek vidljiv |
| C5 | Onboarding teško u seed demo-u | Low | Reset putanja za QA |

### E2E
`ca-monthly-import.spec.js` — **2/2 pass** (nema monthly card; API 403).

---

## 3. Dispo — vizuelno, upotrebljivost, lakoća

### Ocena: **8.0 / 10** (uz VOR 320 crew + monthly import)

### Šta radi dobro
- Ops center: grupe, Needs attention, Live Issues usklađeni
- Soft-remove, guided incidents, Daily/Monthly/Vehicles split
- Monthly import: Excel/CSV/PDF/TXT/slike, structured Dienstplan, F05–F09
- Preview pre snimanja; povezivanje po imenu (bez EID)
- Demo seed: 5 vozača na 320 + busovi

### Šta boli
| # | Nalaz | Prioritet | Preporuka |
|---|--------|-----------|-----------|
| D1 | Active group ostaje 101 dok radiš na 320 | Medium | Auto-switch active group pri otvaranju huba |
| D2 | „Uncovered today“ kad je plan za avgust a danas drugi mesec | Low | Filtrirati „today“ vs selected month |
| D3 | Dropzone tekst još kaže „PDF/Excel“ iako prihvata slike | Low | Ažurirati i18n (hint već done) |
| D4 | OCR screenshotova zavisan od kvaliteta | Medium | Preferirati CSV/XLSX u treningu |
| D5 | Gust Ops dashboard za novog dispa | Medium | Guided first-run 3 koraka |

### Lakoća korišćenja (subjektivno)
- **Iskusan dispo:** 8.5 — brzo do Needs attention → Resolve  
- **Novi dispo:** 7.0 — mnogo panela, treba trening katalog vs dodela  
- **Vizuelno:** 8.0 — konzistentan dark SaaS, status boje jasne  

---

## Ukupan skor

| Uloga | Ocena | Za produkcijski rad |
|-------|-------|---------------------|
| SA (prava/nalozi) | **7.5** | Soft-pilot OK; MFA + export pre hard prod |
| CA | **7.8** | Spreman za katalog/tim/vozače; ne dirati mesečne dodele |
| Dispo | **8.0** | Spreman za dnevni rad uz trening importa |
| **Prosek** | **7.8** | |

---

## Obavezne popravke urađene u ovoj rundi
1. JAČA lozinka SA→CA (slovo+broj) — server + UI + test  
2. Uklonjen dead CA monthly-import wiring iz staff action registry  
3. Dispo login sada kopira `groups` na `currentUser` (vidljivost 310/320)  
4. SA create-admin placeholder usklađen  

## Testovi pokrenuti
- `tests/unit/validation.test.js` — pass  
- `tests/e2e/superadmin-demo.spec.js` — 6/6  
- `tests/e2e/ca-monthly-import.spec.js` — 2/2  
- Screenshot walkthrough — 14 PNG  

## Napomena o buildu
Posle izmene HTML/JS uvek: **`npm run build`** (ne samo `build:surfaces`), inače `staff.html` pokazuje 404 na bundle i login „ćuti“.
