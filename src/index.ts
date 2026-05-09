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
  if (process.env.LOCAL_DEV_AUTH_BYPASS === '1') {
    console.warn(
      '⚠ LOCAL_DEV_AUTH_BYPASS is ENABLED. Every unauthenticated ' +
        `request will be logged in as user ${process.env.LOCAL_DEV_USER_ID ?? '1'}.`
    );
  }

  const app = createApp();

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
