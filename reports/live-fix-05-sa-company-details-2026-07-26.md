# Live-review fix — stavka 5: SA "Details" dugme (2026-07-26)

## Uzrok

`superadminOpenCompanyDetail` je punio `#sa-detail-body` i (u produkciji) zvao `ApiClient.getCompanyDetail`, ali **nikad nije prikazao** `#sa-company-detail-modal`. Modal ostaje sa `class="hidden"` i `style="display:none"` (kao u HTML-u). Zato klik na "Details" nije radio ništa — bez JS greške.

## Izmena

- Posle uspešnog fill-a (demo / API success) i na API error putu: `classList.remove("hidden")`, `display:flex`, `aria-hidden="false"`.
- Close postavlja `aria-hidden="true"`.

## Testovi

```bash
node --test tests/unit/superadmin-modal-visibility.test.mjs
```

## Prihvatanje

Na SA listi firmi, "Details" otvara modal sa podacima firme (ili greškom ako API padne).

## Ostaje otvoreno

- Stavke 6+ iz live-review.
- Ručna potvrda na live nakon deploy-a.
