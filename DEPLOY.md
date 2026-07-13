# BusCommand — Deploy (buscommand.com)

## Brzi pregled

| Komponenta | Opis |
|------------|------|
| **App** | Node.js Express (`api-server.js`) + Vite build (`dist/`) |
| **Port** | `8766` (ili `PORT` env) |
| **Demo online** | `https://buscommand.com/?mode=demo` |
| **Health** | `GET /api/health` |

---

## 1. Env varijable (produkcija)

Postavi na hostingu (Render, Railway, VPS, …):

```env
NODE_ENV=production
PORT=8766
LOG_LEVEL=info
CORS_ORIGINS=https://buscommand.com,https://www.buscommand.com
```

### Firebase Admin (jedan od načina)

**A) Env varijabla (preporučeno na cloudu)**  
Ceo JSON service account kao jedna linija:

```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...",...}
```

Kopiraj sadržaj `firebase-admin-key.json` (minifikovan, bez preloma linija).

**B) Fajl na VPS-u**  
`firebase-admin-key.json` u root folderu pored `api-server.js` (ne commituj u git).

Bez Firebase-a server radi samo u **demo modu** (`?mode=demo`).

**Render build greška `vite: not found`:** servis mora koristiti **Docker** (`Dockerfile`) ili build komanda:
`npm ci --include=dev && npm run build` (ne `npm install` sa `NODE_ENV=production` pre build-a).

---

## 2. DNS

U DNS panelu domena `buscommand.com`:

| Tip | Ime | Vrednost |
|-----|-----|----------|
| A | `@` | IP tvog servera |
| A ili CNAME | `www` | isti server / Render URL |

Provera (posle propagacije):

```powershell
nslookup buscommand.com
```

---

## 3. Opcija A — Render.com (najbrže)

1. https://render.com → **New** → **Blueprint**
2. Poveži GitHub repo: `canicboban-source/BusCommand`
3. Render učita `render.yaml`
4. U dashboardu dodaj secret **`FIREBASE_SERVICE_ACCOUNT_JSON`**
5. Deploy → dodeli custom domain `buscommand.com`
6. Smoke:

```powershell
node scripts/deploy-smoke.js https://buscommand.com
```

---

## 4. Opcija B — VPS + Docker

Na serveru (Ubuntu):

```bash
git clone https://github.com/canicboban-source/BusCommand.git
cd BusCommand
# postavi .env ili export FIREBASE_SERVICE_ACCOUNT_JSON
docker compose up -d --build
```

Nginx reverse proxy (primer):

```nginx
server {
    listen 80;
    server_name buscommand.com www.buscommand.com;
    location / {
        proxy_pass http://127.0.0.1:8766;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

SSL: `certbot --nginx -d buscommand.com -d www.buscommand.com`

---

## 5. Opcija C — VPS bez Docker

```bash
git clone https://github.com/canicboban-source/BusCommand.git
cd BusCommand
npm ci
npm run build
export NODE_ENV=production
export PORT=8766
export CORS_ORIGINS=https://buscommand.com,https://www.buscommand.com
# export FIREBASE_SERVICE_ACCOUNT_JSON='...'
npm start
```

Produkcija sa PM2:

```bash
npm install -g pm2
pm2 start api-server.js --name buscommand
pm2 save
pm2 startup
```

---

## 6. Lokalni produkcioni test (pre go-live)

```powershell
cd C:\Users\cane\Desktop\buscommand
docker compose up --build
# drugi terminal:
node scripts/deploy-smoke.js http://localhost:8766
```

Ili bez Docker-a:

```powershell
npm run build
$env:NODE_ENV="production"
$env:CORS_ORIGINS="http://localhost:8766"
npm start
```

---

## 7. Demo nalozi (online test)

| Uloga | Pristup |
|-------|---------|
| Admin | `admin@demo.com` / `demo123` |
| Dispečer | `demo@buscommand.com` / `demo123` |
| Vozač | Alex Driver / Sam Driver, PIN `1234` |

URL: **https://buscommand.com/?mode=demo**

---

## 8. Checklist posle deploya

- [ ] `GET /api/health` → `{ "status": "ok" }`
- [ ] Login prikazuje **BusCommand** (ne FleetPulse)
- [ ] `/?mode=demo` — dispečer i vozač login
- [ ] HTTPS radi na `www` i apex domenu
- [ ] `CORS_ORIGINS` uključuje oba domena
- [ ] Firebase secret postavljen (ako ide prod auth)

---

## 9. Rollback

Render/VPS: redeploy prethodnog commit-a iz GitHub-a.

Docker:

```bash
docker compose down
git checkout <prethodni-commit>
docker compose up -d --build
```
