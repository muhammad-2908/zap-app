# Zap App

A small workflow automation app inspired by Zapier's Zaps. Sign in with GitHub, build a Zap
(**pull request opened → comment on that pull request**), turn it on, and opening a real PR posts the
comment.

TypeScript throughout on the MEAN stack: MongoDB, Express 5, Angular 21, Node.js.

## Time log

| Milestone | Started | Finished |
| --- | --- | --- |
| M0 Skeleton | _fill in_ | 60 mins |
| M1 GitHub sign-in | _fill in_ | 30 mins |
| M2 Zap builder | _fill in_ | 30 mins |
| M3 Webhooks | _fill in_ | 10 mins |
| M4 PR comment | _fill in_ | 25 mins |
| M5 Hardening + README | _fill in_ | 20 mins |

Overall: started _fill in_, stopped _fill in_.

## What it does

- **Sign in with GitHub** (OAuth). Sessions are an httpOnly cookie; the GitHub token stays on the server, encrypted.
- **Zap builder**: pick a trigger app and event, a repository, an action and its fields; name it; turn it on or off.
  - App picker shows GitHub plus GitLab, Bitbucket, Jira, Slack and Linear as **Coming soon**.
  - The comment supports pull request data (`{{pr.author}}`, `{{pr.number}}`, `{{pr.title}}`, …) with a live preview.
- **Zaps list**: status toggle, last run ("Commented 2 minutes ago" / "Failed · reason"), run history, edit, delete.
- **Automation**: turning a Zap on installs a webhook on the repository. When a PR is opened, GitHub notifies the
  API, which verifies the signature, finds the owner's enabled Zaps for that repo and posts the comment on the PR.
- Zaps are private to their owner; another user's Zap behaves as if it didn't exist (404).

## Architecture

```
Browser ── Angular 21 (:4200) ──/api proxy──► Express 5 API (:3000) ──► MongoDB (users, zaps, repo_hooks, zap_runs)
                                                   │    ▲
                         GitHub REST (OAuth, hooks,│    │ signed webhook deliveries
                         comments) ◄───────────────┘    │
                                                  ngrok static domain ◄── GitHub
```

| Decision | Why |
| --- | --- |
| GitHub **OAuth App** with `read:user repo admin:repo_hook` | One token signs in, lists repos, installs the webhook and comments. Comments are posted as the user (a GitHub App would post as a bot but needs a private key and an install flow). |
| Webhook installed **by the app** when a Zap is turned on | No manual GitHub setup; one hook per (user, repo), reused by that user's Zaps. |
| Deliveries matched by **hook id → owner** | Two users with Zaps on the same repo never trigger each other's Zaps. |
| **Backend-owned catalog** (`catalog.ts`) | One source of truth for the picker, validation and template variables. Adding an app = a catalog entry + a handler in `engine/registry.ts`. |
| **Idempotent runs** (unique `zap + deliveryId`) | GitHub retries and manual redeliveries never double-comment. |
| Webhook answered **202 first**, Zaps run after | GitHub gives up after 10 s. |
| Same-origin dev proxy + JWT in an httpOnly, SameSite=Lax cookie | No CORS, token never readable by scripts, cross-site POSTs don't carry the cookie. |

Per-milestone code flow and business rules: [`docs/implementaion`](docs/implementaion).

## Prerequisites

- Node.js **22.12+** or **24.15+**, npm, git
- MongoDB: a free MongoDB Atlas cluster, or Docker (`docker compose up -d` starts `mongo:7`)
- A GitHub account and a repository you own to test with (e.g. `you/zap-test`, with a README so it has `main`)
- ngrok with a free **static** domain

## Setup

### 1. GitHub OAuth App

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:4200` |
| Authorization callback URL | `http://localhost:4200/api/auth/github/callback` |

Copy the Client ID and generate a client secret. The callback goes through the Angular dev server's proxy, so
the session cookie is set on the app's own origin.

### 2. ngrok (so GitHub can reach your machine)

```
ngrok config add-authtoken <your-token>
ngrok http 3000 --url=https://<your-static-domain>.ngrok-free.app
```

The static domain matters: the webhook URL is stored on GitHub. Check it with
`curl https://<your-static-domain>.ngrok-free.app/api/health` while the API runs.
**Don't add a webhook on GitHub by hand**; the app manages it.

### 3. Backend configuration

```
cd backend/zapapp
copy .env.example .env        # macOS/Linux: cp .env.example .env
```

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Atlas: `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/zap-app?retryWrites=true&w=majority` · Docker: `mongodb://localhost:27017/zap-app` |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | From step 1 |
| `GITHUB_OAUTH_CALLBACK_URL` | `http://localhost:4200/api/auth/github/callback` |
| `PUBLIC_WEBHOOK_URL` | `https://<your-static-domain>.ngrok-free.app/api/webhooks/github` |
| `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GITHUB_WEBHOOK_SECRET` | Each: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `PORT`, `FRONTEND_URL`, `LOG_LEVEL`, `SESSION_TTL_HOURS` | Defaults are fine |

The API validates this file at startup and refuses to start with a clear list of problems (missing value,
leftover `<placeholder>`, wrong format). Database errors are explained too (wrong password, unknown host,
IP not allowed in Atlas → Network Access).

### 4. Run (three terminals)

