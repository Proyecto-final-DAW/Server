import { Pool } from 'pg';

let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (!poolInstance) {
    // Validate DATABASE_URL format
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    // Parse connection string to validate it
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(databaseUrl);
      if (
        parsedUrl.protocol !== 'postgresql:' &&
        parsedUrl.protocol !== 'postgres:'
      ) {
        throw new Error(
          `Invalid database protocol: ${parsedUrl.protocol}. Expected postgresql: or postgres:`
        );
      }

      // Check if password exists and is not empty
      if (parsedUrl.username && !parsedUrl.password) {
        throw new Error(
          'DATABASE_URL is missing a password. Format should be: postgresql://username:password@host:port/database'
        );
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error(`Invalid DATABASE_URL format: ${databaseUrl}`);
      }
      throw error;
    }

    // Pool sizing — `pg`'s default `max` is 10 with no idle/connection
    // timeouts. On a single long-lived server that's fine, but on
    // serverless (Netlify Functions) every cold instance opens its
    // own pool of 10 connections; under burst load N instances ×
    // 10 conns can saturate Postgres. Keep `max` low (Netlify
    // function-instance default = 5) and add an idle timeout so
    // sleeping connections free up fast. Override per-deploy via
    // env to tune for traditional VM-style hosting where a higher
    // `max` makes more sense.
    const parseInt = (raw: string | undefined, fallback: number): number => {
      if (!raw) return fallback;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n > 0 ? n : fallback;
    };
    poolInstance = new Pool({
      connectionString: databaseUrl,
      max: parseInt(process.env.PG_POOL_MAX, 5),
      idleTimeoutMillis: parseInt(process.env.PG_POOL_IDLE_MS, 30_000),
      connectionTimeoutMillis: parseInt(
        process.env.PG_POOL_CONNECTION_MS,
        5_000
      ),
    });
  }

  return poolInstance;
}

// Create a proxy to make pool access transparent
const pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const instance = getPool();
    const value = instance[prop as keyof Pool];
    return typeof value === 'function' ? value.bind(instance) : value;
  },
}) as Pool;

export default pool;
