#!/bin/bash

# Generate dbmate migrations from prisma/schema.prisma (migra + Prisma temp DB).
#
# After migra, scripts/postprocess-migra-sql.mjs reads scripts/migra-postprocess.config.json:
#   - enumColumns: replace brittle text→enum ALTER lines with CASE … USING (synonym lists).
#   - downLineFilters: regexes; matching lines removed from migrate:down (migra/dbmate noise).

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

# Up: strip noisy alters; down: only strip migra noise so rollback stays complete
filter_migra_up_lines() {
  grep -v "^WARNING" | grep -v "^INFO" | grep -v "ERROR:" | grep -v "destructive" | grep -v "Use the --unsafe" | grep -v "drop constraint" | grep -v 'alter column.*set default' | grep -v 'alter column.*set not null' | grep -v "schema_migrations" | sed '/^$/d'
}

filter_migra_down_lines() {
  # Drop migra noise; exclude schema_migrations DDL (often split across lines without the table name).
  # Keep only lines that start a real DDL statement (avoids fragments like: "version" varchar NOT NULL / ); )
  grep -v "^WARNING" | grep -v "^INFO" | grep -v "ERROR:" | grep -v "destructive" | grep -v "Use the --unsafe" | grep -v "schema_migrations" | sed '/^$/d' \
    | grep -Ei '^[[:space:]]*(ALTER|CREATE|DROP|COMMENT|GRANT|REVOKE|--)'
}

normalize_sql_keywords() {
  sed \
    -e 's/^alter /ALTER /g' \
    -e 's/^create type /CREATE TYPE /g' \
    -e 's/^drop type /DROP TYPE /g' \
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
    -e 's/ using / USING /g'
}

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
export DATABASE_URL="$ORIGINAL_DATABASE_URL"

# Up: SQL to transform current DB → desired (same as prisma db push on temp)
echo "🔍 Comparing schemas (migrate:up = current → desired)..."
MIGRATION_SQL=$(migra "$DATABASE_URL" "$TEMP_DB_URL" --with-privileges --unsafe 2>&1 || true)
CLEAN_SQL=$(echo "$MIGRATION_SQL" | filter_migra_up_lines | normalize_sql_keywords | node scripts/postprocess-migra-sql.mjs --up)

# Down: inverse — SQL to transform desired → current (rollback after up is applied)
echo "🔍 Generating migrate:down (desired → current)..."
MIGRATION_DOWN_SQL=$(migra "$TEMP_DB_URL" "$DATABASE_URL" --with-privileges --unsafe 2>&1 || true)
DOWN_SQL=$(echo "$MIGRATION_DOWN_SQL" | filter_migra_down_lines | normalize_sql_keywords | node scripts/postprocess-migra-sql.mjs --down)

if [ -z "$CLEAN_SQL" ] || echo "$CLEAN_SQL" | grep -q "Nothing to do"; then
  echo "⚠️  No differences between schemas"
  echo "💡 Current schema already matches schema.prisma"

  node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
  exit 0
fi

# Fallback if reverse diff is empty (should be rare when forward diff exists)
if [ -z "$DOWN_SQL" ] || echo "$DOWN_SQL" | grep -q "Nothing to do"; then
  echo "⚠️  Could not auto-generate migrate:down; using placeholder"
  DOWN_SQL="-- Revert changes manually if needed
-- Forward diff existed but reverse migra produced no SQL; review migrate:up and write rollback by hand"
fi

# Create new migration with dbmate
echo "📝 Creating migration: $MIGRATION_NAME..."
npx dbmate new "$MIGRATION_NAME"

MIGRATION_FILE=$(ls -t db/migrations/*${MIGRATION_NAME}*.sql 2> /dev/null | head -1)

if [ -z "$MIGRATION_FILE" ]; then
  echo "❌ Could not find migration file"
  node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
  exit 1
fi

# Idempotent up: ADD COLUMN -> ADD COLUMN IF NOT EXISTS
UP_SQL=$(echo "$CLEAN_SQL" | sed 's/ADD COLUMN "/ADD COLUMN IF NOT EXISTS "/g')

cat > "$MIGRATION_FILE" << EOF
-- migrate:up
$UP_SQL

-- migrate:down
$DOWN_SQL
EOF

echo "✅ Migration generated automatically: $MIGRATION_FILE"
echo ""
echo "📋 migrate:up"
echo "$UP_SQL"
echo ""
echo "📋 migrate:down"
echo "$DOWN_SQL"
echo ""
echo "⚠️  IMPORTANT: Review both sections before applying!"
echo "💡 Apply with: npm run db:migrate"

node scripts/db-helper.mjs drop-db "$TEMP_DB_NAME" 2> /dev/null || true
