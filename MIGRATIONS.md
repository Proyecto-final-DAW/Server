# Automatic Migrations

This project uses **dbmate** to run migrations, with **automatic generation** via **Prisma schema** + **migra**. No `createdb`/`dropdb` are required; the script uses Node + `pg` to create/drop the temporary database.

## Why this approach?

- ✅ **No code changes needed**: You keep using `pg` directly
- ✅ **Automatic migrations**: Compares your current DB with `prisma/schema.prisma` and generates SQL
- ✅ **Keeps dbmate**: Same workflow you already use
- ✅ **Schema as code**: `prisma/schema.prisma` is the source of truth

## Workflow

### 1. Define changes in `prisma/schema.prisma`

Edit `prisma/schema.prisma` to match the desired schema:

```prisma
model User {
  id              Int       @id @default(autoincrement())
  name            String   @db.VarChar(100)
  email           String   @unique @db.VarChar(100)
  tokens          String[] @default([])  // ← new field
  // ...
}
```

### 2. Generate migration

```bash
npm run db:migrate:generate add_tokens_to_users
```

The script:

1. Creates a temporary database and applies `schema.prisma` to it
2. Compares your real DB with that schema (using **migra**)
3. Writes a migration file in `db/migrations/` with:
   - **migrate:up**: SQL in UPPERCASE, with `ADD COLUMN IF NOT EXISTS` (and similar) where applicable
   - **migrate:down**: Rollback (e.g. `DROP COLUMN IF EXISTS`) generated from the up section when possible
4. Filters out unsafe or noisy statements (see below)

### 3. Review and apply

```bash
# Optional: check the generated file
cat db/migrations/*_add_tokens_to_users.sql

# Apply
npm run db:migrate
```

## What the generator does

- **Skips dangerous statements**: Removes `drop constraint` (e.g. so the unique on `email` is never dropped)
- **Skips dbmate's table**: Removes any statement touching `schema_migrations` (used by dbmate to track migrations; Prisma schema doesn't include it, so migra would try to drop it)
- **Skips noise**: Removes `alter column ... set default/not null/data type` for existing columns (Prisma vs PG timestamp differences)
- **Uppercase SQL**: Writes keywords as `ALTER`, `TABLE`, `ADD COLUMN`, `DEFAULT`, `DROP COLUMN`, etc.
- **Idempotent**: Uses `ADD COLUMN IF NOT EXISTS` and `DROP COLUMN IF EXISTS` where applicable
- **Rollback**: For `ADD COLUMN` statements, generates the corresponding `DROP COLUMN IF EXISTS` in `migrate:down`
- **Rollback (common DDL)**: Also generates `migrate:down` for common statements like `CREATE TABLE/TYPE/SEQUENCE/INDEX` and `ALTER TABLE ... ADD CONSTRAINT/ADD COLUMN` (best-effort, structural only)

## Available commands

```bash
# Migrations
npm run db:migrate          # Apply pending migrations
npm run db:migrate:down     # Rollback last migration
npm run db:migrate:new      # Create empty migration (manual)
npm run db:migrate:generate # Generate migration automatically

# Prisma (schema only)
npm run db:prisma:format   # Format prisma/schema.prisma
npm run db:prisma:validate # Validate prisma/schema.prisma

# Utilities
npm run db:dump # Export current schema
```

## Requirements

- **Node/npm**: Already used by the project
- **Prisma 7.x**: Connection URL goes in `prisma.config.ts` (`datasource.url: env("DATABASE_URL")`); do not put `url` in the schema file
- **migra** (Python): For schema diff

Install migra once (Python 3 required):

```bash
# macOS / Linux (Python 3)
pip3 install migra-maintained psycopg2-binary

# Windows, or when pip points to Python 3
pip install migra-maintained psycopg2-binary
```

Use `pip3` if your system has both Python 2 and 3; use `pip` if it already runs Python 3.

No PostgreSQL client tools (`createdb`, `dropdb`, `psql`) are required on the host; the script uses the project’s `pg` dependency and `scripts/db-helper.mjs` to create/drop the temporary database.

## Full example

```bash
# 1. Edit prisma/schema.prisma (e.g. add a new field)

# 2. Generate migration
npm run db:migrate:generate add_new_field

# 3. Review db/migrations/<timestamp>_add_new_field.sql

# 4. Apply
npm run db:migrate

# 5. Keep using pg in your code as usual
```

## This solution vs full Prisma

| Feature              | This solution   | Full Prisma  |
| -------------------- | --------------- | ------------ |
| Change existing code | ❌ Not required | ✅ Required  |
| Automatic migrations | ✅ Yes          | ✅ Yes       |
| Type safety          | ⚠️ Manual (TS)  | ✅ Automatic |
| Performance          | ✅ Direct SQL   | ⚠️ Overhead  |
| Learning curve       | ✅ Low          | ⚠️ Medium    |

## Important notes

- **Review** generated migrations before applying; the generator avoids known pitfalls but complex changes may need manual edits
- Keep `prisma/schema.prisma` in sync with the real schema
- For complex or one-off changes, you can still write migrations by hand with `npm run db:migrate:new name`
- If you generated several test migrations with the same name, keep only the one you intend to use and remove the others so dbmate’s history stays clear
