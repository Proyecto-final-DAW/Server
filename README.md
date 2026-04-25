# Gym App — Backend

Express API for gym users: **auth**, **stats**, **exercises**, **macros / nutrition**, and related user profile data.

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
cp .env.local.example .env.local
# Edit .env.local: set JWT_SECRET (and EXERCISEDB_API_KEY if needed)
npm install
npm run db:migrate # apply migrations
npm run dev
```

The server listens on `http://localhost:${PORT}` (see `.env.local`). On start it logs a successful database connection or exits if it cannot connect.

### Environment files

- **Development**: `.env.local` (see `.env.local.example`)
- **Production**: `.env.production` (see `.env.production.example`)
- **Optional base file**: `.env` (shared defaults; loaded first)

The DB migrations run via dbmate and require `DATABASE_URL`. `npm run db:migrate` loads the same env files as the server.

## API (overview)

Base URL: `http://localhost:<PORT>` (JSON bodies; `Content-Type: application/json`).

### Auth (`/users`)

| Method | Path                   | Auth         | Description                                                         |
| ------ | ---------------------- | ------------ | ------------------------------------------------------------------- |
| POST   | `/users/auth/register` | —            | Register `{ name, email, password }` → returns `token` (auto-login) |
| POST   | `/users/auth/login`    | —            | Login `{ email, password }` → returns `token`                       |
| POST   | `/users/auth/logout`   | Bearer token | Invalidates current session token                                   |

### Macros / nutrition (`/users`)

| Method | Path                              | Auth         | Description                                                             |
| ------ | --------------------------------- | ------------ | ----------------------------------------------------------------------- |
| POST   | `/users/:userId/macros/calculate` | Bearer token | `:userId` must match the authenticated user (`ensureSelf`). Body below. |

**`POST /users/:userId/macros/calculate` body**

```json
{
  "weightKg": 75,
  "heightCm": 180,
  "age": 30,
  "sex": "MALE",
  "activityFactor": 1.55,
  "goal": "LOSE",
  "save": false
}
```

- `sex`: `MALE` or `FEMALE` (Prisma `Sex` enum).
- `goal`: `LOSE`, `GAIN`, or `MAINTAIN` (Prisma `Goal` enum).
- `activityFactor`: physical activity level (PAL), **1.2–1.9**.
- `save` (optional): if `true`, persists `daily_calories`, `protein_grams`, `fat_grams`, and `carb_grams` on the user and returns `{ targets, user }`; if omitted or `false`, returns `{ targets }` only.

Header: `Authorization: Bearer <token>` from login.

### Other routers

- **`/stats`** — User stats (protected routes with `:userId` + `ensureSelf`).
- **`/exercises`** — Exercise search and images (see `src/routes/exercises.ts`).

## Scripts

| Command                              | Description                                                     |
| ------------------------------------ | --------------------------------------------------------------- |
| `npm run dev`                        | Start dev server (tsx watch)                                    |
| `npm run build`                      | Compile TypeScript                                              |
| `npm run start`                      | Build and run production                                        |
| `npm run lint`                       | Run ESLint                                                      |
| `npm run format`                     | Format with Prettier                                            |
| `npm run db:migrate`                 | Apply pending migrations                                        |
| `npm run db:migrate:down`            | Rollback last migration                                         |
| `npm run db:migrate:generate <name>` | Generate migration from `prisma/schema.prisma` (see note below) |
| `npm run db:migrate:new <name>`      | Create empty migration                                          |
| `npm run db:dump`                    | Export current schema                                           |
| `npm run db:prisma:format`           | Format Prisma schema                                            |
| `npm run db:prisma:validate`         | Validate Prisma schema                                          |

**Migrations:** Edit `prisma/schema.prisma`, then run `npm run db:migrate:generate descriptive_name`. If npm does not forward the name, use `npm run db:migrate:generate -- descriptive_name`. Details: [MIGRATIONS.md](./MIGRATIONS.md) and [scripts/README.md](./scripts/README.md).

After schema changes that affect generated types, run **`npx prisma generate`**.

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

- `src/` — Application code (Express, routes, controllers, services, db)
- `src/services/macros.service.ts` — Calorie and macro calculation (Mifflin–St Jeor)
- `db/migrations/` — dbmate SQL migrations
- `prisma/schema.prisma` — Source of truth for the DB shape; used with migra to generate migrations. TypeScript imports **`Sex` / `Goal`** (and related types) from **`@prisma/client`** after `npx prisma generate`.
- `scripts/` — `migrate-auto.sh`, `db-helper.mjs`, `postprocess-migra-sql.mjs`, `migra-postprocess.config.json`
- `.github/workflows/` — CI/CD (when added)

## Docs

- [MIGRATIONS.md](./MIGRATIONS.md) — End-to-end migration workflow, migra filters, enum post-processing, commands
- [scripts/README.md](./scripts/README.md) — `migrate-auto.sh`, `db-helper.mjs`, `postprocess-migra-sql.mjs`, config JSON
