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

export const globalRateLimit = rateLimit({
  windowMs: parseMs(process.env.GLOBAL_RATE_WINDOW_MS, 60_000),
  limit: parsePositiveInt(process.env.GLOBAL_RATE_MAX_PER_IP, 120),
  standardHeaders: true,
  legacyHeaders: false,
  // Avoid rate-limiting CORS preflight.
  skip: (req: Request) => req.method === 'OPTIONS',
  requestWasSuccessful: (_req: Request, res: Response) => res.statusCode < 400,
  keyGenerator: (req: Request) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return ipKeyGenerator(ip);
  },
  message: { message: 'Too many requests. Try again later.' },
});
