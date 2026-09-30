# M3 — Webhooks

**Goal:** turning a Zap on connects its repository to the app, and a real "pull request opened" event reaches the API, is verified, and is matched to the right Zaps. Running the action (posting the comment) is M4; here the match is logged.
**Stories:** US-0.4, US-4.2, US-4.3, US-4.4.

## How GitHub reaches the app

`GitHub → https://<ngrok static domain>/api/webhooks/github → ngrok → http://localhost:3000/api/webhooks/github`

Nothing is configured by hand on GitHub. The app manages the webhook through the REST API with the user's OAuth token (`admin:repo_hook` scope from M1).

## Backend (`backend/zapapp/src`)

| File | Responsibility |
| --- | --- |
| `config/env.ts` | + `PUBLIC_WEBHOOK_URL` (https, ends with `/api/webhooks/github`), `GITHUB_WEBHOOK_SECRET` (≥ 20 chars) |
| `models/repo-hook.model.ts` | `repo_hooks`: one webhook per (user, repo); `hookId` unique |
| `modules/hooks/hooks.service.ts` | `ensureHook(userId, repo)`, `findHookById(hookId)` |
| `modules/zaps/zaps.service.ts` | Calls `ensureHook` before saving any **enabled** Zap |
| `lib/webhook-signature.ts` | `verifyGithubSignature(raw, header, secret)` (HMAC-SHA256, constant-time) |
| `modules/webhooks/webhooks.routes.ts` | `POST /api/webhooks/github` with its own `express.raw()` parser |
| `modules/webhooks/dispatcher.ts` | `findZapsForPullRequestOpened(hookId, payload)` |
| `lib/github-client.ts` | `GitHubError` now carries GitHub's `errors[]` (needed to detect "hook already exists") |
| `app.ts` | Webhook router mounted **before** `express.json()` |

### Flow 1 — Turning a Zap on (`ensureHook`)

Runs on create with `enabled: true`, and on every PATCH whose result is enabled (turning on, or editing while on, including a repo change). Turning a Zap **off** never calls GitHub.

1. Look up `repo_hooks { owner, repoFullName }`.
2. If found → `PATCH /repos/{repo}/hooks/{hookId}` with the desired config. Re-sending it every time self-heals a changed ngrok URL or secret.
   - GitHub 404 (hook deleted on GitHub) → continue to create.
3. Create → `POST /repos/{repo}/hooks`:
   ```json
   { "name": "web", "active": true, "events": ["pull_request"],
     "config": { "url": PUBLIC_WEBHOOK_URL, "content_type": "json", "secret": GITHUB_WEBHOOK_SECRET, "insecure_ssl": "0" } }
   ```
   - 422 "Hook already exists" → list hooks, adopt the one with our URL, PATCH it (resets its secret).
4. Upsert `repo_hooks { owner, repoFullName, hookId, url }`.
5. GitHub sends a `ping` to the new hook (Flow 2 answers 200).

Errors (nothing is saved, the Zap stays as it was):

| GitHub says | API returns |
| --- | --- |
| 403 / 404 (no admin rights, repo gone) | `422 hook_install_failed` "You need admin access to the repository" |
| 401 (token revoked) | `401 github_reauth_required` → UI sends the user to sign in again |
| anything else | `502 github_error` |

### Flow 2 — Receiving a delivery (`POST /api/webhooks/github`)

1. `express.raw({ type: 'application/json', limit: '5mb' })` keeps the exact bytes (non-JSON content type → 415).
2. Verify `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256(raw body, `GITHUB_WEBHOOK_SECRET`) with `timingSafeEqual`. Missing/wrong → **401 `invalid_signature`**, nothing else runs.
3. Parse JSON → 400 `invalid_json` if broken.
4. `X-GitHub-Event: ping` → **200 `{ ok: true }`**.
5. Anything other than `pull_request` with `action: "opened"` → **204** (ignored).
6. Dispatch: `X-GitHub-Hook-ID` → `repo_hooks` → owner. Then
   `zaps.find({ owner, enabled: true, 'trigger.key': 'github:pull_request.opened', 'trigger.config.repoFullName': payload.repository.full_name })`.
7. Log `N Zap(s) matched` with delivery id, repo, PR number and Zap ids → **202 `{ delivery, matched }`**. (M4 runs the matched Zaps after this response.)

Unknown hook id → 202 with `matched: 0` and a warning log.

### Business rules

- Only **enabled** Zaps of the **hook's owner**, for **this trigger** on **this repository** match. Disabled Zaps, other repos and other users' Zaps never run.
- Two users with Zaps on the same repo each have their own hook; the hook id keeps their deliveries apart (no double comments).
- Two enabled Zaps of the same user on one repo share one hook and both match.
- Signature is checked before any database access.
- Webhooks are never removed automatically yet (M5: remove when no Zap uses the repo).

### `repo_hooks` collection

`owner` · `repoFullName` · `hookId` (unique) · `url` · timestamps. Unique index `{ owner, repoFullName }`.

## Frontend

Only a hint under the builder's status switch ("Turning a Zap on installs a webhook…"). Errors from `ensureHook` already surface: toast on the list toggle (which reverts), form alert in the builder.

## Config (new)

`PUBLIC_WEBHOOK_URL`, `GITHUB_WEBHOOK_SECRET` (validated at startup). `NGROK_DOMAIN` is informational.

## Tests

- `webhook-signature.test.ts` — GitHub's documented example signature, wrong secret, changed body, missing/sha1/truncated header.
- `webhooks.test.ts` — 401 bad/missing signature, ping 200, other events 204, PR opened → exact dispatch query + 202, unknown hook, signed non-JSON 400, JSON parsing unaffected elsewhere.
- `hooks.test.ts` — create payload, reuse via PATCH, recreate after GitHub 404, adopt existing on 422, no admin → 422, token revoked → reauth.
- `zaps.test.ts` — enabling calls `ensureHook` before saving; failure leaves Zap unsaved/off; turning off doesn't call GitHub.

## Verify

1. ngrok up; `curl https://<domain>/api/health` returns JSON.
2. Turn a Zap on → `zap-test` → Settings → Webhooks shows one hook to the ngrok URL, ping delivery green.
3. Second Zap on the same repo, turned on → still one hook.
4. Open a PR on `zap-test` → API log: `2 Zap(s) matched`; GitHub's Recent Deliveries shows 202.
5. Turn both off, open another PR → `0 Zap(s) matched`.
6. `curl -X POST https://<domain>/api/webhooks/github -H "Content-Type: application/json" -H "X-Hub-Signature-256: sha256=00" -d "{}"` → 401.
