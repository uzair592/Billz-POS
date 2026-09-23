import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  RUNTIME_DATABASE_URL: z.string().min(1),
  PLATFORM_DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  SESSION_COOKIE_NAME: z.string().default("cafe_pos_session"),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  SESSION_SECRET: z.string().min(32),
  CSRF_SECRET: z.string().min(32),
  MAIL_HOST: z.string().default("127.0.0.1"),
  MAIL_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().default("no-reply@cafe-pos.local"),
});

export type Environment = z.infer<typeof envSchema>;

export function validateEnvironment(
  value: Record<string, unknown>,
): Environment {
  return envSchema.parse(value);
}
