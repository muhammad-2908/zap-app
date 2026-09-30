# M5 — Hardening, run history, delete, README

**Goal:** the repo is safe to hand over and runnable by someone else; users can see past runs and delete Zaps.
**Stories:** US-7.1, 7.2, 7.3, 5.3, 3.5.

## Backend (`backend/zapapp/src`)

| File | Change |
| --- | --- |
| `modules/zaps/zaps.service.ts` | + `deleteZap`, `listRuns`; `updateZap` cleans up the old repo's hook when a Zap moves repo |
| `modules/zaps/zaps.routes.ts` | + `DELETE /api/zaps/:id`, `GET /api/zaps/:id/runs` |
| `modules/hooks/hooks.service.ts` | + `removeHookIfUnused(userId, repo)` |
| `app.ts` | `Cache-Control: no-store` on `/api` (catalog keeps its own cache header) |
| `vitest.config.ts` / `vitest.integration.config.ts` | Unit suite excludes `tests/integration`; separate integration config (long hook timeout, no file parallelism) |
| `tests/integration/end-to-end.test.ts` | Real MongoDB via mongodb-memory-server |

### Delete flow

1. `findOwned` (owner-scoped; foreign/missing/malformed id → 404).
2. Delete the Zap's runs (`zap_runs.deleteMany({ zap })`), then the Zap. Decision: history goes with the Zap.
3. `removeHookIfUnused(owner, repo)`.

### Hook cleanup (`removeHookIfUnused`)

Runs after a delete and after a Zap moves to another repo.

1. Any Zap of this owner (on or off) still on the repo → keep the hook, stop.
2. Otherwise `DELETE /repos/{repo}/hooks/{hookId}` (GitHub 404 = already gone = fine), then delete the `repo_hooks` record.
3. Best effort: GitHub failures are logged, never fail the user's request. A leftover hook is harmless (its deliveries match no Zap; enabling again adopts it).

Turning a Zap **off** still leaves the hook (cheap to keep, avoids churn on toggle).

### Run history (`GET /api/zaps/:id/runs`)

Owner check first, then the 20 newest runs: `status`, `repoFullName`, `prNumber`, `prUrl` (built from repo + number), `commentUrl`, `renderedBody`, `error { code, message }`, `durationMs`, `createdAt`.

## Frontend (`frontend/zap-app/src/app`)

| File | Change |
| --- | --- |
| `features/zaps/zap-runs-page.*` | `/zaps/:id/runs`: success shows the posted comment + link; failure shows the reason; empty/not-found/error states |
| `features/zaps/zap-builder-page.*` | Edit mode: **Delete** with inline two-step confirm, **Run history** link |
| `features/zaps/zap-list-page.html` | **History** button per Zap |
| `core/api/zaps-api.ts`, `core/models.ts` | `remove`, `runs`, `ZapRun` |
| `styles.scss` | Danger buttons, themed link color |

## Security checklist (US-7.3)

| Item | Where |
| --- | --- |
| Secrets only in `.env` (ignored), placeholders in `.env.example` | root `.gitignore` |
| GitHub token AES-256-GCM, `select: false`, never in responses/logs | `lib/crypto.ts`, `models/user.model.ts`, `lib/logger.ts` |
| httpOnly + SameSite=Lax session cookie, Secure in production, JWT issuer/audience/expiry | `lib/session.ts` |
| OAuth state, constant-time compare | `modules/auth/auth.routes.ts` |
| Webhook HMAC on raw body, constant-time, before DB | `lib/webhook-signature.ts`, `webhooks.routes.ts` |
| Owner-scoped queries, strict bodies, 404 for foreign ids | `zaps.service.ts`, `zaps.schema.ts` |
| helmet, 100 kb JSON limit, no-store, redacted logs | `app.ts`, `lib/logger.ts` |

## Tests

- Unit (`npm test`, 83): + delete with runs and hook cleanup, foreign delete 404, repo move cleanup, runs listing, no-store header, `removeHookIfUnused` (in use / removed / already gone / GitHub error).
- Integration (`npm run test:integration`, real MongoDB, GitHub faked):
  - two users: B can't list/get/patch/delete/see runs of A's Zap;
  - two enabled Zaps → one hook; PR opened → two comments with rendered text, as the owner; redelivery → no new comment (unique index); one Zap off → only the other comments; run history shows both runs;
  - deleting the last Zap on a repo deletes the hook on GitHub and the record;
  - GitHub refusing the hook → 422 and nothing saved.
- Frontend (`npm test`, 20): + run history rendering and not-found, delete needs two clicks then navigates.

## Verify

1. `npm test` (backend, frontend) and `npm run test:integration` (backend; first run downloads `mongod`).
2. Zap list → **History** shows the PRs from M4 with comment links.
3. Edit a Zap → **Delete** → **Yes, delete** → gone from the list. When it was the last Zap on the repo, the webhook disappears from `zap-test` → Settings → Webhooks.
4. Fresh clone into a new folder, follow only the README, repeat the main flow.
5. `git log -p | findstr /i "CLIENT_SECRET= JWT_SECRET= mongodb+srv"` shows placeholders only.
