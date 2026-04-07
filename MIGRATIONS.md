# Automatic Migrations

This project uses **dbmate** to apply SQL migrations. **Generation** is automatic: compare your live PostgreSQL database with the desired schema in **`prisma/schema.prisma`**, using **migra** and a short-lived temporary database.

No `createdb` / `dropdb` CLI tools are required on the host; **`scripts/db-helper.mjs`** (Node + `pg`) creates and drops the temp DB.

## Why this approach?

- **Runtime stays on `pg`**: No Prisma Client queries in services (except generated **enums/types** from `@prisma/client` where useful).
- **Single source of truth**: `prisma/schema.prisma` describes the target schema; migra turns the diff into SQL.
- **dbmate keeps history**: Versioned files under `db/migrations/`, same apply/rollback workflow as always.

## Prerequisites

- **Node / npm** (project)
- **Prisma 7.x** — connection URL in **`prisma.config.ts`** (`process.env.DATABASE_URL` with a generate-only fallback if unset), not in `schema.prisma`
- **migra** (Python):

```bash
pip3 install migra-maintained psycopg2-binary
```

- **`DATABASE_URL` in `.env`** — The generator script builds a temp DB URL by replacing the substring **`gymapp`** in that URL with a temporary name. If your database name is not `gymapp`, adjust **`scripts/migrate-auto.sh`** (`TEMP_DB_URL=…`) or use a URL that contains `gymapp` for the main database name segment.

## Workflow

### 1. Edit `prisma/schema.prisma`

Model your desired tables, columns, enums, etc.

### 2. Generate a migration

```bash
npm run db:migrate:generate descriptive_name
```

If your npm version does not pass extra args to the script, use:

```bash
npm run db:migrate:generate -- descriptive_name
```

This runs **`scripts/migrate-auto.sh`**, which:

1. Creates a **temporary** database and applies the schema with **`npx prisma db push`** (desired state).
2. Runs **migra** **twice**:
   - **Forward** `migra "$REAL_DB" "$TEMP_DB"` → SQL to move the **real** DB toward the Prisma schema → becomes **`migrate:up`** (after filtering and post-processing).
   - **Reverse** `migra "$TEMP_DB" "$REAL_DB"` → SQL to undo that change → becomes **`migrate:down`** (after filtering and post-processing).
3. **Filters** migra stdout (warnings, `schema_migrations`, etc.) — see [What gets filtered](#what-gets-filtered).
4. Runs **`node scripts/postprocess-migra-sql.mjs`** on **up** and **down** (see [Enum and down post-processing](#enum-and-down-post-processing)).
5. Writes **`db/migrations/<timestamp>_descriptive_name.sql`** with `migrate:up` and `migrate:down`.
6. Drops the temporary database.

### 3. Review and apply

```bash
cat db/migrations/*_descriptive_name.sql # optional
npm run db:migrate
```

Always **read** the generated SQL before applying, especially for enums, data casts, and destructive changes.

## What gets filtered

### Forward SQL (`migrate:up`), before post-processing

Lines removed from migra output include:

- Migra banners: `WARNING`, `INFO`, `ERROR:`, `destructive`, `Use the --unsafe`
- **`drop constraint`**
- **`alter column` … `set default`** and **`set not null`** (reduces noisy diffs vs Prisma)
- Anything mentioning **`schema_migrations`** (dbmate’s tracking table; Prisma does not model it)

**Not** removed: **`ALTER COLUMN` … `SET DATA TYPE` / type changes** — required for enums, `timestamp(3)`, etc.

Then **`normalize_sql_keywords`** uppercases common SQL keywords (e.g. `ALTER`, `CREATE TYPE`, `USING`).

Then **`ADD COLUMN "`** is rewritten to **`ADD COLUMN IF NOT EXISTS "`** for idempotent ups.

### Reverse SQL (`migrate:down`), before post-processing

- Same migra noise removal as above (except the **up-only** `alter column set default/not null` strip).
- Keeps only lines that look like real DDL starters: `ALTER`, `CREATE`, `DROP`, `COMMENT`, `GRANT`, `REVOKE`, or `--` (avoids broken fragments from `schema_migrations` DDL split across lines).

## Enum and down post-processing

**`scripts/postprocess-migra-sql.mjs`** reads **`scripts/migra-postprocess.config.json`**:

| Phase        | Behavior                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`--up`**   | For each **`enumColumns`** entry, replaces migra’s single-line cast `ALTER … SET DATA TYPE "Enum" USING …` with a **`CASE … USING`** built from **`valueMap`**, so legacy text (e.g. `LOSE_FAT`) maps to Prisma enum values (`LOSE`). |
| **`--down`** | Drops any line matching regexes in **`downLineFilters`** (e.g. spurious **`UNIQUE USING INDEX`** lines from index/constraint naming differences).                                                                                     |

To add another column or synonyms, edit **`migra-postprocess.config.json`** only.

If the reverse migra run produces nothing usable, **`migrate:down`** is a short **manual placeholder** comment block — fill it in or fix the schema diff before relying on rollback.

## Commands reference

```bash
npm run db:migrate          # Apply pending migrations (dbmate up)
npm run db:migrate:down     # Rollback last migration
npm run db:migrate:new      # Create an empty migration (manual SQL)
npm run db:migrate:generate # Run migrate-auto.sh (pass migration name)

npm run db:prisma:format   # Format prisma/schema.prisma
npm run db:prisma:validate # Validate prisma/schema.prisma
npm run db:dump            # Export current schema (dbmate)
```

After changing **`prisma/schema.prisma`** enums or models used in TypeScript, run **`npx prisma generate`** so **`@prisma/client`** stays in sync.

## Full example

```bash
# 1. Edit prisma/schema.prisma

# 2. Generate
npm run db:migrate:generate add_profile_field

# 3. Review db/migrations/*_add_profile_field.sql

# 4. Apply
npm run db:migrate
```

## This approach vs full Prisma Migrate

| Topic            | This repo                    | Full Prisma Migrate |
| ---------------- | ---------------------------- | ------------------- |
| Query layer      | `pg` (raw SQL)               | Often Prisma Client |
| Migration files  | dbmate SQL                   | Prisma migrations   |
| Schema authoring | `schema.prisma` + migra diff | `schema.prisma`     |

## Important notes

- Generated SQL is a **starting point**; complex or data-sensitive changes may need hand edits.
- Keep **`prisma/schema.prisma`** aligned with production after manual hotfixes.
- One-off SQL: **`npm run db:migrate:new name`** and edit the file.
- Avoid many duplicate `*_same_name.sql` files; keep dbmate history linear and meaningful.

## See also

- **[scripts/README.md](./scripts/README.md)** — Script-level reference (`migrate-auto.sh`, `db-helper.mjs`, post-process config).
- **[README.md](./README.md)** — Run, API overview, project layout.