```
# 1. API
cd backend/zapapp
npm install
npm run dev              # "MongoDB connected" + "API listening on http://localhost:3000"

# 2. Web app
cd frontend/zap-app
npm install
npm start                # http://localhost:4200

# 3. Tunnel
ngrok http 3000 --url=https://<your-static-domain>.ngrok-free.app
```

## Try the main flow

1. Open http://localhost:4200 and **Sign in with GitHub**.
2. **Create Zap**: GitHub · Pull request opened · `you/zap-test` → GitHub · Comment on pull request, comment
   `Thanks @{{pr.author}} for opening #{{pr.number}}!`, switch it **On**, **Create Zap**.
   On GitHub, `zap-test` → Settings → Webhooks now shows the app's hook with a green `ping`.
3. Open a pull request on `zap-test` (e.g. edit the README on github.com → "Create a new branch" → "Propose
   changes" → "Create pull request").
4. Within seconds the comment appears on the PR. **Refresh** the Zap list: "Commented just now".
   **History** shows the run with a link to the comment.
5. Redeliver the event (Settings → Webhooks → Recent Deliveries → Redeliver): no second comment.
6. Turn the Zap **Off** and open another PR: no comment.

## Tests

| Command | Where | What |
| --- | --- | --- |
| `npm test` | backend | Unit + HTTP tests (Vitest + supertest), no database, GitHub mocked |
| `npm run test:integration` | backend | The whole API against a real MongoDB (mongodb-memory-server; first run downloads a `mongod` binary, ~100 MB). Ownership across two users, webhook install/reuse/removal, PR opened → one comment per delivery, disabled Zaps skipped |
| `npm run typecheck` | backend | TypeScript check |
| `npm test` | frontend | Angular component/service tests (Vitest) |

## API

| Method | Path | Response |
| --- | --- | --- |
| GET | `/api/health` | `200 {"status":"ok","db":"connected"}` · `503` degraded |
| GET | `/api/auth/github` | `302` to GitHub's consent page |
| GET | `/api/auth/github/callback` | `302` to `/zaps`, or `/login?error=denied\|state\|github` |
| GET | `/api/auth/me` | `200` current user (never the token) · `401` |
| POST | `/api/auth/logout` | `204` |
| GET | `/api/catalog` | Apps, triggers, actions, fields, template variables |
| GET | `/api/github/repos[?fresh=1]` | Repos the user administers · `401 github_reauth_required` |
| GET | `/api/zaps` | The caller's Zaps |
| POST | `/api/zaps` | `201` · `400 validation_error` (field `details`) · `422 hook_install_failed` |
| GET | `/api/zaps/:id` | `200` · `404 zap_not_found` (also for other users' Zaps) |
| PATCH | `/api/zaps/:id` | Partial update incl. `enabled` · `400` · `404` · `422` |
| DELETE | `/api/zaps/:id` | `204` (also deletes its runs; removes the repo webhook if no Zap uses it) · `404` |
| GET | `/api/zaps/:id/runs` | Last 20 runs · `404` |
| POST | `/api/webhooks/github` | GitHub only, HMAC-signed · `200` ping · `202` PR opened · `204` ignored · `401` bad signature |

Errors always use `{ "error": { "code", "message", "details?" } }`.

## Security

- Secrets only in `backend/zapapp/.env` (git-ignored); `.env.example` holds placeholders.
- GitHub tokens encrypted at rest (AES-256-GCM), excluded from queries by default, never returned or logged.
- Session: signed JWT (HS256, issuer/audience/expiry checked) in an httpOnly, SameSite=Lax cookie; `Secure` in production.
- OAuth `state` cookie checked with a constant-time compare (CSRF on the login callback).
- Webhooks: HMAC-SHA256 signature verified on the raw body, constant-time, before any database access.
- Every Zap query is scoped to the owner; request bodies are strict (unknown keys such as `owner` are rejected).
- `helmet` headers, JSON body limit 100 kb, `Cache-Control: no-store` on API responses, auth headers,
  cookies and OAuth query strings redacted from logs.

## Project layout

```
backend/zapapp/src
  server.ts, app.ts            startup, middleware order, routers
  config/                      .env loading and validation
  catalog/                     apps/triggers/actions + Zap validation
  lib/                         crypto, session, GitHub client, template, webhook signature, logger
  models/                      user, zap, repo-hook, zap-run
  modules/auth|zaps|github|hooks|webhooks|engine|catalog|health
backend/zapapp/tests           unit tests; tests/integration = real MongoDB
frontend/zap-app/src/app
  core/                        API clients, auth, guards, interceptor, models, toasts
  features/auth, features/zaps list, builder, run history, components
docs/implementaion             per-milestone implementation notes
```

## Known limitations and next steps

- Only GitHub runs; other apps are catalog placeholders. The registry makes the next one a small addition.
- Comments are posted as the signed-in user; a GitHub App would give a bot identity and finer permissions.
- The repo picker loads the first 100 repositories with admin access.
- Zaps run in-process after the webhook response; a queue (with retries and back-off) would survive restarts.
- No rate limiting on the API yet.
- Stateless sessions can't be revoked before they expire (8 h).

## How AI was used

_Fill in before submitting. Suggested points:_

- What I planned and decided myself: _…_
- What I delegated to AI (e.g. drafting code per milestone, tests, docs): _…_
- How I reviewed it (ran each milestone end to end before committing, read the diffs, …): _…_
- What I changed from the AI's suggestions: _…_
