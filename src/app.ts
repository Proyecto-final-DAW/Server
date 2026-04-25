/* eslint-disable no-console */
import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { httpLogger } from './middlewares/httpLogger';
import { globalRateLimit } from './middlewares/rateLimitGlobal';
import { sanitizeRequest } from './middlewares/sanitize';
import { globalSlowdown } from './middlewares/slowdownGlobal';
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

  // Basic security headers.
  app.disable('x-powered-by');
  app.use(
    helmet({
      // This is an API; CSP is usually set by the frontend/CDN.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(httpLogger);

  // Soft-throttle first, then hard-limit with 429.
  app.use(globalSlowdown);
  app.use(globalRateLimit);

  const requestBodyLimit = process.env.REQUEST_BODY_LIMIT ?? '100kb';
  const urlencodedBodyLimit = process.env.URLENCODED_BODY_LIMIT ?? '25kb';

  app.use(
    express.json({
      limit: requestBodyLimit,
      strict: true,
    })
  );
  app.use(
    express.urlencoded({
      extended: false,
      limit: urlencodedBodyLimit,
      parameterLimit: 1000,
    })
  );
  app.use(
    sanitizeRequest({
      ignoreKeys: ['password'],
    })
  );

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

  // Payload-too-large handler (body-parser / express.json)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (
      err &&
      typeof err === 'object' &&
      ('type' in err || 'status' in err || 'statusCode' in err)
    ) {
      const maybe = err as {
        type?: string;
        status?: number;
        statusCode?: number;
      };
      const status = maybe.statusCode ?? maybe.status;
      if (status === 413 || maybe.type === 'entity.too.large') {
        console.warn(
          `[payload] 413 entity.too.large (json=${requestBodyLimit}, urlencoded=${urlencodedBodyLimit})`
        );
        return res.status(413).json({
          message: 'Payload too large',
        });
      }
    }
    return next(err);
  });

  return app;
}
