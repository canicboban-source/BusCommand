# Smoke — bus import (pre-commit gate E)

Datum: **2026-08-02**  
Grana: `work/ch1-state-checkpoint`

## Tok inventura

| Akcija | Tok |
|--------|-----|
| Paste / file → Preview | UI → parse → classify vs group buses → preview |
| Confirm import | UI confirm → demo `state.buses` / prod `POST /api/staff/buses` (+ reactivate status) → lista |
| Empty paste | UI → reject / no invented buses |

RBAC: create/status API already dispatcher-only (CA 403).

## Komande

```text
npm run lint          → pass
npm run test:unit     → 385/385
npm run build         → pass
npx playwright test tests/e2e/bus-import-smoke.spec.js → 2/2 pass
```

## Rezultat

- Happy: paste `91103/91104` + existing `90001` → preview → confirm → lista sadrži nova vozila  
- Fail: prazan paste → preview prazan, lista i dalje 0

**Gate E: PASS** za bus uvoz (demo). XLSX drop nije posebno E2E-ovan (parser unit + file path u kodu); CSV/TXT/paste je pokriven happy putanjom.
