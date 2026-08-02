# Swiss-watch run — 2026-08-03

**Prompt:** `reports/PROMPT-SWISS-WATCH-ZA-ODOBRENJE.md` **v1.2** (ODOBRENO: plavi logo iz chata)  
**Master:** `docs/BusCommand-MASTER-PROMPT-v3.1.md`  
**Grana:** `work/swiss-control-fixes`  
**Base:** `ee4e003`

## Gate (lokalno)

| Check | Result |
|-------|--------|
| lint | PASS |
| unit | **409/409** PASS |
| build | PASS (brand + icons copy) |
| PDF 310 ~1.29 MB | PASS (limit 5 MB) |
| PDF 320 ~3.27 MB | PASS (limit 5 MB) |
| Logo SHA256 = sent asset | PASS (`E5ECE2A4…C43C12`) |

## Pass 1 — status po poglavlju

### A) Super Admin — u toku / delimično FIXED
| Stavka | Status |
|--------|--------|
| Fake CA delete (local-only trash) | **FIXED** — dugme samo u demo; prod blokiran |
| Ostale SA akcije (create, support, suspend…) | code PASS (ranije inventura); live browser OPEN |

### B) Company Admin — Critical ulazi FIXED (kod)
| Stavka | Status |
|--------|--------|
| PDF >2 MB / 320 | **FIXED** `MAX_FILE_BYTES=5MB` + i18n + unit |
| Plavi logo uvek | **FIXED** — PNG iz chata u `public/brand/*` |
| Activity User = email | **FIXED** — UI `actorLabel` + server `sanitizeAuditActorName` |
| Deactivate-only vozač/dispo | **PASS (namerno)** — UI “Deaktiviraj” |
| Live import 310/320 na www | OPEN do deploy |

### C) Dispečer — Critical FIXED (kod)
| Stavka | Status |
|--------|--------|
| Bus import API | PASS |
| Sticky shift delete | PASS (ranije) |
| Plan lock UI | PASS |
| Monthly/package XLSX local-only | **FIXED** — `persistImportedMonthlyPlan` → `PUT /api/staff/shifts/assignment` + reload |

### D) Vozač — Critical FIXED (kod)
| Stavka | Status |
|--------|--------|
| Dual SOS (header + nav) | **FIXED** — uklonjen header SOS |
| Press-hold SOS | **FIXED** — hold 700ms → confirm modal |
| fp-nav prekriva SOS | **FIXED** — sakriven na driver surface |
| Nav Plan·Smene·SOS·Prijavi·Poruke | **FIXED** (Odmor → Poruke scroll) |
| Company-code 410 | PASS |
| Check-in local-only | OPEN / dokumentovano (High) |
| Live browser SOS | OPEN |

### E) Cross-cutting — delimično
Logo + i18n plan limit + build/lint/unit PASS. Deploy / Pass 2 još nisu.

## Ocena (trenutno, uz dokaz lokalnog gate-a)

| Poglavlje | Ocena |
|-----------|------:|
| A SA | 7 |
| B CA | 7.5 (kod; live deploy nedostaje) |
| C Dispo | 5 (još nije prošao Pass 1 do kraja) |
| D Vozač | 6.5 (Critical SOS zatvoren u kodu) |
| E Cross | 7 |
| **Ukupno** | **6.5 / 10** |

Ne tvrditi Swiss-watch / production ready dok Pass 2 nije zelen i vlasnik ne odobri deploy.

## Sledeći korak

1. Pass 1 Ch.C (dispečer) + smoke Downloads asseti  
2. Pass 1 ostatak A/B live gde moguće  
3. Pass 2 ceo A→E  
4. Pitati vlasnika za commit/PR/deploy  
