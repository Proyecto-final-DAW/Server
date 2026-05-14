import type { Response } from 'express';

import { logger } from './logger';

/**
 * Internal-error responder. Logs the full exception (with stack) to pino so
 * an operator can debug, but returns only a generic message + correlation
 * code to the client. Previously every controller did
 * `res.status(500).json({ error: error?.message })` which leaked Postgres
 * details: column names, constraint names, raw query fragments — material
 * an attacker can fingerprint the schema with.
 *
 * Pass a `where` tag so the log line says which controller fired it:
 *
 *     sendServerError(res, err, 'SessionController.save');
 *
 * The optional `code` lets a controller surface a stable error key the
 * client can branch on (e.g. `'STATS_FAILED'`) without exposing the raw
 * exception text.
 */
export const sendServerError = (
  res: Response,
  err: unknown,
  where: string,
  code?: string
): Response => {
  logger.error({ err, where }, 'Unhandled server error');
  return res.status(500).json({
    message: 'Ha ocurrido un error en el servidor.',
    ...(code ? { code } : {}),
  });
};
