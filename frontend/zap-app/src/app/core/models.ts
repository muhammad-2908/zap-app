/** Shape returned by GET /api/health (200 when healthy, 503 when degraded). */
export interface Health {
  status: 'ok' | 'degraded';
  db: 'connected' | 'connecting' | 'disconnected' | 'disconnecting';
  uptimeSeconds: number;
}

/** The signed-in user, from GET /api/auth/me. The GitHub token never reaches the browser. */
export interface User {
  id: string;
  githubId: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  tokenStatus: 'valid' | 'revoked';
}

/** Error body every API route uses. */
export interface ApiError {
  error: { code: string; message: string; details?: ApiIssue[] | unknown };
}

export interface ApiIssue {
  path: string;
  message: string;
}

// ---- Catalog (GET /api/catalog) ----

export type FieldType = 'repo' | 'template' | 'text';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  maxLength?: number;
  defaultValue?: string;
}

export interface VariableDef {
  key: string;
  label: string;
  sample: string;
}

export interface TriggerDef {
  id: string;
  name: string;
  description: string;
  configFields: FieldDef[];
  variables: VariableDef[];
}

export interface ActionDef {
  id: string;
  name: string;
  description: string;
  fields: FieldDef[];
}

export interface CatalogApp {
  id: string;
  name: string;
  description: string;
  available: boolean;
  triggers: TriggerDef[];
  actions: ActionDef[];
}

// ---- Zaps (/api/zaps) ----

export interface ZapInput {
  name: string;
  enabled: boolean;
  trigger: { app: string; event: string; config: Record<string, string> };
  action: { app: string; type: string; fields: Record<string, string> };
}

export interface Zap extends ZapInput {
  id: string;
  source: 'manual' | 'copilot';
  lastRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | null;
  /** Why the last run failed (null after a success). */
  lastRunError: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- GitHub (/api/github/repos) ----

export interface Repo {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  htmlUrl: string;
  updatedAt: string;
}
