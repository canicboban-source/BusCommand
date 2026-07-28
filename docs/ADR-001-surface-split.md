# ADR-001 — Driver PWA + Staff desktop surfaces

**Status:** Accepted  
**Date:** 2026-07-23  
**Context:** BusCommand-Preview-Local (B)

## Decision

One repository, one API, **two browser surfaces** — no Electron / installer:

| Surface | URL | Users | Form |
|---------|-----|-------|------|
| **driver** | `/driver.html` (alias `/driver`) | Vozač | Mobile-first PWA |
| **staff** | `/staff.html` (alias `/staff`, `/`) | SuperAdmin, Company Admin, Dispečer | Desktop browser only |

Shared: `js/core/*`, auth/API/Firebase, i18n, design tokens, Express API.

## Consequences

- Vite multi-page: `driver.html` + `staff.html` (+ landing `index.html`)
- Separate install barrels and onclick registries
- Section handlers registered per surface (no cross-role navigation imports)
- Driver gets web manifest + service worker; staff does not
- Role-switch between driver↔dispatcher is demo-only and must not appear on production staff/driver surfaces as a cross-app escape

## Non-goals

- Native store apps, `.exe`, React Native
- Rewriting state/Firebase model in this ADR
