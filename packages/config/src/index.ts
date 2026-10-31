import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env from workspace root if not already loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().optional(),
  API_PORT: z.coerce.number().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  GATEWAY_PORT: z.coerce.number().default(4001),
  API_PUBLIC_URL: z.string().default('http://localhost:4000'),
  GATEWAY_PUBLIC_URL: z.string().default('ws://localhost:4001'),
  WEB_PUBLIC_URL: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().default('postgresql://strata:strata_dev_password@localhost:5432/strata_db?sslmode=disable'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SCYLLA_CONTACT_POINTS: z.string().default('127.0.0.1'),
  SCYLLA_LOCAL_DC: z.string().default('datacenter1'),
  SCYLLA_KEYSPACE: z.string().default('strata_messages'),

  JWT_PRIVATE_KEY: z.string().min(1, 'JWT_PRIVATE_KEY zorunludur. `pnpm setup:dev` calistirin.'),
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY zorunludur. `pnpm setup:dev` calistirin.'),
  JWT_KID: z.string().default('strata-dev-key-1'),
  MFA_ENCRYPTION_KEY: z.string().length(64, 'MFA_ENCRYPTION_KEY 32-byte hex (64 karakter) olmalidir.'),
  ACCESS_TOKEN_EXPIRES_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_EXPIRES_DAYS: z.coerce.number().default(30),

  GOOGLE_CLIENT_ID: z.string().optional().default(''),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
  GITHUB_CLIENT_ID: z.string().optional().default(''),
  GITHUB_CLIENT_SECRET: z.string().optional().default(''),

  LIVEKIT_URL: z.string().default('ws://localhost:7880'),
  LIVEKIT_API_KEY: z.string().default('devkey'),
  LIVEKIT_API_SECRET: z.string().default('secret'),

  S3_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('strata-attachments'),
  S3_ACCESS_KEY: z.string().default('minioadmin'),
  S3_SECRET_KEY: z.string().default('minioadmin'),
  S3_PUBLIC_URL: z.string().default('http://localhost:9000/strata-attachments'),
  IMGPROXY_URL: z.string().default('http://localhost:8080'),

  MEILISEARCH_HOST: z.string().default('http://localhost:7700'),
  MEILISEARCH_KEY: z.string().default('strata_master_search_key'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('Strata Platform <no-reply@strata.chat>'),

  SENTRY_DSN: z.string().optional().default(''),
  TURNSTILE_SITE_KEY: z.string().optional().default(''),
  TURNSTILE_SECRET_KEY: z.string().optional().default('')
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cachedConfig) return cachedConfig;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Ortam degiskeni dogrulama hatasi (Config validation failed):');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Gecersiz ortam degiskenleri nedeniyle uretim modunda baslatilamadi.');
    }
  }

  const parsed = envSchema.parse(process.env);
  if (parsed.PORT) {
    parsed.API_PORT = parsed.PORT;
  }
  cachedConfig = parsed;
  return cachedConfig;
}

