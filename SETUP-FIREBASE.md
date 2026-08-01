# BusCommand Preview — Firebase podešavanje

Ova kopija aplikacije smije koristiti isključivo Firebase projekat
`buscommand-preview`. Firestore lokacija je `eur3`, a Email/Password prijava mora
biti uključena.

## Browser konfiguracija

Frontend konfiguracija se ne upisuje u JavaScript izvor. Vite je učitava tokom
builda iz sljedećih varijabli:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Dozvoljene Preview vrijednosti nalaze se u `.env.example` i `render.yaml`.
Aplikacija u non-demo načinu odbija pokretanje ako neka vrijednost nedostaje ili
ako domen, bucket ili project ID ne pripadaju projektu `buscommand-preview`.
Demo način ne inicijalizuje Firebase SDK.

## Serverska konfiguracija

`FIREBASE_SERVICE_ACCOUNT_JSON` je zasebna serverska tajna i postavlja se samo u
secret store hostinga. Ne pripada browser konfiguraciji i nikada se ne commituje.
Za lokalni razvoj server podržava gitignored `firebase-admin-key.json`; ne treba ga
preuzimati niti koristiti za frontend.

## Rules

Lokalna konfiguracija u `.firebaserc` cilja `buscommand-preview`. Pravila se prvo
provjeravaju emulator testovima. Deploy se radi samo uz posebno odobrenje i
eksplicitni `--project buscommand-preview` parametar.
