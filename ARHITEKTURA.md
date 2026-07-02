# TransitFlow — SaaS Platforma: Arhitekturalni Plan

**Verzija:** 1.0  
**Datum:** Juni 2026  
**Autor:** Boban Canic

---

## 1. VIZIJA

TransitFlow je B2B SaaS platforma za upravljanje bus flotama. Svaka transportna firma
(klijent) dobija izolovano okruženje sa sopstvenim podacima, brandingom i korisnicima.
Super Admin (ti) kontroliše sve firme, licence i plaćanje.

---

## 2. KORISNIČKE ULOGE

```
SuperAdmin (Boban)
│
├── Company Admin (npr. Blaguss, FlixBus, Arriva...)
│   ├── Dispatcher (dispečer u firmi)
│   └── Driver (vozač u firmi)
└── (buduće: Support Agent)
```

| Uloga         | Šta može                                                          |
|---------------|-------------------------------------------------------------------|
| SuperAdmin    | Sve: firme, licence, billing, suspend/aktivacija, globalni report |
| CompanyAdmin  | Firma settings, logo/boje, dodavanje dispatchers i drivers        |
| Dispatcher    | Smjene, poruke, SOS, pregled vozača                               |
| Driver        | Login PIN-om, vlastita tabla, SOS dugme, poruke                   |

---

## 3. MULTI-TENANT DATA MODEL

### Princip izolacije

Svaka firma = jedinstven `companyId`. Svi podaci firme živu isključivo pod
`/companies/{companyId}/...` u bazi. Firebase Security Rules blokiraju
međusobni pristup. Firme A i B **nikad ne vide jedne druge podatke**.

### Firestore Schema

```
/superadmin/
  config                        ← globalne postavke platforme
  /licenses/{licenseId}         ← sve licence
  /audit_global/{logId}         ← super admin akcije

/companies/{companyId}/
  profile                       ← osnovni podaci firme
  settings                      ← plan, limiti, GDPR postavke
  branding                      ← logo URL, boje, font
  
  /users/{userId}               ← admini i dispečeri firme
  /drivers/{driverId}           ← vozači firme
  /shifts/{shiftId}             ← smjene
  /messages/{messageId}         ← poruke dispečer ↔ vozač
  /sos/{sosId}                  ← SOS alarmi
  /schedules/{scheduleId}       ← raspored po linijama
  /audit_log/{logId}            ← GDPR: log svih akcija u firmi
```

---

## 4. DETALJNI DATA MODEL

### /companies/{companyId}/profile
```json
{
  "name": "Blaguss Reisen GmbH",
  "slug": "blaguss",
  "country": "AT",
  "vatNumber": "ATU12345678",
  "address": "Laxenburger Str. 246, 1230 Wien",
  "contactEmail": "admin@blaguss.com",
  "phone": "+43 1 610 90",
  "timezone": "Europe/Vienna",
  "defaultLanguage": "de",
  "status": "active",
  "createdAt": "2026-01-15T10:00:00Z",
  "suspendedAt": null,
  "suspendReason": null
}
```

### /companies/{companyId}/branding
```json
{
  "logoUrl": "https://storage.../blaguss/logo.png",
  "primaryColor": "#C8102E",
  "secondaryColor": "#1A1A2E",
  "accentColor": "#FFD700",
  "appTitle": "BLAGUSS Fleet",
  "loginSubtitle": "Bringt Sie weiter",
  "favicon": "https://storage.../blaguss/favicon.ico"
}
```

### /companies/{companyId}/settings
```json
{
  "plan": "pro",
  "maxDrivers": 200,
  "maxDispatchers": 10,
  "trialEndsAt": null,
  "features": {
    "liveMap": true,
    "pdfSchedules": true,
    "excelImport": true,
    "sosAlarm": true,
    "multiLanguage": true,
    "reports": true
  },
  "gdpr": {
    "dpoEmail": "dpo@blaguss.com",
    "dataRetentionDays": 365,
    "privacyPolicyUrl": "https://blaguss.com/datenschutz"
  },
  "billing": {
    "stripeCustomerId": "cus_xxx",
    "stripeSubscriptionId": "sub_xxx",
    "currentPeriodEnd": "2026-07-15T00:00:00Z"
  }
}
```

