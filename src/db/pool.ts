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
        // Don't echo the URL into the thrown message — it carries the
        // password and will land in any process log capture. The
        // TypeError already names the parsing failure ("Invalid URL"
        // etc.); that's enough to debug the env var.
        throw new Error('Invalid DATABASE_URL format (failed to parse)');
      }
      throw error;
    }

    // Pool sizing — `pg`'s default `max` is 10 with no idle/connection
    // timeouts. The backend runs as a single long-lived Render web
    // service, but the database is Neon, whose free/shared tiers cap
    // total connections low — and a deploy briefly overlaps the old
    // and new instances, each with its own pool. Keep `max` low
    // (default 5) and add an idle timeout so sleeping connections free
    // up fast. Override per-deploy via env to tune for hosting where a
    // higher `max` makes more sense.
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
      // Cap any single query at 10s. Without this, a runaway full
      // table scan or a query waiting on a row lock holds a
      // connection forever. With the default pool max=5, just 5 such
      // queries brick the entire pool — every other request 5xxs with
      // `connectionTimeoutMillis` exceeded.
      // 10s is generous (the slowest legit query in the app is the
      // session-history paginated read, ~50ms on prod data).
      statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT_MS, 10_000),
    });

    // Pin every new connection's session timezone to UTC.
    //
    // Historic note: this used to compensate for `cards.service` and
    // `getWeeklySummary` deriving week bounds via
    // `date_trunc('week', CURRENT_DATE)` and `streak.service.isoWeekMonday`
    // reading UTC getters off local-built Dates — pinning UTC kept those
    // two implicit conventions agreeing with each other. They've since
    // been refactored to compute bounds in JS (with local-time getters,
    // matching `localTodayISO()` and the YYYY-MM-DD strings the client
    // emits) and pass them to SQL as parameters, so the codebase no
    // longer depends on session TZ.
    //
    // The pin stays as a defensive default: any new query that reaches
    // for `CURRENT_DATE` / `NOW()` still gets a deterministic answer
    // regardless of whether the deploy host's `TZ` env is set, and the
    // node `pg` client serialises queries on a single connection so the
    // `SET TIME ZONE 'UTC'` lands before the first application query.
    poolInstance.on('connect', (client) => {
      // No-await fire-and-forget: a fresh connection without TZ set is
      // still functional, just inconsistent. The next query on this
      // client may run before SET completes, but `pg` serialises
      // queries on a single client so the SET will land before any
      // application query reads timezone-sensitive functions.
      void client.query("SET TIME ZONE 'UTC'").catch(() => undefined);
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
