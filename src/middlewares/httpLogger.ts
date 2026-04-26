import type { Request } from 'express';
import pinoHttp from 'pino-http';

import { logger } from '../utils/logger';

function randomRequestId(): string {
  return globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req: Request) => {
    const headerId = req.headers['x-request-id'];
    if (typeof headerId === 'string' && headerId.trim().length > 0) {
      return headerId.trim();
    }
    return randomRequestId();
  },
  customSuccessMessage: (req, res) => {
    const id = (req as unknown as { id?: string }).id;
    const responseTime = (res as unknown as { responseTime?: number })
      .responseTime;
    const path =
      (req as unknown as { originalUrl?: string }).originalUrl ?? req.url;
    return `${req.method} ${path} ${res.statusCode} ${responseTime ?? 0}ms requestId=${id}`;
  },
  customErrorMessage: (req, res, err) => {
    const id = (req as unknown as { id?: string }).id;
    const responseTime = (res as unknown as { responseTime?: number })
      .responseTime;
    const path =
      (req as unknown as { originalUrl?: string }).originalUrl ?? req.url;
    return `${req.method} ${path} ${res.statusCode} ${responseTime ?? 0}ms requestId=${id} err=${err?.name ?? 'Error'}`;
  },
  // Avoid duplicating fields that pino-http already provides (req.id, res.statusCode, etc.).
  customProps: (req) => ({
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  }),
  serializers: {
    req(req) {
      const path =
        (req as unknown as { originalUrl?: string }).originalUrl ?? req.url;
      return {
        id: (req as unknown as { id?: string }).id,
        method: req.method,
        url: path,
        query: req.query,
        params: req.params,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
});
