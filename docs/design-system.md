# BusCommand design system

Izvor: `css/design-tokens.css` · Poglavlje 5 · Master prompt §33.

Ovaj dokument zaključava tokene **pre** redizajna pojedinačnih stranica.
Nove ad-hoc boje u površinskim CSS fajlovima nisu dozvoljene kada token već
postoji.

## 1. Principi

1. Dark-first (Fleet Aurora). Light theme je podržan, ali drugorazredan dok
   svi hotspots ne koriste tokene.
2. Semantika statusa, ne ukras:
   - **danger** — problem i destruktivne akcije
   - **urgent-action** — hitna operativna CTA (amber)
   - **success** — potvrđeno / rešeno
   - **warning** — upozorenje bez CTA težine
   - **info** — informacija
3. Dve gustine: `staff` (ops centar) i `driver` (PWA). Setuju se preko
   `html[data-app-surface]`.
4. Komponente zadržavaju postojeća imena (`btn-*`, `badge*`, `toast-*`,
   `bc-overlay-modal`, `ops-*`). Novi prefiks se ne uvodi.

## 2. Token katalog

### Surfaces / text / brand

`--bg-dark`, `--bg-darker`, `--panel-bg`, `--panel-bg-solid`, `--card-bg`,
`--panel-border`, `--panel-border-hover`, `--input-bg`, `--text-main`,
`--text-secondary`, `--text-muted`, `--text-muted-dark`, `--text-on-accent`,
`--text-on-urgent`, `--primary-*`, `--accent-*`.

### Status i urgent-action

`--success-*`, `--warning-*`, `--danger-*`, `--info-violet`, plus
`--urgent-action`, `--urgent-action-hover`, `--urgent-action-border`,
`--urgent-action-border-hover`, `--urgent-action-fg`, `--urgent-action-rgb`,
`--urgent-action-shadow*`, `--urgent-action-focus`.

`.urgent-action` na staff površini **mora** koristiti ove tokene.

### Stanja komponenti

`--state-disabled-opacity`, `--state-loading-opacity`,
`--state-error-border/bg`, `--state-success-border/bg`.

### Tipografija

`--font-family-sans`, `--font-size-xs` … `--font-size-2xl`,
`--font-weight-*`, `--line-height-*`.

### Razmaci i gustina

`--space-1` … `--space-12` (4px baza).
`--density-page-pad-*`, `--density-control-h`, `--density-row-gap`,
`--density-card-radius` — override po površini.

### Radius, senke, z-index

`--radius-*`, `--shadow-*`, `--focus-ring`, `--transition-*`,
`--z-base` … `--z-skip-link`.

## 3. Light theme

Jedini izvor light override-a je `body.light-theme` u
`css/design-tokens.css`. `style.css` ne sme da ponovo deklariše iste
varijable (duplikat je uklonjen u Poglavlju 5). Komponentni light selektori
u `style.css` ostaju dok se ne migriraju u narednim vizuelnim poglavljima.

Urgent-action ostaje amber i u light temi (ne sme da se ispere u plavo).

## 4. Registrovana odstupanja

| Odstupanje | Razlog | Plan |
| --- | --- | --- |
| ~100 `#hex` u `style.css` | Nasleđe pre tokena; masovna migracija = redizajn | P16 / vizuelna usklađenost |
| Ops status pill hex u `staff-desktop.css` | Lokalni rail stilovi | Mapirati na `--danger/warning/success/accent` u P9/P16 |
| Chromium `select option` light popup (`#0f172a`/`#fff`) | Browser quirk | Ostaviti; dokumentovano |
| Staff resolution dialog `color-scheme: dark` | Čitljivost u ops modalu | Revidirati u P9 |
| Inline hex u JS (mapa, SOS sirena) | Canvas/SVG ograničenja | Kasnije: čitati CSS var iz computed style |
| Light theme komponentni override-i u `style.css` | Drugorazredna tema | Postepeno uklanjanje |

## 5. Pravila za PR

- Novi UI stil koristi `var(--…)` iz ovog kataloga.
- Nova semantika boje prvo dobija token, pa tek onda klasu.
- Ne uvoditi treći naming sistem pored `btn-*` / `bc-*` / `ops-*`.
- Test `tests/unit/design-system-tokens.test.js` mora proći.
