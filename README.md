# Gym App — Backend

Express API for gym users (auth, users, health).

## Prerequisites

- **Node.js v22+** → https://nodejs.org
- **npm v10+** (included with Node.js)
- **Git** → https://git-scm.com
- **Docker** (option A) → https://www.docker.com/products/docker-desktop
- **PostgreSQL 15** (option B) → https://www.postgresql.org/download
- **Python 3 + pip** (for automatic migrations) → `pip3 install migra-maintained psycopg2-binary`

## 1. Clone

```bash
git clone <your-repo-url>
cd Server
```

## 2. Database

### Option A — Docker (recommended)

```bash
docker compose up -d
```

Check: `docker compose ps` · Stop: `docker compose down`

### Option B — Local PostgreSQL

1. Install PostgreSQL 15; set password to `gympass`.
2. Create user and DB:

```sql
CREATE USER gymuser WITH PASSWORD 'gympass';
CREATE DATABASE gymapp OWNER gymuser;
\q
```

## 3. Install and run

```bash
cp .env.example .env
# Edit .env: set JWT_SECRET (and EXERCISEDB_API_KEY if needed)
npm install
npm run db:migrate   # apply migrations
npm run dev
```

Check: http://localhost:3000/api/health → `{"status":"ok"}`

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start dev server (tsx watch) |
| `npm run build` | Compile TypeScript |
| `npm run start` | Build and run production |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:migrate:down` | Rollback last migration |
| `npm run db:migrate:generate <name>` | Generate migration from `prisma/schema.prisma` |
| `npm run db:migrate:new <name>` | Create empty migration |
| `npm run db:dump` | Export current schema |
| `npm run db:prisma:format` | Format Prisma schema |
| `npm run db:prisma:validate` | Validate Prisma schema |

**Migrations:** Edit `prisma/schema.prisma`, then `npm run db:migrate:generate descriptive_name`. See [MIGRATIONS.md](./MIGRATIONS.md).

## Workflow

```bash
git checkout develop
git pull origin develop
git checkout -b feature/short-name
# work...
git add .
git commit -m "feat: description"
git push origin feature/short-name
```

Open a PR → review → merge.

## Project layout

- `src/` — Application code (Express, routes, services, db)
- `db/migrations/` — dbmate SQL migrations
- `prisma/schema.prisma` — Schema used to generate migrations (not Prisma Client in code)
- `scripts/` — Migration generator (`migrate-auto.sh`), db helper
- `.github/workflows/` — CI/CD (when added)

## Docs

- [MIGRATIONS.md](./MIGRATIONS.md) — Automatic migrations (dbmate + Prisma + migra)
- [scripts/README.md](./scripts/README.md) — Scripts reference
