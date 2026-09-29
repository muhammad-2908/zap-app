# M0 — Skeleton

**Goal:** both apps run, the browser talks to the API through one origin, and the API reaches MongoDB.
**Stories:** US-0.1 (repo), US-0.2 (backend skeleton), US-0.3 (frontend shell).

## Backend (`backend/zapapp/src`)

| File | Responsibility |
| --- | --- |
| `server.ts` | Entry point: load `.env` → validate config → connect MongoDB → start HTTP server → graceful shutdown |
| `app.ts` | `buildApp()`: middleware order and routers. No `listen`, so tests can use it directly |
| `config/load-env.ts` | Loads `.env` into `process.env` (dotenv, quiet). Imported first |
| `config/env.ts` | zod schema for every env var; exits with a readable list of problems |
| `db/mongoose.ts` | `connectDb`, `dbState`, `disconnectDb`, `describeDbError` |
| `lib/logger.ts` | pino logger; redacts auth headers, cookies, tokens, passwords |
| `lib/http-error.ts` | `HttpError(status, code, message, details?)` |
| `middleware/error-handler.ts` | 404 for unknown routes + maps every error to the standard JSON shape |
| `modules/health/health.routes.ts` | `GET /api/health` |

### Startup flow

1. `load-env` reads `.env`.
2. `env.ts` validates. Missing value, `<placeholder>` left from `.env.example`, or wrong format → print list, `exit(1)`.
3. `connectDb` (10 s timeout). On failure `describeDbError` turns the driver error into one hint (bad password, unknown host, IP not allowlisted) → `exit(1)`. The URI is never logged.
4. `buildApp()` → `listen(PORT)`. Port in use → clear message, `exit(1)`.
5. SIGINT/SIGTERM → close server → disconnect Mongo → `exit(0)`.

### Request pipeline (order matters)

`helmet` → `pino-http` (skips `/api/health`) → *(M3: webhook router with raw body goes here)* → `express.json({ limit: '100kb' })` → routers → 404 → error handler.

### Rules

- Every error response: `{ "error": { "code", "message", "details?" } }`.
  - `HttpError` → its status/code · `ZodError` → 400 `validation_error` · bad JSON → 400 `invalid_json` · body > 100 kb → 413 · anything else → 500 `internal_error` (logged, no stack to client).
- Health: `200 {status:"ok", db:"connected"}` or `503 {status:"degraded", db:<state>}`.

## Frontend (`frontend/zap-app/src/app`)

| File | Responsibility |
| --- | --- |
| `app.config.ts` | Router (lazy routes, input binding), `HttpClient` with `fetch` |
| `app.ts` / `app.html` | Shell: `<app-header>` + `<router-outlet>` |
| `app.routes.ts` | `/` → `/zaps`, `/login`, `/zaps`, `**` → `/zaps` |
| `core/api/health-api.ts` | `GET /api/health`; treats 503 as a valid answer, errors only when the API is unreachable |
| `features/zaps/zap-list-page.ts` | Placeholder list + **System status** card (API / DB / uptime, Refresh) |
| `features/auth/login-page.ts` | Placeholder (real in M1) |
| `shared/header/header.ts` | Brand link |
| `styles.scss` | Design tokens (CSS variables, light/dark) + `.card`, `.btn` |

**Proxy:** `proxy.conf.json` sends `/api/*` from `:4200` to `http://localhost:3000` (wired in `angular.json` → `serve.options.proxyConfig`). The browser only sees one origin, so no CORS and cookies just work.

## Config

`PORT`, `NODE_ENV`, `FRONTEND_URL`, `LOG_LEVEL`, `MONGODB_URI` (database name `zap-app` in the path).

## Tests

`backend/tests/app.test.ts` — health 503 without DB, JSON 404, invalid JSON → 400, security headers.
`frontend/src/app/app.spec.ts` — shell renders brand and router outlet.

## Verify

Status card shows API reachable + DB connected; stopping the API shows "API unreachable"; a wrong DB password stops the API with one clear line.
