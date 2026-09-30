# M2 — Zap builder

**Goal:** a signed-in user can create, list, edit and turn Zaps on/off, with a real repository picked from GitHub. Nothing runs yet (webhooks: M3, comment: M4).
**Stories:** US-2.1, 2.2, 3.1–3.4, 3.6, 3.7, 4.1.

## Core idea: the catalog drives everything

`backend/src/catalog/catalog.ts` is the single source of truth for apps, triggers, actions, fields and template variables. The UI renders from it (`GET /api/catalog`), the API validates against it, and the Copilot (M6) will be prompted with it.

| App | Available | Trigger | Action |
| --- | --- | --- | --- |
| GitHub | yes | `pull_request.opened` (config: `repoFullName`) | `pull_request.comment` (field: `body`, template) |
| GitLab, Bitbucket, Jira, Slack, Linear | no ("Coming soon") | display only | display only |

Template variables for PR opened: `pr.author`, `pr.number`, `pr.title`, `pr.url`, `pr.head`, `pr.base`, `repo.full_name`, `repo.name` (each with a sample value for previews).

## Backend (`backend/zapapp/src`)

| File | Responsibility |
| --- | --- |
| `catalog/catalog.ts` | Catalog data + `findApp/findTrigger/findAction`, `triggerKey()` |
| `catalog/validate-zap.ts` | `findZapIssues(zap)` → every problem with its field path; `assertValidZap` → 400 |
| `lib/template.ts` | `extractVariables`, `renderTemplate` (`{{path}}` only, own keys only, no eval) |
| `models/zap.model.ts` | `zaps` collection + indexes; `trigger.key` set in pre-validate |
| `modules/zaps/zaps.schema.ts` | zod: `CreateZapSchema` (strict, `enabled` default false), `UpdateZapSchema` (partial, non-empty) |
| `modules/zaps/zaps.service.ts` | `listZaps`, `getZap`, `createZap`, `updateZap` — all owner-scoped |
| `modules/zaps/zaps.routes.ts` | `/api/zaps` (all behind `requireAuth`) |
| `modules/catalog/catalog.routes.ts` | `GET /api/catalog` |
| `modules/github/github.service.ts` | `listAdminRepos` (60 s per-user cache), `withUserToken` (GitHub 401 → reauth) |
| `modules/github/github.routes.ts` | `GET /api/github/repos[?fresh=1]` |
| `modules/users/users.service.ts` | + `getGithubToken` (decrypts), `markGithubTokenRevoked` |

### Create / edit flow

1. `requireAuth` → `req.user`.
2. zod parses the body. `.strict()` rejects unknown keys, so a client can never send `owner`, `source`, `lastRun*`.
3. **Create:** `assertValidZap(input)` → `ZapModel.create({ ...input, owner: req.user.id, source: 'manual' })` → 201.
4. **Edit:** load `{ _id, owner }` → merge patch over the stored Zap (`trigger`/`action` replace as a whole) → `assertValidZap(merged)` (validates the *result*, e.g. a trigger change must still provide the variables the comment uses) → save.
5. Hook points left for M3: install the repo webhook when a Zap is saved with `enabled: true`.

### Validation rules (`findZapIssues`)

- Trigger/action app must exist **and** be available; event/action must exist in that app.
- Every required field non-blank; `maxLength` respected (comment ≤ 65 536); no unknown field keys.
- `repo` fields match `owner/name`.
- `template` fields may only use variables the selected trigger provides.
- Name 1–100 chars (zod). Error body: `400 validation_error` with `details: [{ path, message }]`, paths like `trigger.config.repoFullName`, `action.fields.body`, `name`.

### Ownership (US-3.6)

Every query includes `owner`. Another user's Zap id, a missing id and a malformed id all return **404 `zap_not_found`** (no existence leak; malformed ids never reach Mongo).

### Repository list

`GET https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member` with the user's decrypted token → keep `permissions.admin` (webhooks need admin) → `{ fullName, name, owner, private, htmlUrl, updatedAt }`. Cached 60 s per user; `?fresh=1` bypasses. GitHub 401 → user `tokenStatus: 'revoked'` → `401 github_reauth_required`. Other GitHub errors → `502 github_error`. Known limit: first 100 repos.

### `zaps` collection

`owner` · `name` · `enabled` (default false) · `trigger { app, event, key, config }` · `action { app, type, fields }` · `source` (`manual|copilot`) · `lastRunAt` · `lastRunStatus` (`success|failed|null`) · timestamps.
Indexes: `{ owner, updatedAt: -1 }` (list), `{ enabled, trigger.key, trigger.config.repoFullName, owner }` (dispatch in M3).

## Frontend (`frontend/zap-app/src/app`)

| File | Responsibility |
| --- | --- |
| `core/api/catalog-api.ts` | Catalog, fetched once per session (`shareReplay`) + lookup helpers |
| `core/api/zaps-api.ts`, `github-api.ts` | HTTP clients |
| `core/api/api-errors.ts` | `apiErrorMessage`, `apiIssues` (field errors from 400) |
| `core/template.ts` | Same variable syntax as the backend, for previews and client validation |
| `core/ui/toast-*.ts` | Success/error toasts |
| `features/zaps/zap-list-page.*` | List, optimistic on/off toggle, empty/loading/error states, API/DB status line |
| `features/zaps/zap-builder-page.*` | Create (`/zaps/new`) and edit (`/zaps/:id`) |
| `features/zaps/components/app-picker.ts` | App grid; unavailable apps disabled with "Coming soon" |
| `features/zaps/components/template-field.ts` | Comment textarea, variable chips (insert at cursor), live preview with sample data |
| `features/zaps/components/status-toggle.ts` | Accessible on/off switch |
| `core/http/auth-interceptor.ts` | + `github_reauth_required` → `/login?error=reauth` |

### Builder flow

1. Load catalog (+ the Zap when editing) and repos in parallel. Edit of a missing/foreign Zap → "Zap not found".
2. New Zap: GitHub pre-selected for trigger and action; an app with a single trigger/action selects it automatically; comment starts from the field's `defaultValue`; Zap starts **Off**.
3. Picking a trigger/action **rebuilds** its field group from the catalog (`rebuild()`), keeping values that still apply. Validators come from the field definition: required (trimmed), maxLength, and for templates "only variables of the selected trigger".
4. Save: client validation first; then POST or PATCH (full input). Server `details[].path` are applied to the matching control via `form.get(path)`; unmatched messages show in a form-level alert.
5. Success → toast → `/zaps`.

### List flow

Load Zaps + catalog → summaries like `GitHub · Pull request opened · owner/repo → GitHub · Comment on pull request` and "Never run" / "Ran 5 minutes ago". Toggle is optimistic: flip, `PATCH { enabled }`, revert + error toast on failure.

## Tests

- Backend: `validate-zap.test.ts` (catalog rules), `template.test.ts` (extract/render, prototype safety), `zaps.test.ts` (auth, owner-scoped queries, 404s, strict body, create defaults, toggle, merged validation, catalog), `github-repos.test.ts` (admin filter, cache, 401 → reauth, 502).
- Frontend: `app-picker.spec.ts`, `template.spec.ts`, `zap-builder-page.spec.ts` (defaults, client validation, POST body, server error mapping, navigation).

## Verify

Picker shows GitHub + 5 disabled apps · create "Thank PR authors" on `you/zap-test` (Off) → appears in list · edit name/comment persists after refresh · toggle On/Off persists · empty comment blocked (and API returns 400) · second account sees an empty list and gets 404 on the first user's Zap id.
