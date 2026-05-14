import crypto from 'node:crypto';

import pool from '../db/pool';

export type AuditAction =
  | 'AUTH_REGISTER_SUCCESS'
  | 'AUTH_REGISTER_FAILED'
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT_SUCCESS'
  | 'AUTH_LOGOUT_FAILED'
  | 'PROFILE_CHANGE_PASSWORD_SUCCESS'
  | 'PROFILE_CHANGE_PASSWORD_FAILED'
  | 'CHARACTER_CLASS_CHOSEN'
  | 'CHARACTER_TIER_AUTO_PROMOTED';

export interface AuditEventInput {
  action: AuditAction;
  actorUserId?: number | null;
  targetUserId?: number | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

function sha256Base64(value: string): string {
  return crypto.createHash('sha256').update(value).digest('base64');
}

export const hashIdentifier = (value: string): string => {
  return sha256Base64(value.trim().toLowerCase());
};

export const writeAuditEvent = async (
  input: AuditEventInput
): Promise<void> => {
  await pool.query(
    `
      INSERT INTO public.audit_logs
        (action, actor_user_id, target_user_id, request_id, ip, user_agent, metadata)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      input.action,
      input.actorUserId ?? null,
      input.targetUserId ?? null,
      input.requestId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );
};
