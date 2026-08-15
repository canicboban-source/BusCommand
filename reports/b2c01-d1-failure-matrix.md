# B2C-01-D1 failure matrix

Production path (`!USE_LOCAL_STATE`). Source-authoritative for both `80bd34b` and `b1d057a`.

| Company create | CA create | Stvarno stanje | UI poruka | Može bezbedan retry? | Rizik |
|---|---|---|---|---|---|
| fail | nije pokrenut | Nema firme; modal ostaje open | `res.error` / `error_generic` | Da — ispravi formu i submit | Nizak |
| success | success *(intended)* | Firma + CA | `company_created` pa `admin_created` | N/A | — |
| success | **skipped silently** *(actual prod bug: missing `#sa-create-admin-btn`)* | **Firma postoji, CA ne** | Samo `company_created` (nema CA toast/error) | **Ne preko istog submit-a** (vidi dole) | **Visok — orphan tenant** |
| success | fail (validation) | Firma postoji; CA ne | `error_fill_admin_fields` / `ca_password_min` | Modal se **ipak zatvara**; polja ostaju u DOM | Visok — delimičan uspeh lažno “gotovo” |
| success | fail (API, ako bi se pozvao) | Firma postoji; CA ne; Auth rollback ako partial | `res.error` | Modal se zatvara; CA polja ne clear | Visok |
| success | timeout/unknown | Firma verovatno postoji; CA nepoznat | Toast success za firmu; CA ishod nejasан | Nema resume UI | Visok |
| duplicate retry (isti companyId) | — | Firma već postoji (409 `company-exists`) | Error “Firma već postoji…” | Submit vraća `false` **pre** CA → **CA se više ne pokušava** | Visok — zaključan orphan |

## Posebna pitanja

| # | Pitanje | Odgovor |
|---|---------|---------|
| 1 | Dupla firma na double-click? | Company korak: `runSingleSubmission` na `#sa-create-company-btn` sprečava paralelni submit. Drugi submit posle uspeha → 409. |
| 2 | Dva CA naloga? | Trenutni prod modal **ne poziva** `createUser`. Ako bi radio: email-already-exists → 409. Nema CA-only single-flight dugmeta. |
| 3 | UI laže da ništa nije sačuvano? | Obrnuto: toast kaže firma kreirana, a CA deo tiho propadne — deluje “uspeh” dok tenant nije operativan. |
| 4 | `companyId` izgubljen posle close? | Close **ne** clear-uje formu; `#sa-ca-company-id` ostaje. Ali resubmit prvo pada na company 409. |
| 5 | Lozinka mora ponovo? | Ako korisnik clear-uje / refresh — da. Password nije trajno čuvan (samo input value dok modal DOM živi). |
| 6 | Resume/retry samo za CA? | **Ne postoji** u UI (`#sa-create-admin-btn` missing). Smoke je koristio drugi `createUser` poziv. |
| 7 | Refresh ostavlja nepotpun tenant? | Da — firma u Firestore, bez CA; nema jasan recovery u create-modalu. |
| 8 | Audit razlikuje korake? | `company_created` (create-company). `user_created` (create-user, ako uspe). **Nema** `ca_followup_failed` audita jer CA poziv u prod modalu ne kreće. |

## Demo vs prod

| Mode | CA follow-up |
|------|----------------|
| `USE_LOCAL_STATE` | Radi lokalni push; clear CA fields on success; **ne koristi** missing button gate |
| Production / staging | **Broken** — `createUser` never started via modal |
