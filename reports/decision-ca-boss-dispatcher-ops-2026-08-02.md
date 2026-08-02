# Odluka — CA šef / disponent operacija

Datum: **2026-08-02**  
Status: **zaključano** (odluka #7 + usvajanje 1–5)

## Model rada

| Uloga | Priroda | Mora nonstop online? |
|-------|---------|----------------------|
| **Company Admin** | Glavni šef firme | Ne |
| **Disponent** | Operativni vlasnik dodeljenih grupa | Da (u smeni / radnom danu) |
| **Vozač** | Izvršilac sopstvene smene | Samo u svom toku |
| **Super Admin** | Platforma | Ne za dnevni saobraćaj tenanta |

## Granice

| Resurs | CA | Disponent |
|--------|----|-----------|
| Firma / brending / grupe / tim dispečera | Piše | Ne |
| Kreiranje / aktivacija naloga vozača | Piše | Ne (nema tajne) |
| Zvanični katalog smena (uvoz) | Piše + potvrda | Pregled / korišćenje |
| Dnevni i mesečni plan (dodele, zamene) | **Samo uvid** | **Piše** (+ first-lock) |
| Autobusi (uvoz + status) | **Samo uvid** | **Piše** |
| Poruke / SOS / incidenti | Uvid gde treba | Operiše |
| Plan lock | Break-glass (skida lock + audit) | Drži / release |
| Audit | Pregled tenant audita | Sopstvene izmene u trag |

## Test proizvoda

Ako kvar autobusa, tehnički ili zamena vozača zahtevaju da CA bude online — proizvod je pogrešno namješten.
