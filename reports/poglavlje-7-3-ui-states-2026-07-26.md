# Poglavlje 7.3 — Empty / loading / error UI (2026-07-26)

## Šta je urađeno

1. **Driver plan badge** više nije uvek „Plan potvrđen“ — reaguje na off-day, pending confirm targets i confirmed.
2. **Stops empty** — eksplicitna poruka umesto praznog bloka.
3. **Ops health copy** — healthy / attention / stale, plus `aria-busy` tokom fetch-a.
4. **Confirmations fetch** — greška više nije tiha: toast (throttle 60s), stale health, error empty u „Čeka akciju“.
5. **Mark message read** — toast na API failure.
6. **i18n** sr/en/de za nove ključeve.

## Testovi

- `tests/unit/poglavlje-7-3-ui-states.test.mjs`

## Ocena P7 posle 7.3

**~8/10** — kritična stanja na driver home + ops centru su čitljiva.

## Sledeće

**P7.4** — preostali a11y (skip link, kontrast, icon-button audit) pa **P8**.
