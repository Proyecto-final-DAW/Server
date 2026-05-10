import { Request, Response } from 'express';

import { UserPublic } from '../models/User';
import { hashIdentifier } from '../services/audit.service';
import * as authService from '../services/auth.service';
import * as cardsService from '../services/cards.service';
import * as statsService from '../services/stats.service';
import * as userService from '../services/user.service';
import { safeWriteAuditEvent } from '../utils/audit';
import { sendServerError } from '../utils/httpError';
import { sleepJitterMs } from '../utils/sleep';
import type { LoginBody, RegisterBody } from '../validators/auth';

export interface AuthRequest extends Request {
  user?: UserPublic;
}

const UserController = {
  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body as RegisterBody;
      const created = await authService.register({
        name,
        email,
        password,
      });
      await safeWriteAuditEvent(req, {
        action: 'AUTH_REGISTER_SUCCESS',
        actorUserId: created.id,
        targetUserId: created.id,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          emailHash: hashIdentifier(email),
        },
      });
      await sleepJitterMs(150, 300);
      return res.status(202).json({ message: 'Registration processed' });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };

      // Postgres unique violation = 23505 (duplicate email). Previously
      // we returned an opaque 202 to hide whether an email is in use,
      // but pairing that with the client's auto-login-after-register
      // meant a returning user typing creds into the *register* form
      // would silently sign in to their existing account — confusing
      // at best, and at worst a UX channel for accidental account
      // takeover if someone reused a known email + guessed password.
      // For a fitness app, surfacing "ese email ya existe" is the
      // right tradeoff: account enumeration here doesn't unlock
      // anything an attacker couldn't try via the login endpoint.
      if (error.code === '23505') {
        await sleepJitterMs(150, 300);
        await safeWriteAuditEvent(req, {
          action: 'AUTH_REGISTER_FAILED',
          actorUserId: null,
          targetUserId: null,
          requestId: (req as unknown as { id?: string }).id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            reason: 'EMAIL_IN_USE',
            emailHash: hashIdentifier(
              (req.body as { email?: string }).email ?? ''
            ),
          },
        });
        return res.status(409).json({
          message: 'Ese email ya esta registrado. Inicia sesion en su lugar.',
          code: 'EMAIL_ALREADY_REGISTERED',
        });
      }
      await safeWriteAuditEvent(req, {
        action: 'AUTH_REGISTER_FAILED',
        actorUserId: null,
        targetUserId: null,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          reason: error?.code ?? 'UNKNOWN',
        },
      });
      return sendServerError(res, err, 'UserController.register');
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as LoginBody;
      const result = await authService.login({
        email,
        password,
      });
      await safeWriteAuditEvent(req, {
        action: 'AUTH_LOGIN_SUCCESS',
        actorUserId: result.user.id,
        targetUserId: result.user.id,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          emailHash: hashIdentifier(email),
        },
      });
      res.setHeader('x-auth-token', result.token);

      return res.status(200).json(result);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };

      if (error.code === 'INVALID_CREDENTIALS') {
        // Slight delay reduces credential stuffing timing signals.
        await sleepJitterMs(150, 300); // Random delay to reduce timing signals.
        await safeWriteAuditEvent(req, {
          action: 'AUTH_LOGIN_FAILED',
          actorUserId: null,
          targetUserId: null,
          requestId: (req as unknown as { id?: string }).id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            reason: 'INVALID_CREDENTIALS',
            emailHash: hashIdentifier(
              (req.body as { email?: string }).email ?? ''
            ),
          },
        });
        // Personalized Spanish copy + a stable `code` so the client
        // can branch on the kind of error (display vs redirect, etc).
        // Single message for both "no such email" and "wrong password"
        // so account enumeration via login is impossible — the
        // surface for that is the register endpoint, which has its
        // own audited 409 path.
        return res.status(401).json({
          code: 'INVALID_CREDENTIALS',
          message:
            'Email o contrasena incorrectos. Revisa los datos y vuelve a intentarlo.',
        });
      }
      await safeWriteAuditEvent(req, {
        action: 'AUTH_LOGIN_FAILED',
        actorUserId: null,
        targetUserId: null,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          reason: error?.code ?? 'UNKNOWN',
        },
      });
      return sendServerError(res, err, 'UserController.login');
    }
  },

  async logout(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const header = req.headers.authorization;
      const token = header?.split(' ')[1];

      if (!userId || !token) {
        return res.status(400).json({ message: 'Not authorized' });
      }

      const user = await userService.removeToken(userId, token);

      await safeWriteAuditEvent(req, {
        action: 'AUTH_LOGOUT_SUCCESS',
        actorUserId: userId,
        targetUserId: userId,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });

      if (user) {
        return res.status(200).json({
          message: 'Goodbye!',
          user: req.user,
        });
      }

      return res.status(200).json({ message: 'Goodbye!' });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'TOKEN_INVALID' || error.code === 'USER_NOT_FOUND') {
        await safeWriteAuditEvent(req, {
          action: 'AUTH_LOGOUT_FAILED',
          actorUserId: req.user?.id ?? null,
          targetUserId: req.user?.id ?? null,
          requestId: (req as unknown as { id?: string }).id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            reason: error.code,
          },
        });
        return res.status(401).json({ message: 'Token invalid or logged out' });
      }
      await safeWriteAuditEvent(req, {
        action: 'AUTH_LOGOUT_FAILED',
        actorUserId: req.user?.id ?? null,
        targetUserId: req.user?.id ?? null,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          reason: error?.code ?? 'UNKNOWN',
        },
      });
      return sendServerError(res, err, 'UserController.logout');
    }
  },

  async getCards(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const cards = await cardsService.getCards(userId);
      return res.status(200).json(cards);
    } catch (err) {
      return sendServerError(res, err, 'UserController.getCards');
    }
  },

  async getStatsForCurrentUser(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const stats = await statsService.findByUserId(userId);
      if (!stats) {
        return res
          .status(404)
          .json({ message: 'Stats not found. Complete onboarding first.' });
      }

      return res.status(200).json(stats);
    } catch (err) {
      return sendServerError(res, err, 'UserController.getStatsForCurrentUser');
    }
  },

  /**
   * DELETE /users/me — GDPR-compliant account deletion. The `users`
   * row has `onDelete: Cascade` on every owned table (sessions,
   * routines, stats, weight_logs, user_class_state, user_milestones),
   * so removing the row also cleans up everything the user produced.
   * Audit log entries are *not* cascaded because the `actor_user_id` /
   * `target_user_id` columns are SET NULL — keeping the trail intact
   * for security review while honouring the deletion request.
   */
  async deleteMe(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      await safeWriteAuditEvent(req, {
        action: 'ACCOUNT_DELETED',
        actorUserId: userId,
        targetUserId: userId,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });

      await userService.deleteUser(userId);

      return res.status(200).json({ message: 'Account deleted' });
    } catch (err) {
      return sendServerError(res, err, 'UserController.deleteMe');
    }
  },
};

export default UserController;
