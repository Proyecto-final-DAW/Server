import type { Request } from 'express';

import type { AuditEventInput } from '../services/audit.service';
import { writeAuditEvent } from '../services/audit.service';
import { logger } from './logger';

let warnedMissingAuditLogsTable = false;

export const safeWriteAuditEvent = async (
  req: Request,
  event: AuditEventInput
): Promise<void> => {
  try {
    await writeAuditEvent(event);
  } catch (err: unknown) {
    const e = err as { code?: string };

    // Best-effort: audit log should never break the request flow.
    if (e?.code === '42P01') {
      if (!warnedMissingAuditLogsTable) {
        warnedMissingAuditLogsTable = true;
        logger.warn(
          { requestId: (req as unknown as { id?: string }).id },
          'audit_logs table missing; audit events are being dropped (apply migrations)'
        );
      }
      return;
    }

    logger.warn(
      {
        requestId: (req as unknown as { id?: string }).id,
        code: e?.code,
        action: event.action,
      },
      'failed to write audit log event'
    );
    return;
  }
};
