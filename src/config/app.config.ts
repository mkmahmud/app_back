import { z } from 'zod'

// ─── Environment Schema (Zod) ─────────────────────────────────────────────────
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  APP_URL: z.string().url().default('http://localhost:8000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  BCRYPT_ROUNDS: z.coerce.number().min(10).max(14).default(12),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be >= 16 chars'),
  COOKIE_SECURE: z
    .string()
    .transform(v => v === 'true')
    .default('false'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('lax'),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  RATE_LIMIT_WHITELIST: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  SENTRY_DSN: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config)
  if (!result.success) {
    const errors = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`❌ Invalid environment variables:\n${errors}`)
  }
  return result.data
}

// ─── Typed config factories ───────────────────────────────────────────────────
export const appConfig = () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8000', 10),
  appUrl: process.env.APP_URL || 'http://localhost:8000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',
})

export const jwtConfig = () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET!,
  accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1h',
  refreshSecret: process.env.JWT_REFRESH_SECRET!,
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
})

export const authConfig = () => ({
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  cookieSecret: process.env.COOKIE_SECRET!,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'strict' | 'lax' | 'none',
})

export const corsConfig = () => ({
  origins: (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim()),
})
