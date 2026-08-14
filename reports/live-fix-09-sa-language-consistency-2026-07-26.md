# Live-review fix — stavka 9: nekonzistentan jezik po ulozi (2026-07-26)

## Uzrok

`buscommand_lang` (jezički selektor) i `window.state.language` (što `t()` / `translateUI()` čitaju) nisu bili usklađeni posle tenant merge-ova:

1. `FRESH_STATE.language` je `"en"`.
2. `initFirebase` radio je `window.state = { ..._baseState(), ...cloudState }` **bez** čuvanja UI jezika — ako cloud/local nema `language`, stanje postaje EN dok selektor i dalje pokazuje DE.
3. `resetInMemoryTenantState` je preferirao zagađeni `state.language` pre `buscommand_lang`.
4. SA login preko staff forme zvao je `initFirebase(null)` / license lookup (bacalo grešku); CA putanja je često imala `language` u tenant kešu pa je delovala ispravno.

## Izmena

- `resolveUiLanguage` / `applyUiLanguagePreference` u `js/core/state.js` — `buscommand_lang` je izvor istine.
- Primena posle svakog `window.state =` u `initFirebase`, `loadStateFromStorage`, cross-tab sync, shell (SA/CA/driver).
- `t()` / `translateUI()` / `changeLanguage()` koriste `resolveUiLanguage`.
- Staff login: Super Admin preskače license + Firestore.
- DE naslov: `superadmin_title` → „Super-Admin-Übersicht“.

## Testovi

```bash
node --test tests/unit/ui-language-consistency.test.mjs tests/unit/driver-activation.test.mjs tests/unit/tenant-localstorage-cache.test.mjs
```

Svi prošli (20/20).

## Prihvatanje

Sa `buscommand_lang=de` i selektorom na DE, SA dashboard koristi nemačke stringove isto kao CA — i posle tenant merge-a / re-login-a.

## Ostaje otvoreno

- Stavka 10 (trial banner za SA).
