/* eslint-disable no-console */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import dietRouter from './routes/diet';
import exercisesRouter from './routes/exercises';
import milestonesRouter from './routes/milestones';
import onboardingRouter from './routes/onboarding';
import profileRouter from './routes/profile';
import progressRouter from './routes/progress';
import routinesRouter from './routes/routines';
import sessionsRouter from './routes/sessions';
import statsRouter from './routes/stats';
import usersRouter from './routes/users';

export function createApp() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  dotenv.config({ path: '.env' });
  dotenv.config({
    path: nodeEnv === 'production' ? '.env.production' : '.env.local',
    override: true,
  });

  const requiredEnvVars = [
    'JWT_SECRET',
    'DATABASE_URL',
    'PORT',
    'CORS_ORIGIN',
    'JWT_EXPIRES_IN',
    'EXERCISEDB_API_KEY',
  ];

  // In Netlify Functions, PORT is not used (there is no long-lived listener).
  if (process.env.NETLIFY) {
    const portIndex = requiredEnvVars.indexOf('PORT');
    if (portIndex >= 0) requiredEnvVars.splice(portIndex, 1);
  }

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

  console.log(`[env] NODE_ENV=${nodeEnv}`);
  console.log(`[env] CORS_ORIGIN=${corsOriginEnv}`);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (allowAnyOrigin) return callback(null, true);
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
  app.use('/progress', progressRouter);
  app.use('/diet', dietRouter);
  app.use('/routines', routinesRouter);

  return app;
}
