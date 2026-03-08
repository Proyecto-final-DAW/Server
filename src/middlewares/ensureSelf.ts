import { NextFunction, Response } from 'express';

import { AuthRequest } from '../controllers/UserController';

/**
 * Middleware factory that ensures the authenticated user can only access
 * their own resources. Must be used after the `authentication` middleware.
 *
 * @param paramName - Route param to compare against req.user.id (default: 'userId')
 *
 * @example
 * router.get('/:userId', authentication, ensureSelf(), StatsController.getStats);
 * router.put('/:id/update', authentication, ensureSelf('id'), UserController.update);
 */
export function ensureSelf(paramName = 'userId') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const paramId = parseInt(req.params[paramName] as string, 10);
    if (isNaN(paramId) || paramId <= 0) {
      return res.status(400).json({ message: 'Invalid userId param' });
    }

    if (req.user.id !== paramId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
}
