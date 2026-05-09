import { Response } from 'express';

import * as milestoneService from '../services/milestone.service';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

const MilestoneController = {
  async getAll(_req: AuthRequest, res: Response) {
    try {
      const milestones = await milestoneService.findAllMilestones();
      return res.status(200).json(milestones);
    } catch (err) {
      return sendServerError(res, err, 'MilestoneController.getAll');
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
    } catch (err) {
      return sendServerError(res, err, 'MilestoneController.getUnlocked');
    }
  },
};

export default MilestoneController;
