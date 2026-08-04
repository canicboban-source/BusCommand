# Poglavlje 5 â€” dizajn sistem i tokeni

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna taÄka: checkpoint Poglavlja 4 (`d5c4ad2` / `34e5d73`)
- Checkpoint commit: `7708b49`
- Master prompt: v3.2 Â§33

## 1. Cilj

ZakljuÄati dizajn sistem **pre** redizajna stranica: katalog tokena, semantiku
`urgent-action`, tipografiju, razmake, gustine staff/driver, stanja komponenti,
jedan light-theme izvor, dokumentovana odstupanja.

## 2. Å ta je uraÄ‘eno

| Stavka | Rezultat |
| --- | --- |
| `css/design-tokens.css` | ProÅ¡iren katalog: urgent-action, state, typography, spacing, density, z-index |
| Staff / driver density | `html[data-app-surface]` override-i; page pad koristi `--density-*` |
| `.urgent-action` | Koristi tokene umesto raw amber hex |
| Light theme | Duplikat palete uklonjen iz `style.css`; jedini izvor je tokens fajl |
| Spec | `docs/design-system.md` + lista odstupanja |
| Test | `tests/unit/design-system-tokens.test.mjs` (4) + mutacija |

## 3. Mutacija

| Mutacija | Rezultat |
| --- | --- |
| `.urgent-action` fill vraÄ‡en na `#f59e0b` | test pada âœ“ |
| VraÄ‡eno na `var(--urgent-action)` | 4/4 âœ“ |

## 4. Gate

| Komanda | Prolaz |
| --- | --- |
| `npm run lint` | prolaz |
| `npm run test:unit` | **468/468** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| `npx playwright test --project=chromium` | **57/57** |

## 5. Å ta namerno nije uraÄ‘eno

Masovna migracija ~100 `#hex` iz `style.css` i ops pill hex-ova â€” to je
redizajn (P16), ne zakljuÄavanje sistema. Odstupanja su u
`docs/design-system.md` Â§4.

## 6. Ocena

**8.5/10** â€” sistem je zakljuÄan i testiran; vizuelni dug ostaje dokumentovan
a ne sakriven. Predlog sledeÄ‡eg: Poglavlje 6 (kanonski model plana i revizije).

