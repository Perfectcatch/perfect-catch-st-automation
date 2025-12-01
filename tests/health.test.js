/**
 * Health Endpoints Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// Set env vars before importing app
process.env.NODE_ENV = 'test';
process.env.SERVICE_TITAN_TENANT_ID = 'test-tenant';
process.env.SERVICE_TITAN_CLIENT_ID = 'test-client';
process.env.SERVICE_TITAN_CLIENT_SECRET = 'test-secret';
process.env.SERVICE_TITAN_APP_KEY = 'test-key';

// Import app after setting env vars
const { default: app } = await import('../src/app.js');

describe('Health Endpoints', () => {
  describe('GET /ping', () => {
    it('should return running message', async () => {
      const response = await request(app).get('/ping');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('msg');
      expect(response.body.msg).toBe('ServiceTitan MCP API is running');
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      // Health returns 200 when healthy, 503 when degraded (no token)
      expect([200, 503]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(['healthy', 'degraded']).toContain(response.body.status);
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('components');
    });
  });

  describe('GET /status', () => {
    it('should return detailed status', async () => {
      const response = await request(app).get('/status');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('memory');
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown-route');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });
});
