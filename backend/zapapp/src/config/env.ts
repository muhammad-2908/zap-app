import { z } from 'zod';

// Placeholders from .env.example look like <db_user>; catch them early with a clear message.
const noPlaceholder = (name: string) =>
  z
    .string()
    .min(1, `${name} is empty`)
    .refine((v) => !/<[^>]+>/.test(v), `${name} still contains a <placeholder> from .env.example`);

const base64Key32 = (name: string) =>
  noPlaceholder(name).refine(
    (v) => Buffer.from(v, 'base64').length === 32,
    `${name} must be 32 random bytes in base64 (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")`,
  );

/** Optional value: an empty string in .env means "not set". */
const optionalString = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().optional());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.url({ message: 'FRONTEND_URL must be a URL, e.g. http://localhost:4200' }),
  // Extra browser origins allowed to call the API with credentials (comma-separated), besides FRONTEND_URL.
  CORS_ORIGINS: optionalString.transform((v) =>
    (v ?? '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  MONGODB_URI: noPlaceholder('MONGODB_URI').refine(
    (v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
    'MONGODB_URI must start with mongodb:// or mongodb+srv://',
  ),

  // GitHub OAuth App
  GITHUB_CLIENT_ID: noPlaceholder('GITHUB_CLIENT_ID'),
  GITHUB_CLIENT_SECRET: noPlaceholder('GITHUB_CLIENT_SECRET'),
  GITHUB_OAUTH_CALLBACK_URL: z.url({
    message: 'GITHUB_OAUTH_CALLBACK_URL must be a URL, e.g. http://localhost:4200/api/auth/github/callback',
  }),

  // Sessions and token encryption
  JWT_SECRET: noPlaceholder('JWT_SECRET').refine((v) => v.length >= 32, 'JWT_SECRET must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: base64Key32('TOKEN_ENCRYPTION_KEY'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),

  // Webhooks: the public URL GitHub posts to (ngrok in development) and the HMAC secret it signs with.
  PUBLIC_WEBHOOK_URL: z
    .url({ message: 'PUBLIC_WEBHOOK_URL must be a URL, e.g. https://your-name.ngrok-free.app/api/webhooks/github' })
    .refine((v) => v.startsWith('https://'), 'PUBLIC_WEBHOOK_URL must use https (GitHub requires it here)')
    .refine((v) => v.endsWith('/api/webhooks/github'), 'PUBLIC_WEBHOOK_URL must end with /api/webhooks/github'),
  GITHUB_WEBHOOK_SECRET: noPlaceholder('GITHUB_WEBHOOK_SECRET').refine(
    (v) => v.length >= 20,
    'GITHUB_WEBHOOK_SECRET must be at least 20 characters (use the randomBytes(32) command)',
  ),

  // Copilot (optional). Without a key the Copilot uses a rule-based parser.
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: optionalString.transform((v) => v ?? 'gpt-6-luna'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const lines = result.error.issues.map((issue) => {
      const key = issue.path.join('.') || '(root)';
      const missing = issue.code === 'invalid_type' && process.env[key] === undefined;
      return `  - ${key}: ${missing ? 'missing' : issue.message}`;
    });
    // Logger is not available yet (it depends on env), so print directly.
    console.error(`\nInvalid backend configuration. Fix backend/zapapp/.env:\n${lines.join('\n')}\n`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();
