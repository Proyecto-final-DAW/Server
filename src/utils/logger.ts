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
      // Belt-and-braces password redaction. Today the http logger does
      // not include `req.body` in its serializer, so a logged login
      // request never lands the cleartext password — but if anyone
      // ever turns `body` on for debugging, this list keeps the
      // password fields out of the log stream by default.
      'req.body.password',
      'req.body.newPassword',
      'req.body.currentPassword',
      // Mirror the deferred-tool logger output too.
      'body.password',
      'body.newPassword',
      'body.currentPassword',
    ],
    remove: true,
  },
});
