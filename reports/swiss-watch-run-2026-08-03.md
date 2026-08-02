# Swiss-watch run — 2026-08-03

**Prompt:** `reports/PROMPT-SWISS-WATCH-ZA-ODOBRENJE.md` **v1.2** (ODOBRENO: plavi logo iz chata)  
**Master:** `docs/BusCommand-MASTER-PROMPT-v3.1.md`  
**Grana:** `work/swiss-control-fixes` @ **`8cf99c8`**  
**Base:** `ee4e003`

## Gate (lokalno) — Pass 2

| Check | Result |
|-------|--------|
| lint | PASS |
| unit | **411/411** PASS |
| build | PASS |
| PDF 310 ~1.29 MB | PASS (limit 5 MB) |
| PDF 320 ~3.27 MB | PASS (limit 5 MB) |
| PDF >5 MB | rejected (expected) |
| Logo SHA = chat asset | PASS |

## Pass 1 → Pass 2 matrica

| Poglavlje | Pass 1 | Pass 2 (kod) | Napomena |
|-----------|--------|--------------|----------|
| A SA | Fake CA delete FIXED | PASS | Live browser OPEN |
| B CA | PDF 5MB, logo, audit FIXED | PASS | Live import www OPEN do deploy |
| C Dispo | Monthly persist FIXED | PASS | Live 310 XLSX + busevi OPEN do deploy |
| D Vozač | SOS hold/nav FIXED | PASS | Check-in local-only = High OPEN |
| E Cross | lint/unit/build/logo | PASS | Deploy nije urađen |

## Critical/High zatvoreno u kodu

1. Service plan limit **5 MB** (320 PDF)  
2. Plavi logo uvek (`/brand/logo-*.png`); tenant samo pored  
3. SOS: jedan nav + press-hold; fp-nav sakriven  
4. Mesečni/package import → `persistImportedMonthlyPlan` → assignment API  
5. Activity actor bez sirovog email-a  
6. SA trash CA samo u demo  

## Još OPEN

| Sev | Stavka |
|-----|--------|
| High | Driver check-in local-only (nema server API) |
| High | Live/www Pass 2 (deploy + browser) nije dokazan na ovom SHA |
| Medium | Dedicated monthly import commit endpoint (trenutno N× assignment) |
| Business | Hard delete vozač/dispo — namerno nema |

## Ocene (uz lokalni dokaz; bez live deploy)

| Poglavlje | Ocena |
|-----------|------:|
| A SA | 7.5 |
| B CA | 8 |
| C Dispo | 7.5 |
| D Vozač | 7 |
| E Cross | 7.5 |
| **Ukupno** | **7.5 / 10** |

Ne tvrditi Swiss-watch / production ready dok live Pass 2 nije zelen i vlasnik ne odobri deploy.

## Sledeći korak

1. Odobri PR merge `work/swiss-control-fixes` → `main`  
2. Deploy Render `buscommand`  
3. Live smoke: PDF 320, logo, XLSX 310, SOS hold, audit User  
4. Opciono: server check-in API (High)  
