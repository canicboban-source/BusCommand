# Poglavlje 9 — Soft pilot runbook (2026-07-26)

**Owner odobrenje:** „pilot“ (2026-07-26)  
**Režim:** soft Preview pilot na `https://buscommand.com`  
**Backup host:** `https://buscommand-preview.onrender.com`  
**Tenant:** sintetički `bc-test` (nije customer produkcija)

---

## Zabranjeno u soft pilotu

| Stvar | Status |
|-------|--------|
| Real SMS / push | OFF (`SMS_PROVIDER` unset → `none` u prod) |
| Live GPS tracking | OFF (L1 open) |
| `shiftConfirmationScheduler` | OFF (nema secret-a → ne uključuj) |
| `supportSession` | OFF (default); ON samo sa `--enable-support-session` za L7 |
| Customer tenant / plaćeni klijent | Ne |
| Destruktivni prod wipe / force-push | Ne |

---

## Preduslovi

1. `main` deployovan na Render (health OK)
2. Lokalni `firebase-admin-key.json` (gitignored) za bootstrap
3. Owner zna gde je Desktop pack sa lozinkama

## Bootstrap (sintetički tenant)

```bash
npm run pilot:bootstrap
# ili:
node scripts/bootstrap-preview-test-accounts.js
```

Izlaz (van repo): `%USERPROFILE%\Desktop\BusCommand-Test-Nalozi\`

- `TEST-NALOZI.md` / `.txt` / `.json`
- Nalozi: SA / CA / Dispečer za `bc-test`
- Flagovi: `supportSession=false`, `shiftConfirmationScheduler=false`

Opciono L7:

```bash
node scripts/bootstrap-preview-test-accounts.js --enable-support-session
```

Posle L7 vrati flag na `false` (ponovo bez flaga ili ručno u Firestore).

---

## Role-by-role live checklist

Detalji: `reports/poglavlje-9-role-checklist-2026-07-26.md`

Redosled: **SA → CA → Dispečer → Vozač (import)**

---

## Rollback (soft)

1. Render → Manual Deploy → prethodni uspešan `main` deploy  
2. Feature flags na `bc-test`: forsaj OFF (`supportSession`, `shiftConfirmationScheduler`)  
3. SMS: ostavi `none`  
4. Firebase Rules: **ne** rollbackuj slepo — diff prvo  
5. Rotiraj/obriši test naloge ako je curenje rizika  

Dokaz checklist: `reports/poglavlje-9-rollback-smoke-2026-07-26.md`

---

## Owner-only pre hard pilot / šireg go-live

1. `CONFIRMATION_JOB_SECRET` na Render web **i** cron (isti) — samo ako treba scheduler  
2. SMS DPA + provider  
3. L1 GPS zatvoren ako treba live mapa  
4. Rules emulator PASS (Java)  
5. Owner browser potvrda potpisana u checklisti  

---

## Tačan sledeći korak posle bootstrap-a

1. Owner otvori Desktop pack → uloguje se na live staff  
2. Prođe role checklist  
3. Označi PASS/FAIL u checklist fajlu (ili javi agentu rezultate)  
4. Agent popravlja samo FAIL stavke unutar soft-pilot scope-a  