### /companies/{companyId}/users/{userId}
```json
{
  "firebaseUid": "uid_abc123",
  "email": "dispatcher@blaguss.com",
  "name": "Hans Müller",
  "role": "dispatcher",
  "companyId": "blaguss",
  "active": true,
  "createdAt": "2026-01-15T10:00:00Z",
  "lastLoginAt": "2026-06-26T08:30:00Z",
  "permissions": {
    "canEditDrivers": true,
    "canDeleteShifts": false,
    "canExportData": true
  }
}
```

### /companies/{companyId}/drivers/{driverId}
```json
{
  "id": "drv-001",
  "name": "Nikola Petrović",
  "pin": "2b4f...",
  "pinSalt": "x9z...",
  "bus": "W-1234",
  "phone": "+43 676 123 456",
  "email": "nikola@example.com",
  "companyId": "blaguss",
  "active": true,
  "createdAt": "2026-02-01T09:00:00Z",
  "gdprConsent": {
    "given": true,
    "timestamp": "2026-02-01T09:05:00Z",
    "version": "1.2"
  }
}
```

### /superadmin/licenses/{licenseId}
```json
{
  "licenseId": "lic-blaguss-2026",
  "companyId": "blaguss",
  "plan": "pro",
  "status": "active",
  "startDate": "2026-01-15T00:00:00Z",
  "endDate": null,
  "trialEnd": "2026-02-14T23:59:59Z",
  "stripeCustomerId": "cus_xxx",
  "stripeSubscriptionId": "sub_xxx",
  "price": 149.00,
  "currency": "EUR",
  "billingCycle": "monthly",
  "createdBy": "superadmin",
  "notes": "Firma iz Beča, kontakt: Stefan"
}
```

---

## 5. PLANOVI I CIJENE (prijedlog)

| Plan      | Cijena/mj | Vozači | Dispečeri | Funkcije                          |
|-----------|-----------|--------|-----------|-----------------------------------|
| Trial     | 0 €       | 10     | 2         | Osnovne, 30 dana, watermark       |
| Starter   | 49 €      | 50     | 5         | Sve osnovne                       |
| Pro       | 149 €     | 200    | 15        | Sve + live mapa + PDF + Excel     |
| Enterprise| po ugovoru| ∞      | ∞         | Sve + custom domain + SLA         |

---

## 6. AUTENTIFIKACIJA

### Tok prijave

```
CompanyAdmin / Dispatcher:
  Email + Lozinka → Firebase Auth → Custom Claims (companyId, role)
  → Firestore Security Rules provjera → Pristup SAMO svojoj firmi

Driver:
  Odabere firmu → Unese PIN → Backend API provjeri hash
  → Dobije session token (JWT) → Pristup SAMO svom profilu
```

### Firebase Custom Claims
```json
{
  "role": "dispatcher",
  "companyId": "blaguss",
  "permissions": ["read_shifts", "write_messages", "read_drivers"]
}
```

