import { Response } from 'express';

import * as profileService from '../services/profile.service';
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
      return res.status(500).json({
        message: 'Failed to get profile',
        error: error?.message || String(err),
      });
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
      return res.status(500).json({
        message: 'Failed to update profile',
        error: error?.message || String(err),
      });
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
          message: 'Current password and new password are required',
        });
      }

      await profileService.changePassword(userId, currentPassword, newPassword);
      return res.status(200).json({ message: 'Password updated successfully' });
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      if (error.code === 'INVALID_PASSWORD') {
        return res
          .status(401)
          .json({ message: 'Current password is incorrect' });
      }
      if (error.code === 'PASSWORD_TOO_SHORT') {
        return res
          .status(400)
          .json({ message: 'New password must be at least 6 characters' });
      }
      return res.status(500).json({
        message: 'Failed to change password',
        error: error?.message || String(err),
      });
    }
  },
};

export default ProfileController;
