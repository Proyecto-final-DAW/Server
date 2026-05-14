# Scripts (migrations & DB helper)

This folder supports **automatic dbmate migrations** driven by **`prisma/schema.prisma`**. For the full workflow, filters, and caveats, read **[MIGRATIONS.md](../MIGRATIONS.md)** in the project root.

## migrate-auto.sh

**Entry:** `pnpm run db:migrate:generate` → `./scripts/migrate-auto.sh <migration_name>`  
If pnpm does not pass the name through, use:

```bash
pnpm run db:migrate:generate -- my_migration_name
```

**Requirements**

- **migra** (Python): `pip3 install migra-maintained psycopg2-binary`
- **Prisma 7.x** + **`prisma.config.ts`** (uses `DATABASE_URL` from the environment, or a placeholder during `prisma generate` only)
- **`.env`** with **`DATABASE_URL`** (script loads it when present)

**Steps (summary)**

1. Create a temporary PostgreSQL database (via **`db-helper.mjs`** — no `createdb` CLI required).
2. **`prisma db push`** that DB to the desired schema.
3. **migra** forward: real DB → temp DB → filtered → **`postprocess-migra-sql.mjs --up`** → **`migrate:up`** body.
4. **migra** reverse: temp DB → real DB → filtered → **`postprocess-migra-sql.mjs --down`** → **`migrate:down`** body (or a manual placeholder if empty).
5. **`dbmate new`** and write the SQL file; drop the temp DB.

**Important:** The script builds the temp DB URL by replacing **`gymapp`** inside **`DATABASE_URL`**. If your database name differs, see **MIGRATIONS.md** (Prerequisites).

Always **review** the generated SQL before **`pnpm run db:migrate`**.

## postprocess-migra-sql.mjs & migra-postprocess.config.json

| File                                | Role                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`migra-postprocess.config.json`** | Declarative rules: **`enumColumns`** (synonym → enum value for safe `CASE … USING`), **`downLineFilters`** (regexes to drop noisy rollback lines). |
| **`postprocess-migra-sql.mjs`**     | Reads stdin, applies config for **`--up`** or **`--down`**, writes stdout. Invoked from **`migrate-auto.sh`** only.                                |

Add new enum columns or synonyms by editing **only** the JSON file.

## db-helper.mjs

Creates or drops a PostgreSQL database using the **`pg`** driver (used for the migra temp DB).

```bash
node scripts/db-helper.mjs create-db <database_name>
node scripts/db-helper.mjs drop-db <database_name>
```

Requires **`DATABASE_URL`** (e.g. from `.env`). Normally you do not run this by hand.

## pnpm scripts (migrations & Prisma)

```bash
pnpm run db:migrate          # dbmate up — apply pending migrations
pnpm run db:migrate:down     # Rollback last migration
pnpm run db:migrate:new      # Empty migration template
pnpm run db:migrate:generate # Runs migrate-auto.sh — pass name (see above)

pnpm run db:dump            # dbmate schema dump
pnpm run db:prisma:format   # Format prisma/schema.prisma
pnpm run db:prisma:validate # Validate prisma/schema.prisma
```

After changing enums or models used in TypeScript, from the repo root:

```bash
pnpm exec prisma generate
```

## See also

- **[../MIGRATIONS.md](../MIGRATIONS.md)** — Complete migration documentation
- **[../README.md](../README.md)** — Run instructions and API overview
