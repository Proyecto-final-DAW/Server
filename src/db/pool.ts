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

    poolInstance = new Pool({
      connectionString: databaseUrl,
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
