# Poglavlje 5 — dizajn sistem i tokeni

- Datum: 2026-08-04
- Grana: `work/ca-group-monthly-import`
- Polazna tačka: checkpoint Poglavlja 4 (`d5c4ad2` / `34e5d73`)
- Checkpoint commit: *(upisuje se posle commita)*
- Master prompt: v3.2 §33

## 1. Cilj

Zaključati dizajn sistem **pre** redizajna stranica: katalog tokena, semantiku
`urgent-action`, tipografiju, razmake, gustine staff/driver, stanja komponenti,
jedan light-theme izvor, dokumentovana odstupanja.

## 2. Šta je urađeno

| Stavka | Rezultat |
| --- | --- |
| `css/design-tokens.css` | Proširen katalog: urgent-action, state, typography, spacing, density, z-index |
| Staff / driver density | `html[data-app-surface]` override-i; page pad koristi `--density-*` |
| `.urgent-action` | Koristi tokene umesto raw amber hex |
| Light theme | Duplikat palete uklonjen iz `style.css`; jedini izvor je tokens fajl |
| Spec | `docs/design-system.md` + lista odstupanja |
| Test | `tests/unit/design-system-tokens.test.mjs` (4) + mutacija |

## 3. Mutacija

| Mutacija | Rezultat |
| --- | --- |
| `.urgent-action` fill vraćen na `#f59e0b` | test pada ✓ |
| Vraćeno na `var(--urgent-action)` | 4/4 ✓ |

## 4. Gate

| Komanda | Prolaz |
| --- | --- |
| `npm run lint` | prolaz |
| `npm run test:unit` | **468/468** |
| `npm run test:rules` | **40/40** |
| `npm run build` | prolaz |
| `npx playwright test --project=chromium` | **57/57** |

## 5. Šta namerno nije urađeno

Masovna migracija ~100 `#hex` iz `style.css` i ops pill hex-ova — to je
redizajn (P16), ne zaključavanje sistema. Odstupanja su u
`docs/design-system.md` §4.

## 6. Ocena

**8.5/10** — sistem je zaključan i testiran; vizuelni dug ostaje dokumentovan
a ne sakriven. Predlog sledećeg: Poglavlje 6 (kanonski model plana i revizije).
