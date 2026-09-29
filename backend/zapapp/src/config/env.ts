import { z } from 'zod';

// Placeholders from .env.example look like <db_user>; catch them early with a clear message.
const noPlaceholder = (name: string) =>
  z
    .string()
    .min(1, `${name} is empty`)
    .refine((v) => !/<[^>]+>/.test(v), `${name} still contains a <placeholder> from .env.example`);

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  FRONTEND_URL: z.url({ message: 'FRONTEND_URL must be a URL, e.g. http://localhost:4200' }),
  MONGODB_URI: noPlaceholder('MONGODB_URI').refine(
    (v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'),
    'MONGODB_URI must start with mongodb:// or mongodb+srv://',
  ),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
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
