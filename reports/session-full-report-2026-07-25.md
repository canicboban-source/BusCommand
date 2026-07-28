# BusCommand — kompletan izveštaj sesije (2026-07-25)

Repo: `BusCommand-Preview-Local` → `https://github.com/canicboban-source/BusCommand-Preview`  
Live: `https://buscommand-preview.onrender.com` (deploy sa `main`)  
Grana: `work/master-prompt-ch1`

## Sažetak

| Stavka | Vrednost |
|--------|----------|
| Merged PR-ovi u ovoj liniji rada | **#3, #4, #5, #6, #7** |
| Poglavlja napredovala | **P6** (scheduler + ops + observability), **P7** (slice 1) |
| Live health | OK (`production`) |
| Preostalo ručno | `CONFIRMATION_JOB_SECRET` na Render web + cron |
| GPS live | **Blokiran** do legal L1 zatvaranja |

---

## 1. Poglavlje 6 — potvrde smena (završeno u više slice-ova)

### 1.1 Scheduler + policy ([PR #3](https://github.com/canicboban-source/BusCommand-Preview/pull/3))
- Vikend paket: petak, ili **poslednji radni dan pre subote**.
- Odvojeni zahtevi: `saturday` / `sunday` / `monday` / `next_shift`.
- Outbox + idempotency (`confirmation_outbox`).
- Feature flag: `settings.main.features.shiftConfirmationScheduler`.
- Dispatch job: `POST /api/internal/jobs/confirmation-dispatch` + secret.
- Render cron blueprint + SMS stub (prod `none`).
- CB stroke logo (`public/brand/logo-mark.svg`).
- Legal L1 GPS brief: `reports/legal-l1-gps-brief-2026-07-25.md`.

### 1.2 Dispečer vidi prave potvrde ([PR #4](https://github.com/canicboban-source/BusCommand-Preview/pull/4))
- `GET /api/staff/shift-confirmations`.
- Ops centar više ne laže preko `preTripDone`.
- Pending potvrde u „Čeka akciju“.

### 1.3 Mirror na shift doc ([PR #5](https://github.com/canicboban-source/BusCommand-Preview/pull/5))
- Driver confirm → `shifts/{id}.confirmedByDriver: true`.
- Staff i assignment view ostaju usklađeni.

### 1.4 Observability ([PR #6](https://github.com/canicboban-source/BusCommand-Preview/pull/6))
- API: `summary`, `attention`, `dispatchHealth`, bogatiji outbox.
- Snapshot: `companies/{id}/ops/confirmation_dispatch`.
- Failed delivery = critical u ops queue.
- Izveštaj: `reports/poglavlje-6-confirmation-observability-2026-07-25.md`.

---

## 2. Poglavlje 7 — vizuelno / i18n / a11y (slice 1)

### Merged: [PR #7](https://github.com/canicboban-source/BusCommand-Preview/pull/7)

| Oblast | Šta |
|--------|-----|
| Brand | Jedna plava `#2563EB` (tokens, DEFAULT_BRAND, CA inputs, demo/fresh) |
| Teal cleanup | `--shadow-blue` i light hover → primary RGB |
| Confirm modal | `role=dialog`, Escape, Tab trap, restore focus (staff + driver) |
| i18n | SA greške, stealth banner, group switch, week nav, bus+, profile (en/sr/de) |
| A11y CSS | `:focus-visible`, `prefers-reduced-motion` |
| Testovi | `tests/unit/poglavlje-7-visual-a11y.test.mjs` (4/4 + branding) |
| Izveštaj | `reports/poglavlje-7-visual-a11y-2026-07-25.md` |

### P7 još nije gotov (sledeći slice-ovi)
- EN parity (~44 ključa samo u sr/de).
- Tokenizacija preostalih hex boja u staff/driver CSS.
- Pun WCAG audit svih panela + zoom 125/150%.
- Uklanjanje srpskih `||` fallbackova u dispatcher UI.

**Ocena P7 ukupno posle slice 1:** ~6.5/10.

---

## 3. Izmenjeni / novi fajlovi (bitni)

### Server
- `server/confirmation-outbox.js`, `confirmation-scheduler.js`, `driver-routes.js`
- `server/driver-work-policy.js`, `sms-provider.js` (ranije u P6)

### Frontend
- `js/dispatcher/dashboard.js`
- `js/ui/confirm-modal.js`, `js/ui/i18n.js`
- `js/layout/shell-staff.js`, `js/auth/superadmin.js`
- `js/admin/company-admin-branding-model.js`, `dispatcher-setup.js`
- `css/design-tokens.css`, `style.css`
- `staff.html`, `driver.html`, `translations.js`

### Docs / tests / reports
- `reports/poglavlje-6-*.md`, `reports/poglavlje-7-visual-a11y-2026-07-25.md`
- `reports/legal-l1-gps-brief-2026-07-25.md`
- Unit testovi: work-policy, credentials, operational-client, p7-visual-a11y

### Namerno NIJE commitovano
- `public/brand/logo-hero.png`, `public/brand/logo-mark.png` (stari 3D PNG)

---

## 4. Testovi (pokrenuti u sesiji)

| Paket | Rezultat |
|-------|----------|
| driver-credentials + work-policy + operational-client (P6 obs) | **35/35** |
| poglavlje-7-visual-a11y + company-admin-branding | **7/7** |

Nije ponovo pokrenut ceo `npm run test:unit` / Playwright u ovom završnom koraku (okruženje + fokus na slice testove).

---

## 5. Deploy / ops

| Stavka | Status |
|--------|--------|
| GitHub `main` | Ažuriran kroz PR #3–#7 |
| Render live health | OK |
| `CONFIRMATION_JOB_SECRET` | **Još ručno** na web + cron |
| SMS provider | Stub / `none` (čeka DPA + biznis odluku) |
| Live GPS | Blokiran (legal L1) |

---

## 6. Preostali rizici

1. Cron bez tajne → dispatch ne radi u produkciji.
2. Firebase Admin key ranije paste-ovan u chat → **rotirati** ako nije već.
3. P7 nije „gotov panel“ — samo temelj brand/a11y/i18n.
4. E2E/Playwright nije regresijski proteran u ovom završetku.
5. Pravi SMS/push i GPS nisu produkciono uključeni (namerno).

---

## 7. Tačan sledeći korak

1. Postavi `CONFIRMATION_JOB_SECRET` na Render (web + cron).  
2. Nastavi **P7 slice 2**: EN key parity + tokenizacija staff/driver boja.  
3. Ne diraj live GPS dok L1 nije zatvoren.
