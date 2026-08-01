# BusCommand Preview — product scope

Operativna aplikacija za autobuski saobraćaj i jednostavnu komunikaciju vozača, disponenta i administratora. Prioriteti su stabilnost, brzina, mala potrošnja resursa, izolacija podataka firme i privatnost poruka.

## Izvan opsega

Knjigovodstvo, gorivo, plate, dnevnice, fakture, PDV, poreski i drugi finansijski obračuni nisu dio proizvoda.

## Identitet vozača

CSV ulaz sadrži EID, ime, prezime, telefon, email i jedinstveni company code. Javni direktorij prikazuje samo ime i prezime uz opaque ID. EID služi samo serverskoj identifikaciji. Company/login kodovi se čuvaju samo kao bcrypt hash i nikada se ne prikazuju niti izvoze.
