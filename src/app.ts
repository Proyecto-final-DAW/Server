import cors from 'cors';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { httpLogger } from './middlewares/httpLogger';
import { globalRateLimit } from './middlewares/rateLimitGlobal';
import { sanitizeRequest } from './middlewares/sanitize';
import { globalSlowdown } from './middlewares/slowdownGlobal';
import characterRouter from './routes/character';
import dietRouter from './routes/diet';
import exercisesRouter from './routes/exercises';
import milestonesRouter from './routes/milestones';
import onboardingRouter from './routes/onboarding';
import profileRouter from './routes/profile';
import progressRouter from './routes/progress';
import routinesRouter from './routes/routines';
import sessionsRouter from './routes/sessions';
import statsRouter from './routes/stats';
import streakRouter from './routes/streak';
import usersRouter from './routes/users';
import { logger } from './utils/logger';

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
  ];

  const missingVars = requiredEnvVars.filter((key) => !process.env[key]);
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  const app = express();

  // Ensure req.ip works correctly behind reverse proxies (e.g. Render).
  // Render sets RENDER=true automatically and routes traffic through its
  // load balancer, so the real client IP comes from X-Forwarded-For.
  if (process.env.RENDER || process.env.TRUST_PROXY) {
    const trustProxyRaw = process.env.TRUST_PROXY?.trim();
    const trustProxy =
      trustProxyRaw && trustProxyRaw.length > 0
        ? Number.parseInt(trustProxyRaw, 10)
        : 1;
    app.set('trust proxy', Number.isFinite(trustProxy) ? trustProxy : 1);
  }

  const corsOriginEnv = process.env.CORS_ORIGIN || 'http://localhost:5173';
  const allowAnyOrigin = corsOriginEnv.trim() === '*';
  const allowedOrigins = corsOriginEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  logger.info({ nodeEnv, corsOrigin: corsOriginEnv }, 'env loaded');

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

  // Lightweight health check for Render. Declared before the logger and the
  // rate limiters so platform probes are neither logged as noise nor throttled.
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

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
  app.use('/streak', streakRouter);
  app.use('/character', characterRouter);

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
        logger.warn(
          { json: requestBodyLimit, urlencoded: urlencodedBodyLimit },
          'payload too large'
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
