# Poglavlje 7 — Vizuelno / i18n / a11y (slice 1) — 2026-07-25

## Obim

Prvi fokusirani P7 slice (ne ceo redesign): brand konzistentnost, confirm modal a11y, hardkodovani staff/SA stringovi, focus/reduced-motion, aria na ikonicama.

## Šta je urađeno

1. **Brand blue**
   - Kanonska boja: `#2563EB` (`DEFAULT_BRAND_COLOR`, design tokens, fresh/demo branding, CA color inputs, help tekst sr/en/de).
   - Uklonjen teal trag iz `--shadow-blue` i light `--panel-border-hover`.

2. **Confirm modal a11y**
   - `role="dialog"`, `aria-modal`, `aria-labelledby` (staff + driver).
   - Escape zatvara, Tab focus trap, restore focus, token boje umesto hardkodovanog indigo panela.

3. **i18n**
   - Super Admin / stealth / group switch / SA login greške → `t()` ključevi u **en/sr/de**.
   - Week nav, add-bus, driver profile aria-label.

4. **CSS**
   - Global `:focus-visible` ring.
   - `prefers-reduced-motion: reduce`.

## Testovi

- `tests/unit/poglavlje-7-visual-a11y.test.mjs`

## Šta ostaje za sledeće P7 slice-ove

- EN parity za ~44 ključa koja postoje samo u sr/de.
- Tokenizacija preostalih hex boja u `staff-desktop.css` / `driver-pwa.css`.
- Pun SA PIN modal i18n naslov.
- Sistematski WCAG audit svih panela + zoom 125/150%.
- Uklanjanje srpskih `||` fallback stringova u dispatcher modulima.

## Ocena slice-a

**P7 slice 1: ~6.5/10 ukupnog P7** — temelj (brand + modal + kritični hardkodovi) stoji; vizuelni polish i pun i18n parity još nisu gotovi.
