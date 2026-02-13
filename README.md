# Proyecto-Final-DAW — Backend

Web application for new gym users (Express server).

## Prerequisites

- **Node.js v22.19+** → https://nodejs.org
- **npm v10.9+** (included with Node.js)
- **Git v2.51+** → https://git-scm.com
- **Docker Desktop** (option A) → https://www.docker.com/products/docker-desktop
- **PostgreSQL 15** (option B) → https://www.postgresql.org/download

## 1. Clone
```bash
git clone https://github.com/tmllabres/Proyecto-Final-DAW-server.git
cd Proyecto-Final-DAW-server
```

## 2. Database

### Option A — With Docker (recommended)
```bash
docker compose up -d
```

To check it's running:
```bash
docker compose ps
```

To stop:
```bash
docker compose down
```

### Option B — Without Docker (local PostgreSQL)

1. Install PostgreSQL 15 from the official website
2. During installation, set password to: `gympass`
3. Open **SQL Shell (psql)** from the Start menu
4. Press Enter on everything until it asks for password → type `gympass`
5. Run:
```sql
CREATE USER gymuser WITH PASSWORD 'gympass';
CREATE DATABASE gymapp OWNER gymuser;
\q
```

## 3. Install and run
```bash
cp .env.example .env
npm install
npm run dev
```

On PowerShell if `cp` doesn't work:
```powershell
copy .env.example .env
```

Check: http://localhost:3000/api/health → should show `{"status":"ok"}`

## Workflow
```bash
git checkout develop
git pull origin develop
git checkout -b feature/ticket-name
# work...
git add .
git commit -m "feat: change description"
git push origin feature/ticket-name
```

Open PR on GitHub → wait for approval → merge.
