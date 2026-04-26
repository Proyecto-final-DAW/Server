import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';

function formatZodError(err: ZodError) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function validateBody<TSchema extends ZodTypeAny>(
  schema: TSchema
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid request body',
        issues: formatZodError(parsed.error),
      });
    }
    req.body = parsed.data;
    return next();
  };
}
