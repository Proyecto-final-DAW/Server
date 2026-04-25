import type { Request } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import slowDown from 'express-slow-down';

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

/**
 * Global slowdown: once a client crosses `delayAfter` within `windowMs`,
 * responses are delayed by `delayMs` per request (linear backoff).
 *
 * This complements (doesn't replace) the global 429 rate limit.
 */
export const globalSlowdown = slowDown({
  windowMs: parseMs(process.env.GLOBAL_SLOWDOWN_WINDOW_MS, 60_000),
  delayAfter: parsePositiveInt(process.env.GLOBAL_SLOWDOWN_AFTER, 60),
  delayMs: parsePositiveInt(process.env.GLOBAL_SLOWDOWN_DELAY_MS, 250),
  maxDelayMs: parsePositiveInt(process.env.GLOBAL_SLOWDOWN_MAX_DELAY_MS, 5_000),
  // Avoid slowing down CORS preflight.
  skip: (req: Request) => req.method === 'OPTIONS',
  keyGenerator: (req: Request) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? '0.0.0.0';
    return ipKeyGenerator(ip);
  },
});
