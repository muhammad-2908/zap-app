# M1 — GitHub sign-in

**Goal:** users sign in with GitHub, stay signed in, sign out; only signed-in users reach the app.
**Stories:** US-1.1 – US-1.4, US-1.5 (error messages).

## Backend (`backend/zapapp/src`)

| File | Responsibility |
| --- | --- |
| `modules/auth/auth.routes.ts` | `/api/auth/github`, `/github/callback`, `/me`, `/logout` |
| `modules/auth/auth.service.ts` | `completeGithubLogin(code)`: code → token → profile → user → session |
| `modules/users/users.service.ts` | `upsertGithubUser`, `findUserById`, `PublicUser` (never contains the token) |
| `models/user.model.ts` | `users` collection |
| `lib/github-client.ts` | `buildAuthorizeUrl`, `exchangeCodeForToken`, `githubRequest`, `getAuthenticatedUser`, `GitHubError`, scopes |
| `lib/crypto.ts` | `encryptSecret` / `decryptSecret` (AES-256-GCM) |
| `lib/session.ts` | `signSession` / `verifySession` (HS256 JWT via `jose`), cookie options |
| `middleware/require-auth.ts` | `requireAuth` (401 unless valid session + existing user), `currentUser(req)` |
| `types/express.d.ts` | Adds `req.user?: PublicUser` |

### Sign-in flow

1. Browser navigates (full page, not XHR) to `GET /api/auth/github`.
2. API creates a random `state`, stores it in cookie `zap_oauth_state` (httpOnly, Lax, 10 min, path `/api/auth/github`), redirects to GitHub authorize with `client_id`, `redirect_uri`, `scope`, `state`.
3. User approves; GitHub redirects to `GITHUB_OAUTH_CALLBACK_URL` = `http://localhost:4200/api/auth/github/callback` (through the Angular proxy, so cookies land on `:4200`).
4. Callback clears the state cookie, then:
   - `error=access_denied` → `302 /login?error=denied`
   - missing code/state or `state` ≠ cookie (constant-time compare) → `302 /login?error=state`
5. `completeGithubLogin(code)`:
   1. `POST github.com/login/oauth/access_token` → access token + granted scopes (GitHub returns 200 with an `error` field on failure; treated as failure).
   2. `GET api.github.com/user` → profile.
   3. Upsert user by `githubId`: refresh login/name/avatar/email, **encrypted** token, scopes, `tokenStatus: 'valid'`, `lastLoginAt`.
   4. Sign JWT `{ sub: userId }`, issuer `zap-app`, audience `zap-app-web`, expiry `SESSION_TTL_HOURS` (8).
6. Set cookie `zap_session` (httpOnly, SameSite=Lax, Secure in production) → `302 /zaps`.
7. Any failure in step 5 → logged → `302 /login?error=github`.

### Session checks (`requireAuth`)

Cookie `zap_session` → `verifySession` (signature, issuer, audience, expiry, HS256 only) → `findUserById` (invalid ObjectId → null) → `req.user`. Any failure → `401 unauthenticated`.

### Endpoints

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| GET | `/api/auth/github` | – | 302 to GitHub |
| GET | `/api/auth/github/callback` | state cookie | 302 `/zaps` or `/login?error=denied\|state\|github` |
| GET | `/api/auth/me` | session | 200 `PublicUser` · 401 |
| POST | `/api/auth/logout` | – | 204, clears `zap_session` (idempotent) |

### Business rules

- One user per GitHub account (`githubId` unique). Signing in again updates, never duplicates.
- The GitHub token is only ever stored as `v1:<iv>:<tag>:<ciphertext>`; `accessTokenEnc` has `select: false`; the API never returns or logs it.
- Scopes requested now: `read:user repo admin:repo_hook` (webhooks and PR comments come in M3/M4; one consent screen).
- Query strings are stripped from request logs (keeps `code`/`state` out of logs).
- Changing `TOKEN_ENCRYPTION_KEY` makes stored tokens unreadable → users must sign in again. Changing `JWT_SECRET` signs everyone out.

### `users` collection

`githubId` (unique) · `login` · `name` · `avatarUrl` · `email` · `accessTokenEnc` (hidden) · `tokenScopes[]` · `tokenStatus` (`valid|revoked`) · `lastLoginAt` · `createdAt` · `updatedAt`.

## Frontend (`frontend/zap-app/src/app`)

| File | Responsibility |
| --- | --- |
| `core/auth/auth-service.ts` | `user` signal, `isSignedIn`, `loadMe()`, `logout()`, `clear()` |
| `core/auth/auth-guards.ts` | `authGuard` (→ `/login`), `guestGuard` (→ `/zaps`) |
| `core/http/auth-interceptor.ts` | Any 401 (except `/api/auth/me`) → clear user → `/login?error=expired` |
| `app.config.ts` | `provideAppInitializer(loadMe)` + interceptor |
| `features/auth/login-page.ts` | Link to `/api/auth/github`; message from `?error=` |
| `shared/header/header.ts` | Avatar, login, Sign out |

### App flow

1. Startup: `loadMe()` calls `/api/auth/me` before routing. 200 → user set; 401 → signed out (not an error).
2. Routes: `/zaps` needs `authGuard`; `/login` has `guestGuard`.
3. Sign out: `POST /api/auth/logout` → clear user → `/login`.
4. Session expires mid-use: next API call gets 401 → interceptor sends user to `/login?error=expired`.

Login messages: `denied` cancelled · `state` link expired · `github` GitHub failed · `expired` session ended.

## Config (new)

`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_OAUTH_CALLBACK_URL`, `JWT_SECRET` (≥ 32 chars), `TOKEN_ENCRYPTION_KEY` (32 bytes base64), `SESSION_TTL_HOURS` (default 8). All validated at startup.

## Tests

- `backend/tests/auth.test.ts` (GitHub + DB mocked): redirect + state cookie, denied, state mismatch, missing state cookie, success sets session cookie, GitHub failure, `/me` 401/tampered/deleted user/200, logout clears cookie.
- `backend/tests/crypto.test.ts`: round-trip, fresh IV, tamper rejected, bad format rejected.
- `frontend/core/auth/auth.spec.ts`: `loadMe` 200/401, guards, logout. `login-page.spec.ts`: link target, error message.

## Verify

Signed-out `/zaps` → `/login`; sign in → `/zaps` with avatar; refresh keeps session; `users` doc has `accessTokenEnc` starting `v1:`; sign out → `/me` 401; cancel on GitHub → "cancelled" message.
