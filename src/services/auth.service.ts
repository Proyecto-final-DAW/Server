import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { UserPublic } from '../models/User';
import * as userService from './user.service';

const SALT_ROUNDS = 10;

interface RegisterBody {
  name: string;
  email: string;
  password: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface LoginResponse {
  user: UserPublic;
  token: string;
}

function buildLoginResponse(user: {
  id: number;
  email: string;
  hashed_password?: string;
  tokens?: string[];
}): LoginResponse {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, {
    expiresIn,
  } as jwt.SignOptions);

  const {
    hashed_password: _,
    tokens: __,
    ...publicUser
  } = user as unknown as {
    hashed_password?: string;
    tokens?: string[];
  } & UserPublic;

  return { user: publicUser as UserPublic, token };
}

export async function register(data: RegisterBody): Promise<LoginResponse> {
  const existing = await userService.findByEmail(data.email);
  if (existing) {
    const err = new Error('EMAIL_IN_USE');
    (err as Error & { code: string }).code = 'EMAIL_IN_USE';
    throw err;
  }
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
  const user = await userService.createUser(
    data.name,
    data.email,
    hashedPassword
  );
  const result = buildLoginResponse(user as { id: number; email: string });

  await userService.addToken((user as { id: number }).id, result.token);

  return result;
}

export async function login(data: LoginBody): Promise<LoginResponse> {
  const user = await userService.findByEmail(data.email);
  if (!user) {
    const err = new Error('INVALID_CREDENTIALS');
    (err as Error & { code: string }).code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const isPasswordValid = await bcrypt.compare(
    data.password,
    user.hashed_password
  );
  if (!isPasswordValid) {
    const err = new Error('INVALID_CREDENTIALS');
    (err as Error & { code: string }).code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('JWT_SECRET is not configured');
  }

  const result = buildLoginResponse(user as { id: number; email: string });

  await userService.addToken(user.id, result.token);

  return result;
}
