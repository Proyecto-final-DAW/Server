import pino from 'pino';

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug'),
  transport:
    nodeEnv === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            // In dev we prefer a concise single line without the full JSON object.
            singleLine: true,
            hideObject: true,
          },
        },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["set-cookie"]',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
});
