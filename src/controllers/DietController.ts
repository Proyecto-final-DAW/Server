import { Response } from 'express';

import * as dietService from '../services/diet.service';
import { AuthRequest } from './UserController';

const DietController = {
  async getDiet(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }
      const macros = await dietService.getCurrentMacros(userId);
      return res.status(200).json(macros);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };
      if (e.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'User not found' });
      }
      if (e.code === 'ONBOARDING_INCOMPLETE') {
        return res.status(404).json({
          message: 'Diet not available. Complete onboarding first.',
        });
      }
      if (err instanceof RangeError) {
        return res.status(400).json({ message: err.message });
      }
      return res.status(500).json({ message: 'Failed to get diet' });
    }
  },
};

export default DietController;
