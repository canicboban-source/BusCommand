# Swiss Control Scorecard — 2026-08-07

Branch: `work/ca-group-monthly-import`  
Demo: `/staff.html?mode=demo`

## Scores (pre → post overnight pack)

| Uloga | Pre (role audit) | Posle | Napomena |
|-------|------------------|-------|----------|
| SA (prava/nalozi) | 7.5 | **7.6** | Login role hint; MFA i dalje crveno |
| CA | 7.8 | **8.2** | Sticky read-only banner (C4); D21 orphan module removed |
| Dispo | 8.0 | **8.4** | Active group auto-switch (D1); dropzone i18n (D3) |
| **Prosek** | 7.8 | **~8.1** | Soft-pilot; nije hard prod |

## Šta je urađeno ove noći

| ID | Promena | Dokaz |
|----|---------|--------|
| D1 | `adoptActiveGroup` on hub / daily / monthly / vehicles | `00-d1-active-group.json` → hub+user = `320` |
| D3 | Dropzone/i18n: Excel/CSV/PDF/TXT/image (OCR) | `00-d3-dropzone.json` |
| C4 | Sticky CA read-only banner + slot | `00-c4-readonly-banner.json` → `bannerVisible: true` |
| C2 | Staff tab + role hint (SA/CA/Dispo) | screenshots `01`–`02` |
| D21 | Deleted orphan `js/admin/company-admin-monthly-import.js` | unit + `00-d21-ca-monthly-gone.json` |

## Verification ×3 (build + unit + e2e)

See `VERIFY-3x.log` and `pass{1,2,3}-*.txt`.

| Pass | Build | Unit (21) | E2E SA+CA (8) |
|------|-------|-----------|---------------|
| 1 | OK | 21/21 | 8/8 |
| 2 | OK | 21/21 | 8/8 |
| 3 | OK | 21/21 | 8/8 |

Walkthrough ×3: `pass{1,2,3}-walkthrough.txt` — 10 PNG each (last pass kept).

## Demo logins

| Role | Email | Password |
|------|-------|----------|
| SA | `sa@demo.local` | `sa-demo-ok` |
| CA | `admin@demo.com` | `demo123` |
| Dispo | `demo@buscommand.com` | `demo123` |

## Van obima (i dalje crveno)

- MFA for SA/CA  
- Staging Firebase (O1)  
- Tenant export before purge  
- Legal “usklađeno” claim  
- Fuel / service / trip orders (product boundary)
