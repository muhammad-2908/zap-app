# Zap App

A small workflow automation app inspired by Zapier's Zaps: sign in with GitHub, build a Zap
(**pull request opened → comment on that pull request**), and a real PR triggers it.

TypeScript throughout on the MEAN stack: MongoDB, Express 5, Angular 21, Node.js.

> Status: **M0 — skeleton**. Sign-in, the Zap builder and the GitHub automation arrive in later milestones.

## Time log

| Milestone | Started | Finished |
| --- | --- | --- |
| M0 Skeleton | _fill in_ | _fill in_ |

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

   Fill in `MONGODB_URI` (keep `/zap-app` as the database name). The other variables are used from M1 onward.

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

Errors always use `{ "error": { "code", "message", "details?" } }`.

## Configuration errors

The API validates its environment at startup and refuses to start with a clear message: a missing
`MONGODB_URI`, a `<placeholder>` left from `.env.example`, a wrong database password, an unknown
cluster host, or an Atlas IP allowlist that blocks your machine.
