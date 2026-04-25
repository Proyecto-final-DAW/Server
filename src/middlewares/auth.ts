import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { User } from '../models/User';
import * as userService from '../services/user.service';

interface JwtPayload {
  userId: number;
  email: string;
}

interface JwtError extends Error {
  name:
    | 'TokenExpiredError'
    | 'JsonWebTokenError'
    | 'NotBeforeError'
    | 'SyntaxError';
}

function isLocalDevAuthBypass(): boolean {
  return process.env.NODE_ENV === 'development';
}

function bearerToken(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

export const authentication = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;
    const token = bearerToken(header);

    if (!token && isLocalDevAuthBypass()) {
      const rawId = process.env.LOCAL_DEV_USER_ID ?? '1';
      const devUserId = Number.parseInt(rawId, 10);
      if (Number.isNaN(devUserId) || devUserId <= 0) {
        return res
          .status(500)
          .json({ message: 'Invalid LOCAL_DEV_USER_ID for local auth bypass' });
      }
      const devUser = await userService.findById(devUserId);
      if (!devUser) {
        return res.status(401).json({
          message:
            'Local dev: user not found. Register a user or set LOCAL_DEV_USER_ID in .env',
        });
      }
      const { hashed_password: _, tokens: __, ...publicUser } = devUser as User;
      req.user = publicUser;
      return next();
    }

    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;

    const user = await userService.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const tokenValid = await userService.hasToken(payload.userId, token);
    if (!tokenValid) {
      return res.status(401).json({ message: 'Token invalid or logged out' });
    }

    const { hashed_password: _, tokens: __, ...publicUser } = user as User;
    req.user = publicUser;
    next();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'name' in error) {
      const err = error as JwtError;
      switch (err.name) {
        case 'TokenExpiredError':
          return res.status(401).json({ message: 'Token expired' });
        case 'JsonWebTokenError':
          return res.status(401).json({ message: 'Invalid token' });
        case 'NotBeforeError':
          return res.status(401).json({ message: 'Token not yet valid' });
        case 'SyntaxError':
          return res.status(401).json({ message: 'Malformed token' });
        default:
          return res.status(500).json({
            message: 'Authentication error',
            error: err?.message || String(error),
          });
      }
    }
    return res.status(500).json({
      message: 'Unknown token error',
      error: String(error),
    });
  }
};
