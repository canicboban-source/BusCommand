# Poglavlje 9.1 — Soft pilot start (2026-07-26)

## Owner gate

Owner je rekao **„pilot“** → P9 soft pilot odobren.

## Šta je urađeno

1. Soft-pilot runbook: `reports/poglavlje-9-soft-pilot-runbook-2026-07-26.md`
2. Role-by-role live checklist: `reports/poglavlje-9-role-checklist-2026-07-26.md`
3. Rollback smoke docs: `reports/poglavlje-9-rollback-smoke-2026-07-26.md`
4. Bootstrap ažuriran za soft defaults:
   - `supportSession` **OFF** (opt-in `--enable-support-session`)
   - `shiftConfirmationScheduler` forsiran **OFF**
5. `npm run pilot:bootstrap` skripta
6. Live health check: Preview `/api/health` OK, `firebase: true`, v30.1.0
7. `npm run pilot:bootstrap` izvršen → `bc-test` postojeća firma; flags OFF; pack na Desktop `BusCommand-Test-Nalozi`

## Soft-pilot safety (potvrđeno u kodu)

| Kontrola | Default |
|----------|---------|
| `createCompanyAtomic` → `supportSession` | `false` |
| Scheduler flag | mora `=== true` da bi radio |
| SMS u production | `none` ako unset |
| Live GPS product flag | nije uključen (L1 open) |

## Šta owner radi sad

1. `npm run pilot:bootstrap` (ako još nije) → Desktop pack
2. Prođi `reports/poglavlje-9-role-checklist-2026-07-26.md` na live URL
3. Javi FAIL stavke — agent popravlja u soft scope-u

## Šta ostaje blocked

- Hard pilot / customer go-live
- Real SMS, live GPS
- Scheduler bez `CONFIRMATION_JOB_SECRET`
- Rules emulator (Java)
- Owner browser potpis na checklisti

## Ocena

| Metrika | Ocena | Dokaz |
|---------|-------|-------|
| P9.1 soft prep | 8/10 | runbook + bootstrap soft defaults + live health |
| Hard pilot spremnost | 6/10 | još owner browser + legal/ops gate-ovi |