### Firestore Security Rules (ključni princip)
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // SuperAdmin pristup svemu
    match /{document=**} {
      allow read, write: if isSuperAdmin();
    }
    
    // Firma može čitati/pisati SAMO svoje podatke
    match /companies/{companyId}/{document=**} {
      allow read, write: if isCompanyMember(companyId)
                         && isLicenseActive(companyId);
    }
    
    function isSuperAdmin() {
      return request.auth.token.role == 'superadmin';
    }
    
    function isCompanyMember(companyId) {
      return request.auth.token.companyId == companyId;
    }
  }
}
```

---

## 7. GDPR USKLAĐENOST (Austrija / EU)

### Tehnički zahtjevi

| Zahtjev                        | Implementacija                                    |
|--------------------------------|---------------------------------------------------|
| Lokacija podataka u EU         | Firebase region: europe-west3 (Frankfurt)         |
| Pravo na pristup (Art. 15)     | Export dugme — JSON/CSV svih podataka firme       |
| Pravo na brisanje (Art. 17)    | Delete Company funkcija — briše sve podatke       |
| Minimizacija podataka          | Čuvamo samo što je neophodno za rad               |
| Audit trail                    | Svaka akcija loguje se u /audit_log/              |
| PIN hashing                    | bcrypt (ne čuvamo plain text PIN-ove)             |
| Data retention                 | Auto-brisanje starih logova (konfigurabilno)      |
| Consent vozača                 | GDPR consent zapis u driver profilu               |
| DPA sa Google/Firebase         | Potpisati Data Processing Agreement               |
| Cookie consent                 | Implementirati na web portalu                     |

### Audit Log format
```json
{
  "action": "driver_created",
  "actorId": "dispatcher-uid-123",
  "actorRole": "dispatcher",
  "targetId": "drv-001",
  "targetType": "driver",
  "timestamp": "2026-06-27T10:30:00Z",
  "ipAddress": "192.168.1.1",
  "details": { "driverName": "Nikola Petrović" }
}
```

---

## 8. BILLING (Stripe integracija)

```
Firma se registruje
    ↓
Trial 30 dana (automatski)
    ↓
Email upozorenje 7 dana prije isteka
    ↓
Odabir plana → Stripe Checkout
    ↓
Stripe Webhook → ažurira license status u Firestore
    ↓
Neplaćanje → status = "suspended" → firma ne može ući
    ↓
SuperAdmin može manualno extend/override
```

### Stripe Webhook eventi
- `invoice.payment_succeeded` → status = active
- `invoice.payment_failed` → upozorenje, grace period 3 dana
- `customer.subscription.deleted` → status = suspended

---

## 9. SUPER ADMIN PANEL

### Funkcionalnosti
- Pregled svih firmi (ime, plan, status, zadnje logovanje)
- Aktivacija / suspendovanje firme jednim klikom
- Ručno produžavanje trial perioda
- Pregled billing historije
- Impersonacija (login kao company admin za support)
- Globalni report: broj vozača, smjena, SOS alarma
- Email firma (direktno iz panela)

---

## 10. TECH STACK

| Komponenta        | Tehnologija                              |
|-------------------|------------------------------------------|
| Frontend          | HTML/CSS/JS (trenutni) → React (faza 2) |
| Backend API       | Node.js + Express                        |
| Auth              | Firebase Authentication                  |
| Baza podataka     | Firebase Firestore (europe-west3)        |
| File storage      | Firebase Storage (logoi, PDF-ovi)        |
| Billing           | Stripe                                   |
| Email             | SendGrid ili Resend                      |
| Hosting           | Firebase Hosting + Cloud Functions       |
| SuperAdmin panel  | Posebna HTML/JS aplikacija               |
| Monitoring        | Firebase Analytics + Crashlytics         |

---

## 11. REDOSLIJED RAZVOJA

### Faza 1 — Temelj (SADA)
1. Firebase projekat podesiti na EU region
2. Auth sistem: email/lozinka za dispečere, PIN za vozače
3. Multi-tenant Firestore schema + Security Rules
4. Company Settings (branding, boje, logo upload)
5. SuperAdmin panel (osnova)

### Faza 2 — Kontrola
6. Stripe billing integracija
7. Trial management + email notifikacije
8. License enforcement (blokada pristupa)
9. GDPR: export, brisanje, audit log
10. SuperAdmin: impersonacija, reports

### Faza 3 — Growth
11. Custom domain po firmi (blaguss.transitflow.app)
12. Mobile app (React Native ili PWA)
13. API za integracije (GPS, HR sistemi)
14. White-label (firma ima potpuno vlastiti branding)

---

## 12. SIGURNOST

- Sve lozinke: Firebase Auth (bcrypt, Argon2 — ne upravljamo sami)
- PIN-ovi vozača: bcrypt hash, nikad plain text
- HTTPS everywhere
- Rate limiting na API endpointima
- 2FA za SuperAdmin (obavezno) i CompanyAdmin (opciono)
- Firebase App Check (zaštita od bots)
- Redovni security review

---

*Dokument se ažurira tokom razvoja.*
