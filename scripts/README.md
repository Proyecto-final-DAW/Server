# Migration Scripts

## migrate-auto.sh

Generates **dbmate** migrations automatically by comparing the current database with **Prisma**’s `schema.prisma`, using **migra** for the diff.

**Requirements**

- **migra** (Python): `pip3 install migra-maintained psycopg2-binary`
- **Prisma 7.x** and `prisma.config.ts` with `datasource.url` from `env("DATABASE_URL")`
- No `createdb`/`dropdb` needed; the script uses Node and `scripts/db-helper.mjs` (pg) to create/drop the temporary DB

**Usage**

```bash
# 1. Edit prisma/schema.prisma with the desired schema

# 2. Generate migration
npm run db:migrate:generate descriptive_name

# 3. Review db/migrations/<timestamp>_descriptive_name.sql

# 4. Apply
npm run db:migrate
```

**What it does**

- Creates a temporary DB, applies `schema.prisma` with `prisma db push`
- Runs migra to diff your real DB vs that temp DB
- Writes a migration file with:
  - **migrate:up**: UPPERCASE SQL, `ADD COLUMN IF NOT EXISTS` (and similar), and filters out `drop constraint` and noisy `alter column` lines
  - **migrate:down**: Generated rollback (e.g. `DROP COLUMN IF EXISTS`) when the up section contains `ADD COLUMN`
- Cleans up the temporary database

## db-helper.mjs

Helper used by `migrate-auto.sh` to create and drop the temporary PostgreSQL database via the `pg` driver (so `createdb`/`dropdb` are not required).

```bash
# Called by the script; usually you don’t run this yourself
node scripts/db-helper.mjs create-db <name>
node scripts/db-helper.mjs drop-db <name>
```

Requires `DATABASE_URL` in the environment (e.g. from `.env`).

## Commands

```bash
npm run db:migrate              # Apply pending migrations
npm run db:migrate:down         # Rollback last migration
npm run db:migrate:new          # Create empty migration (manual)
npm run db:migrate:generate     # Generate migration (runs migrate-auto.sh)
npm run db:dump                 # Export current schema
npm run db:prisma:format        # Format prisma/schema.prisma
npm run db:prisma:validate      # Validate prisma/schema.prisma
```

Full details: [MIGRATIONS.md](../MIGRATIONS.md) in the project root.
