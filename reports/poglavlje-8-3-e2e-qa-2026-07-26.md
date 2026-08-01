# Poglavlje 8.3 — E2E + Rules gate (2026-07-26)

## Rezultat

| Gate | Status | Dokaz |
|------|--------|--------|
| Playwright E2E (`npm run test:e2e`) | **PASS** | **41/41** (~55s) |
| Unit | **PASS** | 273/273 |
| Lint | **PASS** | eslint clean |
| Production build | **PASS** | vite + copy-static + firebase isolation |
| Firestore Rules emulator | **BLOCKED** | Java nije instaliran na agent mašini (`java` not found) |

## Kritični bugovi pronađeni i popravljeni

### 1. CORS + Vite `crossorigin` (Critical za lokalni/E2E UI)

Vite hashed `/assets/*.js|*.css` linkovi imaju `crossorigin`. Browser šalje `Origin` i server je odbijao sve osim `localhost:8766` → **403** → CSS/JS se ne učitavaju → overlay sa inline `display:flex` blokira UI.

**Fix:** `isLocalDevCorsOrigin()` dozvoljava `localhost` / `127.0.0.1` na bilo kom portu kada `NODE_ENV !== "production"`; default CORS lista uključuje aktivni `PORT` i Vite `5173`.

### 2. Dist bez `style.css` / design tokens (High)

`copy-static-to-dist.js` nije kopirao `style.css` ni `css/design-tokens.css`. Ako surface HTML padne na ne-hashed linkove, `.hidden` nestaje.

**Fix:** copy lista proširena.

### 3. Overlay modali (High / defense-in-depth)

Confirm + onboarding wizardi: inline `display:flex` + klasa `hidden` bez pouzdanog CSS-a = fullscreen pointer trap.

**Fix:** `display:none` dok su zatvoreni; CSS `.bc-overlay-modal`; JS show/hide postavlja `style.display`.

### 4. E2E izolacija od lokalnog Firebase ključa

`BUSCOMMAND_FORCE_LOCAL_DEMO=1` u Playwright `webServer.env` forsira demo API puteve (determinističan API smoke).

## Šta nije urađeno (owner / okruženje)

1. **Rules emulator** — treba Java + `npm run test:rules`
2. **P9 pilot** — zabranjen dok owner ne kaže eksplicitno
3. Owner-only: `CONFIRMATION_JOB_SECRET`, SMS DPA, GPS L1

## Komande

```bash
npm run test:unit          # 273/273
npm run lint
npm run build
npm run test:e2e           # 41/41 (PORT može biti bilo koji localhost)
# npm run test:rules       # BLOCKED bez Java
```
