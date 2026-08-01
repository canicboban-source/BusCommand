# Live-review fix — stavka 8: pluralizacija uvoza vozača (2026-07-26)

## Uzrok

Poruke u CA driver-import toku koristile su uvek množinu (`{count} drivers…`) i za `count === 1`.

## Izmena

- Novi `tp(key, count, replacements)` u `js/ui/i18n.js` — bira `${key}_one` kada je count 1.
- Singular ključevi (en/sr/de) za: `ca_drivers_preview_ready`, `ca_drivers_confirm_import`, `driver_import_success`, plus summary/results u istom toku.
- Call site-ovi u `company-admin-drivers.js` i `drivers.js` koriste `tp`.

## Testovi

```bash
node --test tests/unit/driver-import-pluralization.test.mjs
```

## Prihvatanje

Za 1 vozača: "1 driver is ready for review.", "Import 1 driver", "Successfully imported 1 driver!" (i sr/de ekvivalenti).

## Ostaje otvoreno

- Stavke 9–10 (jezik po ulozi, trial banner za SA).
