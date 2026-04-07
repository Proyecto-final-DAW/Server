import 'dotenv/config';
import { defineConfig } from 'prisma/config';

/**
 * `prisma generate` does not connect to the database; it only needs a syntactically
 * valid URL. Use a placeholder when DATABASE_URL is unset (e.g. CI before dotenv).
 */
const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://127.0.0.1:5432/prisma_generate_placeholder';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: databaseUrl,
  },
});
