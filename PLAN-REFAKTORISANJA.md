# BusCommand — Plan refaktorisanja i popravki

Ovaj dokument je nastao iz dubinske analize koda (backend + frontend), nakon čega su
urađene manje/hitne popravke (vidi CHANGELOG.md / git log). Ovdje je popisano šta
**ostaje da se uradi**, sortirano po prioritetu. Namijenjeno je nekome ko preuzima
dalji rad na kodu.

> **Pravilo rada:** Sve izmjene idu po ovom planu — redoslijed faza ispod, bez
> framework rewrite-a (React/Vue). Prije većeg refaktora obavezno ESLint + smoke test
> za dotični tok. Aktivni razvoj za Liniju 310 / Group Hub: ovaj repozitorij
> (`fleet_v20.1`), dok se ne spoji u glavni `f:\fleet`.

---

## 🟠 FAZA 0 — produkt: Group Hub i Linija 310 (PRIJE sedmice 1)

### 0.1 Group Hub — jedan ekran po liniji
**Status:** ✅ Urađeno (`js/dispatcher/group-hub.js`, `#dispatcher-group-hub`)

### 0.2 Model pripadnosti: `lineId` + podgrupe
**Status:** ✅ Urađeno (`js/data/group-membership.js`)

### 0.3 Paket uvoz (CSV + Excel)
**Status:** ✅ UI + parseri; ⬜ provjera pravim fajlovima korisnika

### 0.4 Settings vs Group Hub
**Status:** ✅ Settings = grupe; uvoz = Group Hub

### 0.5 Smoke testovi za tok 310
**Status:** ✅ `tests/e2e/line-310.spec.js` (Group Hub, daily plan, empty hint)

### 0.6 Merge u `f:\fleet`
**Status:** ✅ jul 2026 — `scripts/merge-to-fleet.ps1`, verifikacija: build + 19 unit + 14 E2E u `f:\fleet`

---

## 🔴 KRITIČNO — sigurnost i ispravnost podataka

*(stavke 1–5 — vidi puni tekst u `f:\fleet\PLAN-REFAKTORISANJA.md`)*

1. Server-side validacija (zod) — `api-server.js`
2. CORS + rate limiting
3. Audit trail mutacija
4. Firestore batch/transaction
5. N+1 admin upiti

---

## 🟡 VAŽNO — kvalitet koda (stavke 6–12)

6. ESLint/Biome  
7. Smoke/E2E testovi  
8. Onclick → event listeneri (Group Hub prvi)  
9. HTTP status kodovi  
10. Helmet + pino  
11. Lagani state observer (dashboard, Group Hub, shift grid)  
12. CSS konsolidacija  

---

## Preporučeni redoslijed

0. **Faza 0** — E2E 310, merge u `f:\fleet`  
1. **Sedmica 1** — stavke 1, 2, 9, 10  
2. **Sedmica 2** — stavke 6, 7  
3. **Sedmica 3–4** — stavke 3, 4, 5  
4. **Kontinuirano** — stavke 8, 11  
5. **Kad bude vremena** — 12–18  

**Bez framework rewrite-a.** Prioritet: disciplina (testovi, validacija, lint).

Puni plan sa opisima problema: `f:\fleet\PLAN-REFAKTORISANJA.md`
