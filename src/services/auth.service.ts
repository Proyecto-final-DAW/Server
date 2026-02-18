import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import { IUserPublic } from '../models/User';
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
  user: IUserPublic;
  token: string;
}

export async function register(data: RegisterBody): Promise<IUserPublic> {
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
  return user as IUserPublic;
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

  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const token = jwt.sign({ userId: user.id, email: user.email }, jwtSecret, {
    expiresIn,
  } as jwt.SignOptions);

  // Save the token in the database
  await userService.addToken(user.id, token);

  const { hashed_password: _, tokens: __, ...publicUser } = user;
  return {
    user: publicUser as IUserPublic,
    token,
  };
}
