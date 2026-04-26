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
      message: { message: 'Too many login attempts. Try again later.' },
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
      message: { message: 'Too many login attempts. Try again later.' },
    });
  })(),
];

export const registerBruteforceProtection = [
  (() => {
    return rateLimit({
      windowMs: parseMs(process.env.AUTH_REGISTER_WINDOW_MS, 15 * 60_000),
      limit: parsePositiveInt(process.env.AUTH_REGISTER_MAX_PER_IP, 10),
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many registration attempts. Try again later.' },
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
      message: { message: 'Too many registration attempts. Try again later.' },
    });
  })(),
];
