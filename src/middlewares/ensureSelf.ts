import { NextFunction, Response } from 'express';

import { AuthRequest } from '../controllers/UserController';

/**
 * Middleware that ensures the authenticated user can only access
 * their own resources. Must be used after the `authentication` middleware.
 *
 * Expects the route param to be named :userId (e.g. /stats/:userId)
 */
export function ensureSelf(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authorized' });
  }

  const paramId = parseInt(req.params['userId'] as string, 10);
  if (!paramId || isNaN(paramId)) {
    return res.status(400).json({ message: 'Invalid userId param' });
  }

  if (req.user.id !== paramId) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  next();
}
