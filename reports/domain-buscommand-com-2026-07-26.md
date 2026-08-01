# Custom domain — buscommand.com (2026-07-26)

## Status

**Već online i CORS OK** (provera 2026-07-26):

| Origin | `Access-Control-Allow-Origin` | HTTP |
|--------|-------------------------------|------|
| `https://buscommand.com` | echo origin | 200 |
| `https://www.buscommand.com` | echo origin | 200 |
| Health/config | production, v30.1.0, firebase true | 200 |

Primarni URL za korisnike: **https://buscommand.com**  
Backup / Render host: `https://buscommand-preview.onrender.com`

## Šta je urađeno u repou

- `.env.example` — CORS lista uključuje apex + www + onrender
- `render.yaml` — `CORS_ORIGINS` kao eksplicitna vrednost (ne samo `sync: false`)
- Cron dispatch URL → `https://buscommand.com/...`
- Bootstrap pack URL-ovi → `buscommand.com`

## Owner ne mora ništa u Dashboardu za CORS

Live već vraća ispravne CORS headere. Ako jednog dana „pukne“ login sa domena:

1. Render → `buscommand-preview` → Environment  
2. `CORS_ORIGINS` =
   `https://buscommand.com,https://www.buscommand.com,https://buscommand-preview.onrender.com`  
3. Save → Manual Deploy

## Soft pilot i dalje važi

Domen ≠ hard go-live. SMS/GPS/scheduler ostaju OFF dok ne odlučiš drugačije.
