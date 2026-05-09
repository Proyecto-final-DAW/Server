import { Response } from 'express';

import { OnboardingFormData } from '../models/Onboarding';
import * as onboardingService from '../services/onboarding.service';
import { sendServerError } from '../utils/httpError';
import { AuthRequest } from './UserController';

const OnboardingController = {
  async submitOnboarding(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const data = req.body as OnboardingFormData;
      const updatedUser = await onboardingService.submitOnboarding(
        userId,
        data
      );

      return res.status(200).json(updatedUser);
    } catch (err: unknown) {
      const error = err as Error & { code?: string };
      if (error.code === 'USER_NOT_FOUND') {
        return res.status(404).json({ message: 'Resource not found' });
      }
      if (error.code === 'ONBOARDING_ALREADY_COMPLETED') {
        return res
          .status(409)
          .json({ message: 'Onboarding already completed' });
      }
      return sendServerError(res, err, 'OnboardingController.submitOnboarding');
    }
  },
};

export default OnboardingController;
