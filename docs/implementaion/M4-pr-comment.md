# M4 — PR opened → comment (must-have complete)

**Goal:** a real pull request on a repo with an enabled Zap gets the configured comment, exactly once per delivery, with the outcome visible on the Zap list.
**Stories:** US-5.1, US-5.2 (server rendering), US-4.5.

## Backend (`backend/zapapp/src`)

| File | Responsibility |
| --- | --- |
| `modules/webhooks/webhooks.routes.ts` | After the 202, hands matched Zaps to `runMatchedZaps` (not awaited) |
| `modules/engine/run-zap.ts` | `runZap` (claim → execute → record) and `runMatchedZaps` (all Zaps, independently) |
| `modules/engine/registry.ts` | `TRIGGERS` / `ACTIONS` keyed `app:id` — what can actually run |
| `modules/engine/triggers/github-pull-request-opened.ts` | Payload → template context + target PR |
| `modules/engine/actions/github-pull-request-comment.ts` | Render body → `POST /repos/{repo}/issues/{n}/comments`, one retry on 5xx/network |
| `modules/engine/types.ts` | `TriggerHandler`, `ActionHandler`, `RunError` |
| `models/zap-run.model.ts` | `zap_runs` with unique `{ zap, deliveryId }` |
| `models/zap.model.ts` | + `lastRunError` |

### Run flow (per matched Zap)

1. Webhook answered `202` first (GitHub times out at 10 s); then `runMatchedZaps(zaps, deliveryId, payload)` runs every Zap via `Promise.allSettled` — one failure never stops the others.
2. **Claim:** insert `zap_runs { zap, owner, deliveryId, status: 'running', repoFullName, prNumber }`. Duplicate key (E11000) ⇒ this delivery was already handled ⇒ **skip, no comment**.
3. **Context** (`buildContext`):
   `pr.number`, `pr.title`, `pr.url` (html_url), `pr.author` (user.login), `pr.head` (head.ref), `pr.base` (base.ref), `repo.full_name`, `repo.name`.
4. **Token:** decrypt the Zap owner's GitHub token (`getGithubToken`).
5. **Action:** `renderTemplate(body, context).trim()`; empty ⇒ fail `empty_comment`. Otherwise `POST /repos/{repo}/issues/{prNumber}/comments { body }` (a PR is an issue in GitHub's API). 5xx or network error ⇒ wait 1 s, retry once. 4xx ⇒ final.
6. **Record:** run → `success` (+ `renderedBody`, `commentUrl`) or `failed` (+ `error { code, message, status }`), `durationMs`. Zap → `lastRunAt`, `lastRunStatus`, `lastRunError`.

### Failure codes

| Code | Cause | Extra effect |
| --- | --- | --- |
| `github_reauth_required` | GitHub 401 or no stored token | user `tokenStatus: 'revoked'` |
| `github_forbidden` | GitHub 403/404 (no access, PR/repo gone) | – |
| `github_error` | other GitHub error after the retry | – |
| `empty_comment` | template renders to blank | GitHub not called |
| `internal_error` | anything unexpected | – |

### Business rules

- Comments are posted **as the Zap owner** (their OAuth token), on **the PR that triggered the run**.
- At most one run per (Zap, delivery): GitHub retries and manual "Redeliver" never double-comment.
- Disabled Zaps never reach this step (filtered by the M3 dispatcher).
- No loop risk: the app's own comment is an `issue_comment` event, which the webhook ignores.
- Run history is kept 30 days (TTL index on `createdAt`).

### `zap_runs` collection

`zap` · `owner` · `deliveryId` · `status` (`running|success|failed`) · `repoFullName` · `prNumber` · `renderedBody` · `commentUrl` · `error { code, message, status }` · `durationMs` · timestamps.
Indexes: unique `{ zap, deliveryId }`, `{ zap, createdAt: -1 }`, TTL `{ createdAt }` 30 days.

## Frontend

- Zap list: "Commented 2 minutes ago", or in red "Failed 1 hour ago · <reason>" (from `lastRunError`); **Refresh** button in the page header.
- `Zap` model: + `lastRunError`.

## Tests

- `run-zap.test.ts` — exact comment call and rendered body, duplicate delivery skipped, 5xx retried once, 4xx not retried and recorded on run + Zap, 401 marks token revoked, empty comment fails without calling GitHub, one failure doesn't stop other Zaps.
- `webhooks.test.ts` — `runMatchedZaps` receives the matched Zaps, delivery id and payload; nothing runs for an unknown hook.

## Verify (the demo)

1. Zap On with `Thanks @{{pr.author}} for opening #{{pr.number}}!`.
2. Open a PR → comment appears within seconds with your login and PR number; list shows "Commented just now".
3. GitHub → Settings → Webhooks → Recent Deliveries → Redeliver → no second comment (log: "Delivery already handled").
4. Zap Off → new PR → no comment.
5. Edit the comment, On → new PR → new text.
