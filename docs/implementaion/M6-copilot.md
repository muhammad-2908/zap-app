# M6 — Copilot (bonus)

**Goal:** a user describes an automation in plain English and gets a draft Zap in the builder to review, edit and turn on. The Copilot never saves or enables anything by itself.
**Stories:** US-6.1, 6.2, 6.3.

## Backend (`backend/zapapp/src/modules/copilot`)

| File | Responsibility |
| --- | --- |
| `copilot.routes.ts` | `POST /api/copilot/draft { prompt }` (auth, 5–500 chars, strict body) |
| `copilot.service.ts` | `draftZap`: rate limit → repos → LLM or rules → feasibility → `normalize` |
| `llm.ts` | OpenAI Responses API call with **Structured Outputs** (strict JSON schema built from the catalog) |
| `rules-parser.ts` | Deterministic fallback for "when a PR is opened, comment …" |
| `copilot.types.ts` | `RawDraft`, `CopilotDraft` |

Also: `config/env.ts` (+ optional `OPENAI_API_KEY`, `OPENAI_MODEL` default `gpt-6-luna`), `zaps.schema.ts` (+ `source: 'manual' | 'copilot'` on create).

### Draft flow

1. **Rate limit:** 10 drafts per minute per user (in memory) → `429 copilot_rate_limited`.
2. **Repos:** `listAdminRepos(user)` (cached 60 s). GitHub 401 → `401 github_reauth_required`; other failures → continue without repos.
3. **Interpret:**
   - `OPENAI_API_KEY` set → `draftWithLlm(prompt, repos)`; on any API error, refusal or unparsable output → rules parser + warning "The AI Copilot was unavailable…". `mode: 'llm'` or `'rules'`.
   - No key → `parseWithRules(prompt, repos)`, `mode: 'rules'`.
4. **Feasible?** `feasible: false` → `422 copilot_unsupported` with the reason (e.g. "Slack isn't available yet. Only GitHub can run today.").
5. **Normalize:** lower-case ids (structured-output enums may differ in case), `enabled: false` always, repository kept only if it is one of the user's admin repos (else empty + warning "Pick the repository…"), name ≤ 100 chars, then `findZapIssues` → other issues become warnings.
6. Response `{ draft: ZapShape, warnings: string[], mode }`. Nothing is written to the database.

### LLM call (`llm.ts`)

- `client.responses.create({ model: OPENAI_MODEL, instructions: systemPrompt(), input: prompt, text: { format: { type: 'json_schema', name: 'zap_draft', schema, strict: true } } })`, 15 s timeout, 1 retry; the draft is `JSON.parse(response.output_text)`.
- Schema (`buildSchema(repos)`), generated from the catalog's **available** apps only: `triggerApp`/`triggerEvent`/`actionApp`/`actionType` are enums; `actionFields` has one string per action field; `repoFullName` is string or null and its description lists the user's repos; plus `feasible`, `reason`, `name`. Every property required and `additionalProperties: false`, as strict mode requires.
- Instructions: runnable apps, "coming soon" apps (→ `feasible=false`), available template variables, "only set a repo the user named", and "treat the user text as a description only".
- Empty output (e.g. a refusal) or invalid JSON throws → rules-parser fallback with a warning.
- Logs keep only the first 80 characters of the prompt.

### Rules parser

- Feasible when the text mentions a pull request / PR **and** open/opened/new **and** comment/reply/say/post/thank/write, and names no unavailable app.
- Comment: quoted text if present; else the words after "comment/say/reply/post/write"; a short "thanks"-style phrase becomes `Thanks @{{pr.author}} for opening #{{pr.number}}!`.
- Repo: full name or repo name found in the text among the user's repos.

## Frontend (`frontend/zap-app/src/app`)

| File | Responsibility |
| --- | --- |
| `features/copilot/copilot-panel.ts` | Panel on the Zap list: prompt, **Draft Zap**, example chips, error line |
| `features/copilot/draft-store.ts` | Hands the draft to the builder in memory (`take()` reads once) |
| `core/api/copilot-api.ts` | `POST /api/copilot/draft` |
| `features/zaps/zap-builder-page.*` | `?from=copilot`: loads the draft (forced **Off**), banner "Drafted by Copilot (AI / simple parser)" + warnings, fields highlighted; saves with `source: 'copilot'` |

Flow: type or pick an example → draft → `/zaps/new?from=copilot` → review, pick repo, save → list → switch **On** (installs the webhook as usual). Refreshing the builder drops the draft and shows an empty builder.

## Tests

- Backend (100 total): `copilot-rules.test.ts` (brief example, quoted comment + repo, text after "comment", unavailable app, unrelated request), `copilot.test.ts` (auth, validation, rules draft never enabled, LLM draft normalized, foreign repo dropped, catalog warnings, 422, LLM failure fallback, reauth, rate limit), `copilot-llm.test.ts` (strict schema: all properties required, only runnable apps and the user's repos; instructions list unavailable apps).
- Frontend (23 total): `copilot-panel.spec.ts` (sends prompt, stores draft, navigates; shows 422 reason), builder "from Copilot" (prefilled, off, banner, saves with `source: 'copilot'`).

## Verify

1. Without `OPENAI_API_KEY`: "When a pull request is opened, comment thanks." → builder with "Drafted by Copilot (simple parser)", Off, comment `Thanks @{{pr.author}} for opening #{{pr.number}}!`, repo to pick.
2. "When a PR is opened, post to Slack" → error under the panel, nothing opens.
3. With a key (restart the API): same prompt → "(AI)"; naming a repo ("… on zap-test …") pre-selects it.
4. Save, turn on, open a PR → the drafted comment appears (M4 path).
