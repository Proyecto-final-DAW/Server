import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { User, UserPublic } from '../models/User';
import * as userService from '../services/user.service';

export interface AuthRequest extends Request {
  user?: UserPublic;
}

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

export const authentication = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({ message: 'No token provided' });
    }
    const token = header.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const jwtSecret = process.env.JWT_SECRET as string;
    const payload = jwt.verify(token, jwtSecret) as JwtPayload;

    const user = await userService.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Verify that the token is in the list of valid tokens for the user
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
          return res.status(500).json({ message: 'Authentication error' });
      }
    }
    return res.status(500).json({ message: 'Unknown token error' });
  }
};
