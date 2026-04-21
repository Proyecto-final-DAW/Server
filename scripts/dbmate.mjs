import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const nodeEnv = process.env.NODE_ENV || 'development';

dotenv.config({ path: '.env' });
dotenv.config({
  path: nodeEnv === 'production' ? '.env.production' : '.env.local',
  override: true,
});

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/dbmate.mjs <dbmate-args...>');
  process.exit(2);
}

const result = spawnSync('dbmate', args, {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 1);
