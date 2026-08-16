# D26 — Legal / privacy zapis: dežurni broj vidljiv vozačima + direktan SOS

Datum: 2026-08-16
Status: **tehnička pre-procena**, nije pravno mišljenje i nije potvrda usklađenosti.
Pilot tržište: Austrija. Ne pretpostavljati automatski RS/DE.
Dopunjuje: `reports/poglavlje-1-legal-open-2026-07-24.md` (stavke L1–L8).

## Šta je tehnički uvedeno u ovom prolazu

| Promena | Tehnički obim |
|---|---|
| `profile/main.dispatchPhone` | Novo tenant polje. Upisuje ga isključivo Company Admin kroz `PUT /api/company-admin/profile-settings` (server-side validacija, E.164). Klijent ne piše direktno. |
| Vidljivost | `companies/{id}/profile/main` je po `firestore.rules:36-39` čitljiv svakom `isCompanyMember` — dakle **svim aktivnim vozačima tog tenanta**. Nisu menjana pravila; polje je smešteno u dokument koji je vozaču ionako čitljiv. |
| Driver UI | Dugme „Pozovi dispečera" u zaglavlju vozačke aplikacije. Kratak klik → `tel:` GSM poziv. Dugme je skriveno dok polje nije popunjeno. |
| Audit | `company_profile_settings_updated` beleži samo `dispatchPhoneSet: true/false`. **Sam broj se ne upisuje u append-only audit log.** |
| SOS | Uklonjen modal „Da li ste sigurni?"; alarm se šalje posle 2s zadržavanja. Nema promene u tome koji se podaci šalju — i dalje `POST /api/driver/sos` sa `bus`. |

## Zašto ovo NIJE tretirano kao dispečerov lični podatak

Polje je u UI-ju i u hint tekstu na sva tri jezika eksplicitno označeno kao **službeni dežurni broj firme**, ne privatni mobilni dispečera:

- SR: „Upišite službeni broj firme, nikada privatni mobilni dispečera."
- DE: „…niemals das private Mobiltelefon eines Disponenten."
- EN: „…never a dispatcher's private mobile."

To je organizaciona mera, **ne tehnička kontrola**. Sistem ne može da razlikuje službeni od privatnog broja. Ako Company Admin ipak upiše privatni mobilni dispečera, nastaje obrada ličnog podatka zaposlenog koja nije pokrivena ovom procenom.

## Otvorene odluke (dodaju se postojećoj listi)

| ID | Pitanje | Prioritet | Blokira | Vlasnik |
|----|---------|-----------|---------|---------|
| L9 | Da li je „službeni dežurni broj" dovoljna organizaciona mera, ili je potrebna tehnička kontrola (npr. zabrana unosa broja koji se poklapa sa `users/{uid}.phone` nekog dispečera)? | High | Pilot sa popunjenim poljem | Pravnik + DPO |
| L10 | Ako tenant ipak unese lični broj dispečera: koji je pravni osnov (čl. 6(1)(f) legitimni interes vs. ugovorna obaveza), i da li je potrebna informacija zaposlenom po čl. 13? | High | L9 | DPO |
| L11 | Da li vidljivost dežurnog broja svim vozačima potpada pod ArbVG §96 kao mera koja dodiruje dostojanstvo zaposlenih? Prva procena: **ne** (to je kanal ka dispečeru, ne merenje vozača), ali odluku daje Betriebsrat. | Medium | Betriebsrat saglasnost pre pilota | Betriebsrat |
| L12 | Direktan SOS bez potvrde: povećava rizik lažnih alarma. Da li firma želi retention/rate-limit politiku za lažne SOS zapise i da li se lažni alarm sme koristiti u disciplinskom postupku? Ako sme — to je mera kontrole i vraća nas na ArbVG §96. | High | SOS retention politika | Vlasnik proizvoda + Betriebsrat |
| L13 | `tel:` poziv izlazi iz aplikacije u GSM mrežu operatera. BusCommand ne loguje poziv, ali operater loguje. Treba li to biti u privacy notice za vozače? | Low | Privacy notice | DPO |

## Šta NIJE urađeno i ne sme se tvrditi

- Nije rađena DPIA za ovu izmenu. Prva procena je da ne okida DSFA-V prag jer nema sistematskog praćenja, ali procenu potvrđuje DPO.
- Nije ažuriran privacy notice za vozače (L13).
- Nije ažurirana retention/deletion matrica za SOS zapise (L12).
- Ne tvrdi se da je funkcija „GDPR usklađena". Tvrdi se samo da je tehnički sprovedena minimizacija: jedan broj po firmi, bez broja u auditu, dugme skriveno kada polje nije popunjeno.

## Bezbednosna napomena (ne pravna)

`tel:` vrednost se pre upotrebe ponovo validira na klijentu (`^\+[1-9]\d{6,14}$`) pre nego što uđe u `window.location.href`. Vrednost koja ne prođe validaciju se ignoriše, pa kompromitovan `profile/main` ne može da ubaci proizvoljnu šemu (`javascript:`, `data:`) u navigaciju.
