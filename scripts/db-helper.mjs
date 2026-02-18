#!/usr/bin/env node

/**
 * Create or drop a PostgreSQL database using the pg driver.
 * Used when createdb/dropdb CLI tools are not installed (e.g. Docker-only Postgres).
 *
 * Usage: node scripts/db-helper.mjs create-db <name>
 *        node scripts/db-helper.mjs drop-db <name>
 */

import pg from 'pg';

const [cmd, dbName] = process.argv.slice(2);

if (!cmd || !dbName) {
  console.error('Usage: node scripts/db-helper.mjs create-db|drop-db <database_name>');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

// Connect to "postgres" database to run CREATE/DROP DATABASE
const url = new URL(databaseUrl);
const basePath = url.pathname.replace(/\/[^/]*$/, '');
url.pathname = basePath + '/postgres';
const adminUrl = url.toString();

const client = new pg.Client({ connectionString: adminUrl });

async function main() {
  try {
    await client.connect();

    if (cmd === 'create-db') {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Created database: ${dbName}`);
    } else if (cmd === 'drop-db') {
      await client.query(`DROP DATABASE IF EXISTS "${dbName.replace(/"/g, '""')}"`);
      console.log(`Dropped database: ${dbName}`);
    } else {
      console.error('Unknown command. Use create-db or drop-db');
      process.exit(1);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
