import type { NextFunction, Request, RequestHandler, Response } from 'express';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SanitizeOptions {
  /** Keys whose string values should not be modified (e.g. password, tokens). */
  ignoreKeys?: string[];
  /** Maximum recursion depth to avoid pathological payloads. */
  maxDepth?: number;
  /**
   * If true, rejects requests that contain null bytes / control chars instead of sanitizing them.
   * Recommended for auth and user-provided identifiers.
   */
  rejectControlChars?: boolean;
}

const CONTROL_CHARS_RE =
  /\u0000|[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

function findControlChars(
  value: unknown,
  maxDepth: number,
  path: string[] = [],
  out: string[] = []
): string[] {
  if (path.length > maxDepth) return out;
  if (typeof value === 'string') {
    if (CONTROL_CHARS_RE.test(value)) out.push(path.join('.') || '(root)');
    return out;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      findControlChars(value[i], maxDepth, [...path, String(i)], out);
    }
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      findControlChars(v, maxDepth, [...path, k], out);
    }
  }
  return out;
}

function sanitizeString(input: string): string {
  // Remove null bytes and ASCII control chars (keeps \t \n \r).
  let out = input.replace(/\u0000/g, '');
  out = out.replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  // Normalize to reduce weird Unicode edge cases.
  try {
    out = out.normalize('NFKC');
  } catch {
    // ignore if runtime doesn't support normalize
  }

  return out;
}

function sanitizeJson(
  value: unknown,
  opts: Required<Pick<SanitizeOptions, 'ignoreKeys' | 'maxDepth'>>,
  depth: number,
  parentKey?: string
): unknown {
  if (depth > opts.maxDepth) return value;
  if (typeof value === 'string') {
    if (parentKey && opts.ignoreKeys.includes(parentKey)) return value;
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeJson(v, opts, depth + 1));
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = sanitizeJson(v, opts, depth + 1, k);
    }
    return out;
  }
  return value;
}

function replaceObjectContents(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const k of Object.keys(target)) {
    delete target[k];
  }
  for (const [k, v] of Object.entries(source)) {
    target[k] = v;
  }
}

export function sanitizeRequest(options: SanitizeOptions = {}): RequestHandler {
  const opts = {
    ignoreKeys: options.ignoreKeys ?? [
      'password',
      'token',
      'accessToken',
      'refreshToken',
    ],
    maxDepth: options.maxDepth ?? 8,
    rejectControlChars: options.rejectControlChars ?? true,
  };

  return (req: Request, res: Response, next: NextFunction) => {
    if (opts.rejectControlChars) {
      const maxDepth = opts.maxDepth;
      const bodyPaths = req.body
        ? findControlChars(req.body, maxDepth, ['body'])
        : [];
      const queryPaths = req.query
        ? findControlChars(req.query, maxDepth, ['query'])
        : [];
      const paramsPaths = req.params
        ? findControlChars(req.params, maxDepth, ['params'])
        : [];
      const paths = [...bodyPaths, ...queryPaths, ...paramsPaths];
      if (paths.length > 0) {
        return res.status(400).json({
          message: 'Invalid request: control characters are not allowed',
          fields: paths,
        });
      }
    }

    // body
    if (req.body) {
      req.body = sanitizeJson(req.body, opts, 0) as JsonValue;
    }
    // query: Express 5 exposes req.query as a getter-only property,
    // so we sanitize by mutating the underlying object in-place.
    if (req.query && typeof req.query === 'object') {
      const sanitized = sanitizeJson(req.query, opts, 0);
      if (
        sanitized &&
        typeof sanitized === 'object' &&
        !Array.isArray(sanitized)
      ) {
        replaceObjectContents(
          req.query as unknown as Record<string, unknown>,
          sanitized as Record<string, unknown>
        );
      }
    }
    // params: mutate in-place to avoid relying on setter semantics
    if (req.params && typeof req.params === 'object') {
      const sanitized = sanitizeJson(req.params, opts, 0);
      if (
        sanitized &&
        typeof sanitized === 'object' &&
        !Array.isArray(sanitized)
      ) {
        replaceObjectContents(
          req.params as unknown as Record<string, unknown>,
          sanitized as Record<string, unknown>
        );
      }
    }
    next();
  };
}
