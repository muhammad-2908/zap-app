/** Shape returned by GET /api/health (200 when healthy, 503 when degraded). */
export interface Health {
  status: 'ok' | 'degraded';
  db: 'connected' | 'connecting' | 'disconnected' | 'disconnecting';
  uptimeSeconds: number;
}

/** Error body every API route uses. */
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}
