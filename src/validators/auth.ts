import { z } from 'zod';

const trimmed = <TSchema extends z.ZodTypeAny>(schema: TSchema) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), schema);

export const registerSchema = z
  .object({
    name: trimmed(
      z
        .string()
        .min(1, 'name is required')
        .min(2, 'name must be at least 2 characters')
    ),
    email: trimmed(
      z
        .string()
        .min(1, 'email is required')
        .email('email must be a valid email')
    ),
    password: z
      .string()
      .min(1, 'password is required')
      .min(8, 'password must be at least 8 characters'),
  })
  .strict();

export const loginSchema = z
  .object({
    email: trimmed(
      z
        .string()
        .min(1, 'email is required')
        .email('email must be a valid email')
    ),
    password: z.string().min(1, 'password is required'),
  })
  .strict();

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
