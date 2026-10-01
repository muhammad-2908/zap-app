import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const app = buildApp();

describe('CORS', () => {
  it('allows FRONTEND_URL with credentials', async () => {
    const res = await request(app).get('/api/catalog').set('Origin', 'http://localhost:4200');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('answers the preflight for an allowed origin', async () => {
    const res = await request(app)
      .options('/api/zaps')
      .set('Origin', 'http://localhost:4200')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('PATCH');
  });

  it('gives no CORS headers to other origins', async () => {
    const res = await request(app).get('/api/catalog').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('leaves requests without an Origin alone', async () => {
    const res = await request(app).get('/api/catalog');
    expect(res.status).toBe(401); // reaches the route (auth required), not blocked by CORS
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
