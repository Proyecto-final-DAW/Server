#!/usr/bin/env node
/**
 * Post-processes migra output for migrate-auto.sh.
 *
 * Config: scripts/migra-postprocess.config.json
 *   - enumColumns: for each row, replace migra's one-line text→enum ALTER with
 *     CASE … USING from valueMap (legacy strings → Prisma enum literals).
 *   - downLineFilters: regex strings (case-insensitive); matching lines are removed from migrate:down.
 *
 * Usage: … | node scripts/postprocess-migra-sql.mjs --up
 *        … | node scripts/postprocess-migra-sql.mjs --down
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'migra-postprocess.config.json');

const phase = process.argv.includes('--down') ? 'down' : 'up';

function loadConfig() {
  const raw = readFileSync(CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sqlQuoteLiteral(s) {
  return String(s).replace(/'/g, "''");
}

function reEscape(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Migra line after normalize_sql_keywords; match is case-insensitive. */
function alterToEnumPattern(schema, table, column, enumName) {
  const a = reEscape(schema);
  const b = reEscape(table);
  const c = reEscape(column);
  const e = reEscape(enumName);
  return new RegExp(
    `ALTER\\s+TABLE\\s+"${a}"\\."${b}"\\s+ALTER\\s+COLUMN\\s+"${c}"\\s+SET\\s+DATA\\s+TYPE\\s+"${e}"\\s+USING\\s+[^;]+;`,
    'gi'
  );
}

function buildEnumUsingBlock(rule) {
  const {
    schema,
    table,
    column,
    enum: enumName,
    valueMap,
    onUnknown = 'null',
  } = rule;
  const col = `"${column}"`;
  const en = `"${enumName}"`;

  const branches = Object.entries(valueMap).map(([enumLiteral, synonyms]) => {
    const list = synonyms.map((s) => `'${sqlQuoteLiteral(s)}'`).join(', ');
    return `    WHEN trim(upper(${col}::text)) IN (${list}) THEN '${sqlQuoteLiteral(enumLiteral)}'::${en}`;
  });

  const elseBranch =
    onUnknown === 'null'
      ? `    ELSE NULL::${en}`
      : `    ELSE '${sqlQuoteLiteral(onUnknown)}'::${en}`;

  const comment = `-- Enum cast for ${schema}.${table}.${column} → ${enumName} (from migra-postprocess.config.json)`;

  return `${comment}
ALTER TABLE "${schema}"."${table}" ALTER COLUMN ${col} SET DATA TYPE ${en} USING (
  CASE
    WHEN ${col} IS NULL THEN NULL::${en}
${branches.join('\n')}
${elseBranch}
  END
);`;
}

function patchUp(sql, config) {
  let out = sql;
  for (const rule of config.enumColumns ?? []) {
    const re = alterToEnumPattern(
      rule.schema,
      rule.table,
      rule.column,
      rule.enum
    );
    if (!re.test(out)) continue;
    re.lastIndex = 0;
    out = out.replace(re, buildEnumUsingBlock(rule));
  }
  return out;
}

function patchDown(sql, config) {
  const filters = (config.downLineFilters ?? []).map(
    (pattern) => new RegExp(pattern, 'i')
  );

  return sql
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      return !filters.some((re) => re.test(t));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

const config = loadConfig();
const sql = await readStdin();
const result = phase === 'down' ? patchDown(sql, config) : patchUp(sql, config);
process.stdout.write(result);
