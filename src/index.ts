/* eslint-disable no-console */
import dotenv from 'dotenv';

const nodeEnv = process.env.NODE_ENV || 'development';
dotenv.config({ path: '.env' });
dotenv.config({
  path: nodeEnv === 'production' ? '.env.production' : '.env.local',
  override: true,
});

import cors from 'cors';
import express from 'express';

import pool from './db/pool';
import exercisesRouter from './routes/exercises';
import milestonesRouter from './routes/milestones';
import onboardingRouter from './routes/onboarding';
import profileRouter from './routes/profile';
import routinesRouter from './routes/routines';
import sessionsRouter from './routes/sessions';
import statsRouter from './routes/stats';
import usersRouter from './routes/users';

const requiredEnvVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'PORT',
  'JWT_EXPIRES_IN',
  'EXERCISEDB_API_KEY',
];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingVars.join(', ')}`
  );
}

const app = express();

const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowAnyOrigin = corsOriginEnv.trim() === '*';
const allowedOrigins = corsOriginEnv
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (allowAnyOrigin) return callback(null, true);

      // Allow non-browser clients / same-origin requests with no Origin header.
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) return callback(null, true);

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  })
);
app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
    );
  });

  next();
});

app.use('/users', usersRouter);
app.use('/profile', profileRouter);
app.use('/stats', statsRouter);
app.use('/onboarding', onboardingRouter);
app.use('/sessions', sessionsRouter);
app.use('/exercises', exercisesRouter);
app.use('/milestones', milestonesRouter);
app.use('/routines', routinesRouter);

async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDatabase();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

startServer();

export default app;
