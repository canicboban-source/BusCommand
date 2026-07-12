# TransitFlow — Firebase Setup Uputstvo

Radi jednom, traje zauvijek.

---

## KORAK 1 — Novi Firebase projekat (EU region)

1. Idi na https://console.firebase.google.com
2. Klikni **"Add project"**
3. Naziv: `transitflow-prod`
4. Google Analytics: možeš uključiti
5. Klikni **Create project**

---

## KORAK 2 — Firestore baza (Frankfurt = EU)

1. U lijevom meniju: **Build → Firestore Database**
2. Klikni **Create database**
3. **VAŽNO — Location:** odaberi `europe-west3 (Frankfurt)` ← EU, GDPR OK
4. Security mode: **Start in production mode** (mi ćemo uploadovati naše rules)
5. Klikni **Enable**

---

## KORAK 3 — Firebase Authentication

1. U lijevom meniju: **Build → Authentication**
2. Klikni **Get started**
3. **Sign-in method** tab → Omogući:
   - ✅ **Email/Password** (za dispečere i admine)
   - ✅ **Custom** (za PIN login vozača — automatski dostupan)
4. Klikni Save

---

## KORAK 4 — Firebase Storage (za logo upload)

1. U lijevom meniju: **Build → Storage**
2. Klikni **Get started**
3. Location: `europe-west3` (isti region kao Firestore)
4. Start in production mode

---

## KORAK 5 — Web App Config (za frontend)

1. Klikni zupčanik ⚙️ pored "Project Overview"
2. **Project settings**
3. Skroli dole do **"Your apps"**
4. Klikni `</>` (Web ikona)
5. Naziv: `transitflow-web`
6. **Ne** uključuj Firebase Hosting zasad
7. Kopiraj config objekt koji dobiješ:

```javascript
const firebaseConfig = {
  apiKey: "...",
  authDomain: "transitflow-prod.firebaseapp.com",
  projectId: "transitflow-prod",
  storageBucket: "transitflow-prod.appspot.com",
  messagingSenderId: "...",
  appId: "..."
};
```

8. Zamijeni ovaj config u fajlu `firebase-service.js`

---

## KORAK 6 — Admin SDK Key (za backend server)

1. Klikni zupčanik ⚙️ → **Project settings**
2. Tab: **Service accounts**
3. Klikni **"Generate new private key"**
4. Klikni **Generate key** u dijalogu
5. Preuzme se JSON fajl — preimenuj ga u **`firebase-admin-key.json`**
6. **Stavi ga u tvoj TransitFlow folder** (isti folder kao api-server.js)

⚠️ **NIKAD ne stavljaj `firebase-admin-key.json` na GitHub ili javno!**
   Dodaj u `.gitignore`:
   ```
   firebase-admin-key.json
   node_modules/
   ```

---

## KORAK 7 — Postavi Firestore Security Rules

1. U Firebase Console: **Firestore → Rules** tab
2. Izbrišite sve i zalijepite sadržaj fajla `firestore.rules`
3. Klikni **Publish**

---

## KORAK 8 — Instaliraj Node.js pakete

Otvori Command Prompt u TransitFlow folderu:

```cmd
cd C:\Users\cane\Desktop\TransitFlow
npm install
```

Ovo instalira: express, firebase-admin, bcrypt, cors

---

## KORAK 9 — Kreiraj prvog SuperAdmin korisnika

1. Idi u Firebase Console → **Authentication → Users**
2. Klikni **Add user**
3. Email: `admin@transitflow.app` (ili tvoj email)
4. Lozinka: jaka lozinka
5. Kopiraj **User UID** koji se pojavi

Zatim postavi custom claims za SuperAdmin.
Privremeno uradi ovo jednom putem Firebase Console → Functions ili kopiraj UID i javi mi — kreiram ti setup skriptu.

---

## KORAK 10 — Pokreni server

```cmd
cd C:\Users\cane\Desktop\TransitFlow
npm start
```

Otvori browser: http://localhost:8765

---

## Provjera da je sve OK

- ✅ Firebase projekat je kreiran
- ✅ Firestore baza je u `europe-west3` (Frankfurt)
- ✅ Email/Password auth je uključen
- ✅ `firebase-admin-key.json` je u TransitFlow folderu
- ✅ `firebase-service.js` ima novi config
- ✅ Firestore rules su publishani
- ✅ `npm install` je završen
- ✅ Server se pokreće bez grešaka

---

*Nakon ovoga radimo: kreiranje prve firme i prvog dispečera.*
