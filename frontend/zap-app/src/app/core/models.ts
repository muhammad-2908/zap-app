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
  error: { code: string; message: string; details?: unknown };
}
