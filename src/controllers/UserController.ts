import { Request, Response } from 'express';

import { UserPublic } from '../models/User';
import { hashIdentifier } from '../services/audit.service';
import * as authService from '../services/auth.service';
import * as userService from '../services/user.service';
import { safeWriteAuditEvent } from '../utils/audit';
import { sleepJitterMs } from '../utils/sleep';
import type { LoginBody, RegisterBody } from '../validators/auth';

export interface AuthRequest extends Request {
  user?: UserPublic;
}

const UserController = {
  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body as RegisterBody;
      const user = await authService.register({
        name,
        email,
        password,
      });
      await safeWriteAuditEvent(req, {
        action: 'AUTH_REGISTER_SUCCESS',
        actorUserId: user.user.id,
        targetUserId: user.user.id,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      res.setHeader('x-auth-token', user.token);
      return res.status(201).json(user);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'EMAIL_IN_USE') {
        // Enumeration protection: do not confirm whether the email exists.
        await sleepJitterMs(150, 300); // Random delay to reduce enumeration timing signals.
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
          message: 'Registration failed',
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
      return res.status(500).json({
        message: 'Registration failed',
        error: error?.message || String(err),
      });
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
        return res.status(401).json({ message: 'Invalid email or password' });
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
      return res.status(500).json({
        message: 'Login failed',
        error: error?.message || String(err),
      });
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

      // Remove token from the user's valid tokens list
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
      } else {
        return res.status(200).json({ message: 'Goodbye!' });
      }
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
      return res.status(500).json({
        message: 'Logout failed',
        error: error?.message || String(err),
      });
    }
  },
};

export default UserController;
