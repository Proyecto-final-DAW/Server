import { Response } from 'express';

import * as milestoneService from '../services/milestone.service';
import { AuthRequest } from './UserController';

const MilestoneController = {
  async getAll(_req: AuthRequest, res: Response) {
    try {
      const milestones = await milestoneService.findAllMilestones();
      return res.status(200).json(milestones);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to get milestones',
        error: error?.message || String(err),
      });
    }
  },

  async getUnlocked(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const unlocked = await milestoneService.findUnlockedByUser(userId);
      return res.status(200).json(unlocked);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      return res.status(500).json({
        message: 'Failed to get unlocked milestones',
        error: error?.message || String(err),
      });
    }
  },
};

export default MilestoneController;
