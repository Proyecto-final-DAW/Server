import { Request, Response } from 'express';

import { UserPublic } from '../models/User';
import * as authService from '../services/auth.service';
import * as milestonesService from '../services/milestone.service';
import * as statsService from '../services/stats.service';
import { getTip } from '../services/tips.service';
import * as userService from '../services/user.service';

export interface AuthRequest extends Request {
  user?: UserPublic;
}

const UserController = {
  async register(req: Request, res: Response) {
    try {
      const { name, email, password } = req.body as {
        name?: string;
        email?: string;
        password?: string;
      };

      if (!name?.trim() || !email?.trim() || !password) {
        return res.status(400).json({
          message: 'Name, email and password are required',
        });
      }

      const user = await authService.register({
        name: name.trim(),
        email: email.trim(),
        password,
      });

      return res.status(201).json(user);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };

      if (e.code === 'EMAIL_IN_USE') {
        return res.status(409).json({ message: 'Email already in use' });
      }

      return res.status(500).json({ message: 'Registration failed' });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body as {
        email?: string;
        password?: string;
      };

      if (!email?.trim() || !password) {
        return res.status(400).json({
          message: 'Email and password are required',
        });
      }

      const result = await authService.login({
        email: email.trim(),
        password,
      });

      return res.status(200).json(result);
    } catch (err: unknown) {
      const e = err as Error & { code?: string };

      if (e.code === 'INVALID_CREDENTIALS') {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      return res.status(500).json({ message: 'Login failed' });
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

      if (user) {
        return res.status(200).json({
          message: 'Goodbye!',
          user: req.user,
        });
      }

      return res.status(200).json({ message: 'Goodbye!' });
    } catch (err: unknown) {
      const e = err as Error & { code?: string };

      if (e.code === 'TOKEN_INVALID' || e.code === 'USER_NOT_FOUND') {
        return res.status(401).json({ message: 'Token invalid or logged out' });
      }

      return res.status(500).json({ message: 'Logout failed' });
    }
  },

  async getTip(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id || !req.user.created_at) {
        return res.status(401).json({ message: 'Not authorized' });
      }

      const userId = req.user.id;

      const stats = await statsService.findByUserId(userId);
      const milestones = await milestonesService.findUnlockedByUser(userId);

      let lastMilestoneAt: Date | null = null;

      if (milestones.length > 0) {
        lastMilestoneAt = milestones
          .map((m) => m.unlocked_at)
          .sort((a, b) => b.getTime() - a.getTime())[0];
      }

      const streak = stats?.streak ?? null;

      const tip = getTip({
        created_at: new Date(req.user.created_at),
        last_session_at: stats?.last_session_date
          ? new Date(stats.last_session_date)
          : null,
        last_milestone_at: lastMilestoneAt,
        streak,
      });

      return res.status(200).json(tip);
    } catch {
      return res.status(500).json({ message: 'Failed to get tips' });
    }
  },
};

export default UserController;
