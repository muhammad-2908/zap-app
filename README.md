# Zap App

A small workflow automation app inspired by Zapier's Zaps: sign in with GitHub, build a Zap
(**pull request opened → comment on that pull request**), and a real PR triggers it.

TypeScript throughout on the MEAN stack: MongoDB, Express 5, Angular 21, Node.js.

> Status: **M2 — Zap builder**. Zaps can be created, listed, edited and turned on/off. Running them on real pull requests arrives in M3–M4.

## Time log

| Milestone | Started | Finished |
| --- | --- | --- |
| M0 Skeleton | _fill in_ | _fill in_ |
| M1 GitHub sign-in | _fill in_ | _fill in_ |
| M2 Zap builder | _fill in_ | _fill in_ |

## Repository layout

```
backend/zapapp     Express API (TypeScript, ESM, tsx for dev)
frontend/zap-app   Angular 21 app (standalone components, signals)
docker-compose.yml Optional local MongoDB
```

## Prerequisites

- Node.js **22.12+ or 24.15+**
- A MongoDB database: MongoDB Atlas (free tier) or `docker compose up -d`

## Run locally

1. Backend config:

   ```
   cd backend/zapapp
   copy .env.example .env      # macOS/Linux: cp .env.example .env
   ```

   Fill in `MONGODB_URI` (keep `/zap-app` as the database name), the GitHub OAuth App values and the
   two generated secrets. See [GitHub OAuth App](#github-oauth-app) below.

2. Start the API (terminal 1):

   ```
   cd backend/zapapp
   npm install
   npm run dev
   ```

   Expect `MongoDB connected` and `API listening on http://localhost:3000`.

3. Start the frontend (terminal 2):

   ```
   cd frontend/zap-app
   npm install
   npm start
   ```

   Open http://localhost:4200. The dev server proxies `/api/*` to the API on port 3000
   (`proxy.conf.json`), so the browser only ever talks to one origin.

## GitHub OAuth App

Sign-in uses a GitHub **OAuth App** (not a GitHub App). Create one at GitHub → Settings → Developer
settings → OAuth Apps → New OAuth App:

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:4200` |
| Authorization callback URL | `http://localhost:4200/api/auth/github/callback` |

Copy the Client ID and a generated client secret into `.env`. The callback goes through the Angular
dev server's proxy, so the session cookie is set on the same origin as the app.

**How sign-in works**

1. "Sign in with GitHub" navigates to `/api/auth/github`. The API stores a random `state` in a short-lived
   httpOnly cookie and redirects to GitHub with scopes `read:user repo admin:repo_hook`.
2. GitHub redirects back to `/api/auth/github/callback?code&state`. The API checks `state` against the
   cookie, exchanges the code for a token, loads the GitHub profile and upserts the user by GitHub id.
3. The GitHub token is stored **encrypted** (AES-256-GCM, `TOKEN_ENCRYPTION_KEY`) and is never sent to
   the browser. The browser gets a signed session JWT in an httpOnly, SameSite=Lax cookie (8h).
4. Angular calls `/api/auth/me` at startup; route guards send signed-out users to `/login`.

`repo` and `admin:repo_hook` are requested now because later milestones install a webhook and post PR
comments with this token; asking once avoids a second consent screen.

## Scripts

| Where | Command | What it does |
| --- | --- | --- |
| backend | `npm run dev` | API with reload on change |
| backend | `npm run typecheck` | TypeScript check |
| backend | `npm test` | Vitest + supertest |
| backend | `npm run build` / `npm start` | Compile to `dist/` and run it |
| frontend | `npm start` | Angular dev server on :4200 with the API proxy |
| frontend | `npm test` | Angular unit tests (Vitest) |

## API so far

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/health` | `200 {"status":"ok","db":"connected",...}` or `503 {"status":"degraded",...}` |
| GET | `/api/auth/github` | `302` to GitHub's consent page |
| GET | `/api/auth/github/callback` | `302` to `/zaps`, or to `/login?error=denied\|state\|github` |
| GET | `/api/auth/me` | `200` current user (no token), `401 unauthenticated` |
| POST | `/api/auth/logout` | `204`, clears the session cookie |
| GET | `/api/catalog` | Apps, triggers, actions, fields and template variables |
| GET | `/api/github/repos[?fresh=1]` | Repos the user can administer · `401 github_reauth_required` |
| GET | `/api/zaps` | The caller's Zaps, newest first |
| POST | `/api/zaps` | `201` Zap · `400 validation_error` with field `details` |
| GET | `/api/zaps/:id` | `200` · `404 zap_not_found` (also for other users' Zaps) |
| PATCH | `/api/zaps/:id` | Partial update incl. `enabled` · `400` · `404` |

Errors always use `{ "error": { "code", "message", "details?" } }`.

## Implementation notes

Per-milestone code flow and business rules live in [`docs/implementaion`](docs/implementaion).

## Configuration errors

The API validates its environment at startup and refuses to start with a clear message: a missing
`MONGODB_URI`, a `<placeholder>` left from `.env.example`, a wrong database password, an unknown
cluster host, or an Atlas IP allowlist that blocks your machine.
