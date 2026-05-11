import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseMs(value: string | undefined, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const trimmed = value.trim().toLowerCase();
  const n = Number.parseInt(trimmed, 10);
  if (Number.isFinite(n) && n > 0) return n;

  // Support simple suffixes like "15m", "1h", "30s".
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(trimmed);
  if (!match) return fallbackMs;
  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  const mult =
    unit === 'ms'
      ? 1
      : unit === 's'
        ? 1000
        : unit === 'm'
          ? 60_000
          : unit === 'h'
            ? 3_600_000
            : 86_400_000;
  return amount * mult;
}

function emailKey(req: Request): string | undefined {
  const raw = (req.body as { email?: unknown } | undefined)?.email;
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

/**
 * Anti-bruteforce middleware for login.
 *
 * Counts only failed attempts (4xx/5xx). Successful logins do not consume quota.
 * Applies limits both per-IP and per-identifier (email).
 */
export const loginBruteforceProtection = [
  (() => {
    return rateLimit({
      windowMs: parseMs(process.env.AUTH_LOGIN_WINDOW_MS, 15 * 60_000),
      limit: parsePositiveInt(process.env.AUTH_LOGIN_MAX_PER_IP, 30),
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (_req: Request, res: Response) =>
        res.statusCode < 400,
      message: {
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        message:
          'Demasiados intentos desde tu red. Espera unos minutos y vuelve a intentarlo.',
      },
    });
  })(),
  (() => {
    return rateLimit({
      windowMs: parseMs(process.env.AUTH_LOGIN_WINDOW_MS, 15 * 60_000),
      limit: parsePositiveInt(process.env.AUTH_LOGIN_MAX_PER_EMAIL, 10),
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true,
      requestWasSuccessful: (_req: Request, res: Response) =>
        res.statusCode < 400,
      keyGenerator: (req: Request) => {
        const email = emailKey(req);
        if (email) return `email:${email}`;
        const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
        return `ip:${ipKeyGenerator(ip)}`;
      },
      message: {
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        message:
          'Demasiados intentos para esta cuenta. Espera unos minutos y vuelve a intentarlo.',
      },
    });
  })(),
];

/**
 * Anti-bruteforce middleware for `PUT /profile/me/password`.
 *
 * An attacker who has stolen a JWT (XSS, shoulder-surf) can otherwise
 * grind `currentPassword` guesses at the global limiter rate and take
 * the account over permanently (change-password rotates `tokens`,
 * which logs the real owner out everywhere). Keying on the
 * authenticated user id (not IP) so a coordinated multi-IP attack on
 * a single account still shares one quota.
 */
export const changePasswordBruteforceProtection = rateLimit({
  windowMs: parseMs(process.env.AUTH_CHANGE_PASSWORD_WINDOW_MS, 15 * 60_000),
  limit: parsePositiveInt(process.env.AUTH_CHANGE_PASSWORD_MAX, 5),
  standardHeaders: true,
  legacyHeaders: false,
  // Only failed attempts count — a successful rotation shouldn't lock
  // the user out of further legitimate rotations.
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode < 400,
  keyGenerator: (req: Request) => {
    const userId = (req as Request & { user?: { id: number } }).user?.id;
    if (typeof userId === 'number') return `user:${userId}`;
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return `ip:${ipKeyGenerator(ip)}`;
  },
  message: {
    message: 'Demasiados intentos de cambio de contraseña. Vuelve mas tarde.',
  },
});

export const registerBruteforceProtection = [
  (() => {
    return rateLimit({
      windowMs: parseMs(process.env.AUTH_REGISTER_WINDOW_MS, 15 * 60_000),
      limit: parsePositiveInt(process.env.AUTH_REGISTER_MAX_PER_IP, 10),
      standardHeaders: true,
      legacyHeaders: false,
      message: {
        code: 'TOO_MANY_REGISTER_ATTEMPTS',
        message:
          'Demasiados intentos de registro. Espera unos minutos y vuelve a intentarlo.',
      },
    });
  })(),
  (() => {
    return rateLimit({
      windowMs: parseMs(process.env.AUTH_REGISTER_WINDOW_MS, 15 * 60_000),
      limit: parsePositiveInt(process.env.AUTH_REGISTER_MAX_PER_EMAIL, 5),
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        const email = emailKey(req);
        if (email) return `email:${email}`;
        const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
        return `ip:${ipKeyGenerator(ip)}`;
      },
      message: {
        code: 'TOO_MANY_REGISTER_ATTEMPTS',
        message:
          'Demasiados intentos de registro. Espera unos minutos y vuelve a intentarlo.',
      },
    });
  })(),
];
