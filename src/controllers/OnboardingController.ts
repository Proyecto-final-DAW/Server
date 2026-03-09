import { Response } from 'express';

import { OnboardingFormData } from '../models/Onboarding';
import * as onboardingService from '../services/onboarding.service';
import { AuthRequest } from './UserController';

const OnboardingController = {
  async submitOnboarding(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const data = req.body as OnboardingFormData;
      const updatedUser = await onboardingService.submitOnboarding(
        userId,
        data
      );

      if (!updatedUser) {
        return res.status(404).json({ message: 'User not found' });
      }

      return res.status(200).json(updatedUser);
    } catch {
      return res.status(500).json({ message: 'Failed to update onboarding' });
    }
  },
};

export default OnboardingController;
