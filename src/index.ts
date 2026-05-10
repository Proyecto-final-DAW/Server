/* eslint-disable no-console */
import { createApp } from './app';
import pool from './db/pool';

async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

const PORT = process.env.PORT || 3000;
// Window the orchestrator gives us (after SIGTERM) before it sends
// SIGKILL. Used to time out the close-all-connections grace if any
// in-flight request hangs forever — without this, a leaked socket
// can keep the process alive past the orchestrator's deadline.
const SHUTDOWN_TIMEOUT_MS = Number.parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? '15000',
  10
);

async function startServer() {
  // Hard-fail at startup if the local-dev auth bypass is set in any
  // non-development environment. The middleware itself is double-gated
  // on NODE_ENV='development' AND the env flag, but Netlify branch
  // deploys + some Docker base images set NODE_ENV unpredictably, so a
  // single misconfiguration could let every request log in as user 1
  // silently. Refuse to boot rather than ship that.
  if (
    process.env.LOCAL_DEV_AUTH_BYPASS === '1' &&
    process.env.NODE_ENV !== 'development'
  ) {
    console.error(
      '❌ LOCAL_DEV_AUTH_BYPASS=1 requires NODE_ENV=development. ' +
        `Got NODE_ENV='${process.env.NODE_ENV ?? ''}'. Refusing to start.`
    );
    process.exit(1);
  }
  // `createApp()` is what loads `.env.local` / `.env.production` via
  // dotenv. The LOCAL_DEV_USER_ID and JWT_SECRET checks below depend
  // on those env vars actually being populated, so build the app
  // FIRST, then run the runtime gates. (LOCAL_DEV_AUTH_BYPASS is
  // checked before createApp because it's a pure environment toggle
  // and doesn't read app-loaded .env.* files.)
  const app = createApp();

  if (process.env.LOCAL_DEV_AUTH_BYPASS === '1') {
    // Refuse to boot if LOCAL_DEV_USER_ID isn't an explicit positive
    // integer. The middleware falls back to '1' when the env is
    // empty, which silently logs every request as user 1 — fine
    // when user 1 is the developer, dangerous when it's seed data
    // or an accidental admin. Force the operator to opt in.
    const rawDevId = process.env.LOCAL_DEV_USER_ID ?? '';
    const devId = Number.parseInt(rawDevId, 10);
    if (!rawDevId || !Number.isInteger(devId) || devId <= 0) {
      console.error(
        '❌ LOCAL_DEV_AUTH_BYPASS=1 requires LOCAL_DEV_USER_ID set to ' +
          `a positive integer. Got '${rawDevId}'. Refusing to start.`
      );
      process.exit(1);
    }
    console.warn(
      `⚠ LOCAL_DEV_AUTH_BYPASS is ENABLED. Every unauthenticated ` +
        `request will be logged in as user ${devId}.`
    );
  }

  // JWT_SECRET strength check. The presence guard in app.ts catches
  // an empty string but not a weak one (e.g. `JWT_SECRET=foo`). HS256
  // against a 4-char secret is brute-forceable in seconds with hashcat.
  // Require >= 32 chars (~128 bits of entropy if the operator follows
  // the README's `openssl rand -hex 32` recipe).
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    console.error(
      `❌ JWT_SECRET must be at least 32 characters (got ${jwtSecret.length}). ` +
        'Generate one with: openssl rand -hex 32. Refusing to start.'
    );
    process.exit(1);
  }

  try {
    await connectDatabase();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown — orchestrators (Docker, k8s, systemd, PM2)
  // send SIGTERM before forcefully killing. We need to:
  //   1. stop accepting new connections (`server.close`)
  //   2. let in-flight requests finish
  //   3. drain the pg pool so connections get returned cleanly to PG
  //   4. exit
  // A timeout guard escapes if step 2 hangs (e.g. a websocket / SSE
  // connection ignoring the close signal). Without this the process
  // stays alive past the orchestrator's grace window and gets
  // SIGKILL'd, leaking PG connections every redeploy.
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Received ${signal}, shutting down...`);

    const forceTimer = setTimeout(() => {
      console.error('Shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceTimer.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      await pool.end();
      console.log('Shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

startServer();
