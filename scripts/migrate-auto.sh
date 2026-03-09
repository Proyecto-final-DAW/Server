#!/bin/bash

# Script to generate migrations automatically using migra
# Compares current DB schema with desired schema.prisma

set -e

MIGRATION_NAME=$1

if [ -z "$MIGRATION_NAME" ]; then
  echo "❌ You must provide a migration name"
  echo "Usage: ./scripts/migrate-auto.sh migration_name"
  exit 1
fi

# Load environment variables
if [ -f .env ]; then
  export $(cat .env | tr -d '\r' | grep -v '^#' | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is not set in .env"
  exit 1
fi

# Check that migra is installed
if ! command -v migra &> /dev/null; then
  echo "❌ migra is not installed"
  echo "💡 Install with: pip3 install migra-maintained psycopg2-binary"
  exit 1
fi

# Create temporary database for desired schema (using Node + pg; no createdb/dropdb needed)
TEMP_DB_NAME="gymapp_migra_temp_$$"
TEMP_DB_URL="${DATABASE_URL/gymapp/$TEMP_DB_NAME}"

echo "📦 Creating temporary database for desired schema..."

# Drop temp DB if it exists from a previous run, then create it
node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
node scripts/db-helper.mjs create-db "$TEMP_DB_NAME" || {
  echo "❌ Failed to create temporary database"
  exit 1
}

# Save original DATABASE_URL
ORIGINAL_DATABASE_URL="$DATABASE_URL"

# Apply Prisma schema directly to temporary DB (desired state)
echo "📋 Applying schema.prisma to temporary DB (desired state)..."
export DATABASE_URL="$TEMP_DB_URL"
npx prisma db push --schema=./prisma/schema.prisma --accept-data-loss || {
  echo "❌ Error applying schema from Prisma"
  export DATABASE_URL="$ORIGINAL_DATABASE_URL"
  node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
  exit 1
}

# Restore original DATABASE_URL for comparison
# We compare: real DB (current state) vs temporary DB (desired state)
export DATABASE_URL="$ORIGINAL_DATABASE_URL"

# Compare schemas and generate migration
echo "🔍 Comparing schemas..."
# Use --unsafe so migra outputs SQL even when it includes destructive changes (e.g. DROP);
# always review the generated migration before applying
MIGRATION_SQL=$(migra "$DATABASE_URL" "$TEMP_DB_URL" --with-privileges --unsafe 2>&1 || true)

# Clean migra output (drop warnings, info, error lines; keep only SQL)
# Strip: drop constraint; alter column (set default|not null|data type) for existing columns — keep only additive changes e.g. add column
# Strip: anything touching schema_migrations (dbmate's table — never modify it)
CLEAN_SQL=$(echo "$MIGRATION_SQL" | grep -v "^WARNING" | grep -v "^INFO" | grep -v "ERROR:" | grep -v "destructive" | grep -v "Use the --unsafe" | grep -v "drop constraint" | grep -v 'alter column.*set default' | grep -v 'alter column.*set not null' | grep -v 'alter column.*set data type' | grep -v "schema_migrations" | sed '/^$/d')

# Normalise SQL keywords to uppercase (ALTER, TABLE, ADD COLUMN, DROP COLUMN, DEFAULT, etc.)
CLEAN_SQL=$(echo "$CLEAN_SQL" | sed \
  -e 's/^alter /ALTER /g' \
  -e 's/ add column / ADD COLUMN /g' \
  -e 's/ drop column / DROP COLUMN /g' \
  -e 's/ table / TABLE /g' \
  -e 's/ default / DEFAULT /g' \
  -e 's/ not null/ NOT NULL/g' \
  -e 's/ primary key/ PRIMARY KEY/g' \
  -e 's/ unique / UNIQUE /g' \
  -e 's/ references / REFERENCES /g' \
  -e 's/ on delete / ON DELETE /g' \
  -e 's/ on update / ON UPDATE /g' \
  -e 's/ constraint / CONSTRAINT /g' \
  -e 's/ create index / CREATE INDEX /g' \
  -e 's/ create unique index / CREATE UNIQUE INDEX /g' \
  -e 's/ using / USING /g')

if [ -z "$CLEAN_SQL" ] || echo "$CLEAN_SQL" | grep -q "Nothing to do"; then
  echo "⚠️  No differences between schemas"
  echo "💡 Current schema already matches schema.prisma"

  # Cleanup
  node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
  exit 0
fi

# Create new migration with dbmate
echo "📝 Creating migration: $MIGRATION_NAME..."
npx dbmate new "$MIGRATION_NAME"

# Find the newly created migration file
MIGRATION_FILE=$(ls -t db/migrations/*${MIGRATION_NAME}*.sql 2> /dev/null | head -1)

if [ -z "$MIGRATION_FILE" ]; then
  echo "❌ Could not find migration file"
  node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
  exit 1
fi

# Idempotent up: ADD COLUMN -> ADD COLUMN IF NOT EXISTS
UP_SQL=$(echo "$CLEAN_SQL" | sed 's/ADD COLUMN "/ADD COLUMN IF NOT EXISTS "/g')

# Generate rollback (migrate:down) for common statements.
# We intentionally keep this conservative and purely structural (no data backfills).
DOWN_SQL=$(
  echo "$UP_SQL" | awk '
    function push_rb(s) { rb[++n] = s }
    function startswith(s, p) { return index(tolower(s), p) == 1 }
    function tok(i) { return t[i] }
    function untok(s) { sub(/[;,\)]*$/, "", s); return s }
    BEGIN { n = 0; in_create_table = 0 }
    {
      line = $0
      low = tolower(line)

      if (in_create_table) {
        if (line ~ /\);\s*$/) { in_create_table = 0 }
        next
      }

      # Tokenize by whitespace (good enough for our SQL format)
      split(line, t, /[ \t]+/)

      # CREATE TABLE ... (multi-line block)
      if (startswith(line, "create table") || startswith(line, "CREATE TABLE")) {
        table = untok(t[3])
        push_rb("DROP TABLE IF EXISTS " table " CASCADE;")
        in_create_table = 1
        next
      }

      # CREATE TYPE ... AS ENUM ...
      if (startswith(line, "create type") || startswith(line, "CREATE TYPE")) {
        typ = untok(t[3])
        push_rb("DROP TYPE IF EXISTS " typ " CASCADE;")
        next
      }

      # CREATE SEQUENCE ...
      if (startswith(line, "create sequence") || startswith(line, "CREATE SEQUENCE")) {
        seq = untok(t[3])
        push_rb("DROP SEQUENCE IF EXISTS " seq " CASCADE;")
        next
      }

      # CREATE [UNIQUE] INDEX ...
      if (startswith(line, "create index") || startswith(line, "CREATE INDEX") ||
          startswith(line, "create unique index") || startswith(line, "CREATE UNIQUE INDEX")) {
        # CREATE UNIQUE INDEX name ON ...
        idx = (tolower(t[2]) == "unique") ? untok(t[4]) : untok(t[3])
        push_rb("DROP INDEX IF EXISTS public." idx ";")
        next
      }

      # ALTER TABLE ... ADD COLUMN ...
      if (startswith(line, "ALTER TABLE") && low ~ / add column /) {
        table = untok(t[3])

        # Find the column token after COLUMN (optionally after IF NOT EXISTS)
        col = ""
        for (i = 1; i <= length(t); i++) {
          if (tolower(t[i]) == "column") {
            for (j = i + 1; j <= length(t); j++) {
              if (tolower(t[j]) == "if" || tolower(t[j]) == "not" || tolower(t[j]) == "exists") {
                continue
              }
              col = untok(t[j])
              break
            }
            break
          }
        }

        if (col != "") {
          push_rb("ALTER TABLE " table " DROP COLUMN IF EXISTS " col ";")
        }
        next
      }

      # ALTER TABLE ... ADD CONSTRAINT ...
      if (startswith(line, "ALTER TABLE") && low ~ / add constraint /) {
        table = untok(t[3])
        c = ""
        for (i = 1; i <= length(t); i++) {
          if (tolower(t[i]) == "constraint") {
            c = untok(t[i + 1])
            break
          }
        }
        if (c != "") {
          push_rb("ALTER TABLE " table " DROP CONSTRAINT IF EXISTS " c ";")
        }
        next
      }

      # ALTER TABLE ... VALIDATE CONSTRAINT ... (no-op on down)
      if (startswith(line, "ALTER TABLE") && low ~ / validate constraint /) {
        next
      }

      # ALTER SEQUENCE ... OWNED BY ... (no-op on down; dropping table/sequence handles it)
      if (startswith(line, "ALTER sequence") || startswith(line, "ALTER SEQUENCE")) {
        next
      }
    }
    END {
      for (i = n; i >= 1; i--) {
        print rb[i]
      }
    }'
)

# If we couldn’t infer any safe rollback statements, keep placeholder.
if [ -z "$DOWN_SQL" ]; then
  DOWN_SQL="-- Revert changes manually if needed
-- Review the SQL above to create the appropriate rollback"
fi

# Write SQL generated by migra
cat > "$MIGRATION_FILE" << EOF
-- migrate:up
$UP_SQL

-- migrate:down
$DOWN_SQL
EOF

echo "✅ Migration generated automatically: $MIGRATION_FILE"
echo ""
echo "📋 Generated SQL:"
echo "$UP_SQL"
echo ""
echo "⚠️  IMPORTANT: Review the migration before applying!"
echo "💡 Apply with: npm run db:migrate"

# Clean up temporary database
node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
