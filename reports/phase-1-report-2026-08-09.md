# FAZA 1 — Dispatcher group authorization (v4.1)

**Status:** implementirano + dokazano · **STOP** — čeka odobrenje za Fazu 2  
**Datum:** 2026-08-09  
**Change Ledger:** `reports/phase-1-change-ledger.md`  
**Visual:** `reports/phase-1-visual/` (TRAIL PASS)

## What

Dispo više ne može direktnim Firestore čitanjem (niti slabim API putevima) da vidi operativne podatke van dodeljenih grupa. CA zadržava own-tenant pregled. Driver vidi samo sopstvene / home-group resurse. `knownGroupIds` više ne otvara direktorijum.

## Why

Rules su ranije dozvoljavale company-wide Dispo read na većini ops kolekcija; client soft-scope + `knownGroupIds` expansion nisu bili security boundary.

## Security

| Kontrola | Ishod |
| -------- | ----- |
| Firestore Dispo group scope | home `groupId` / bus `groupIds.hasAny` / driverId→home |
| `knownGroupIds` | **ne** grantuje read (Rules + client + `loadDriverDocsForGroups`) |
| Cross-tenant | ostaje deny (postojeći testovi) |
| SOS resolve / message archive / ops-activity | group-gated / fail-closed |
| Credentials | i dalje deny svim client rolama |

## Not done / STOP (req 7–8)

**D18.1 odobreno 2026-08-09** (vidi `docs/decisions.md`): uska server projekcija za other-group zamene — tenant-bound, server-authoritative, bounded, data-minimal; bez EID/PIN/login/hash/telefon/email/pun profil; klijent ne bira `companyId`; mutacija re-check group/availability/conflict/revision; nema nove kolekcije/šeme bez posebnog yes; Firestore direktorijum ostaje zatvoren.

**Implementacija projekcije nije pokrenuta** u ovom STOP-u (owner: ostani STOP; ne Zapocinji Fazu 2). Needs Attention “Druge grupe” pool ostaje prazan do eksplicitnog implementacionog naloga.

## Proof

| Gate | Rezultat |
| ---- | -------- |
| `npm run test:rules` | **44** pass, exit 0 |
| `npm run test:unit` | **628** pass, exit 0 |
| `npm run lint` | exit 0 |
| `npm run build` + budgets | exit 0 · staff **576761 ≤ 581632** · translations **377148 ≤ 377856** |
| `check:secrets` / `check:firebase-isolation` / `npm audit --omit=dev` | OK / 0 vulns |
| Visual trail | PASS (`reports/phase-1-visual/`) |

**Authz autoritet:** emulator Rules (negativni Dispo cross-group + pozitivni CA + Dispo-own po kolekcijama). Screenshot ≠ autorizacija.

## Files

- `firestore.rules`
- `js/core/firebase-service.js`
- `server/driver-routes.js`
- `tests/rules/firestore.rules.test.js`
- `tests/unit/dispatcher-multi-group-query.test.mjs`
- `tests/unit/poglavlje-17-performance-budgets.test.mjs`
- `tests/unit/phase1-dispatcher-group-api.test.mjs`
- `scripts/phase1-visual-trail.mjs`
- `reports/phase-1-change-ledger.md`
- `reports/phase-1-visual/*`

## Visual trail (path)

1. Login Dispo → hub  
2. Assigned group 101 (Home Group Driver / B101)  
3. Foreign (202) odsustvo  
4. Forced hub 202 → nema foreign driver leak  
5. CA login → vidi oba vozača (own-tenant)  
6. Normal surface after Rules alignment  

## Risk

- Live Firebase Rules deploy **nije** urađen (nema owner “yes”).  
- Legacy shift/message docs bez `groupId` — Dispo client read deny (fail closed).  
- Multi-group bus bez `groupId` — Rules `groupIds.hasAny` OK; client i dalje `groupId==` query (postojeći jaz).  
- D18.1 projekcija odobrena, **nije implementirana** (STOP).

## Owner gate

- D18.1: **odlučeno** (2026-08-09).
- FAZA 2: **ne kreće** dok vlasnik ne pošalje tačno `NASTAVI FAZU 2`.
- Implementacija D18.1 projekcije: čeka eksplicitan nalog (nije deo ovog STOP zapisa).
