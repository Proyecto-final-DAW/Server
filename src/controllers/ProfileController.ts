import { Response } from 'express';

import * as profileService from '../services/profile.service';
import { safeWriteAuditEvent } from '../utils/audit';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

const ProfileController = {
  async getProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const profile = await profileService.getProfileSummary(userId);
      return res.status(200).json(profile);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      return sendServerError(res, err, 'ProfileController.getProfile');
    }
  },

  async updateProfile(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const data = req.body as Record<string, unknown>;
      const updatedUser = await profileService.updateProfile(userId, data);
      return res.status(200).json(updatedUser);
    } catch (err: unknown) {
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      if (error.code === 'NO_FIELDS_TO_UPDATE') {
        return res.status(400).json({ message: 'No valid fields to update' });
      }
      return sendServerError(res, err, 'ProfileController.updateProfile');
    }
  },

  async changePassword(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          code: 'PASSWORD_REQUIRED',
          message: 'Current password and new password are required',
        });
      }

      await profileService.changePassword(userId, currentPassword, newPassword);
      await safeWriteAuditEvent(req, {
        action: 'PROFILE_CHANGE_PASSWORD_SUCCESS',
        actorUserId: userId,
        targetUserId: userId,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      });
      return res.status(200).json({ message: 'Password updated successfully' });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      if (error.code === 'INVALID_PASSWORD') {
        await safeWriteAuditEvent(req, {
          action: 'PROFILE_CHANGE_PASSWORD_FAILED',
          actorUserId: req.user?.id ?? null,
          targetUserId: req.user?.id ?? null,
          requestId: (req as unknown as { id?: string }).id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            reason: 'INVALID_PASSWORD',
          },
        });
        return res.status(401).json({
          code: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
        });
      }
      if (error.code === 'PASSWORD_TOO_SHORT') {
        await safeWriteAuditEvent(req, {
          action: 'PROFILE_CHANGE_PASSWORD_FAILED',
          actorUserId: req.user?.id ?? null,
          targetUserId: req.user?.id ?? null,
          requestId: (req as unknown as { id?: string }).id ?? null,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? null,
          metadata: {
            reason: 'PASSWORD_TOO_SHORT',
          },
        });
        return res.status(400).json({
          code: 'PASSWORD_TOO_SHORT',
          message: 'New password must be at least 8 characters',
        });
      }
      await safeWriteAuditEvent(req, {
        action: 'PROFILE_CHANGE_PASSWORD_FAILED',
        actorUserId: req.user?.id ?? null,
        targetUserId: req.user?.id ?? null,
        requestId: (req as unknown as { id?: string }).id ?? null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
        metadata: {
          reason: error?.code ?? 'UNKNOWN',
        },
      });
      return sendServerError(res, err, 'ProfileController.changePassword');
    }
  },
};

export default ProfileController;
