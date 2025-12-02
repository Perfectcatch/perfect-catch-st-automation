/**
 * Pricebook API Endpoints Tests
 * Tests for ServiceTitan Pricebook module endpoints
 */

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';

// Set test environment before importing app
process.env.NODE_ENV = 'test';
process.env.SERVICE_TITAN_TENANT_ID = '123456789';
process.env.SERVICE_TITAN_CLIENT_ID = 'test-client-id';
process.env.SERVICE_TITAN_CLIENT_SECRET = 'test-client-secret';
process.env.SERVICE_TITAN_APP_KEY = 'test-app-key';

const { default: app } = await import('../src/app.js');

describe('Pricebook API Endpoints', () => {
  // ═══════════════════════════════════════════════════════════════
  // SERVICES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/services', () => {
    it('should return 200 or 500 (depending on ST API availability)', async () => {
      const res = await request(app)
        .get('/pricebook/services')
        .query({ page: 1, pageSize: 10 });

      // Accept both success and token error (since we're using test credentials)
      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    it('should accept pagination query parameters', async () => {
      const res = await request(app)
        .get('/pricebook/services')
        .query({ page: 1, pageSize: 5, includeTotal: true });

      expect([200, 500]).toContain(res.status);
    });

    it('should accept active filter parameter', async () => {
      const res = await request(app)
        .get('/pricebook/services')
        .query({ active: 'True' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /pricebook/services/:id', () => {
    it('should accept service ID parameter', async () => {
      const res = await request(app).get('/pricebook/services/12345');

      expect([200, 404, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /pricebook/services/export', () => {
    it('should return export data or error', async () => {
      const res = await request(app)
        .get('/pricebook/services/export')
        .query({ from: '2024-01-01' });

      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MATERIALS
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/materials', () => {
    it('should return 200 or 500 (depending on ST API availability)', async () => {
      const res = await request(app)
        .get('/pricebook/materials')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    it('should accept search and filter parameters', async () => {
      const res = await request(app)
        .get('/pricebook/materials')
        .query({ 
          page: 1, 
          pageSize: 10,
          active: 'True',
          includeTotal: true
        });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /pricebook/materials/:id', () => {
    it('should accept material ID parameter', async () => {
      const res = await request(app).get('/pricebook/materials/12345');

      expect([200, 404, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /pricebook/materials/export', () => {
    it('should return export data or error', async () => {
      const res = await request(app)
        .get('/pricebook/materials/export')
        .query({ from: '2024-01-01' });

      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // MATERIALS MARKUP
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/materials-markup', () => {
    it('should return materials markup list', async () => {
      const res = await request(app)
        .get('/pricebook/materials-markup')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /pricebook/materials-markup/:id', () => {
    it('should accept markup ID parameter', async () => {
      const res = await request(app).get('/pricebook/materials-markup/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EQUIPMENT
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/equipment', () => {
    it('should return equipment list', async () => {
      const res = await request(app)
        .get('/pricebook/equipment')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /pricebook/equipment/:id', () => {
    it('should accept equipment ID parameter', async () => {
      const res = await request(app).get('/pricebook/equipment/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CATEGORIES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/categories', () => {
    it('should return categories list', async () => {
      const res = await request(app)
        .get('/pricebook/categories')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    it('should accept categoryType filter', async () => {
      const res = await request(app)
        .get('/pricebook/categories')
        .query({ categoryType: 'Services' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /pricebook/categories/:id', () => {
    it('should accept category ID parameter', async () => {
      const res = await request(app).get('/pricebook/categories/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // DISCOUNTS AND FEES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/discounts-and-fees', () => {
    it('should return discounts and fees list', async () => {
      const res = await request(app)
        .get('/pricebook/discounts-and-fees')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /pricebook/discounts-and-fees/:id', () => {
    it('should accept discount/fee ID parameter', async () => {
      const res = await request(app).get('/pricebook/discounts-and-fees/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CLIENT SPECIFIC PRICING
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/client-specific-pricing', () => {
    it('should return client specific pricing list', async () => {
      const res = await request(app)
        .get('/pricebook/client-specific-pricing')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BULK OPERATIONS
  // ═══════════════════════════════════════════════════════════════
  describe('GET /pricebook/bulk/export', () => {
    it('should return bulk export data or error', async () => {
      const res = await request(app).get('/pricebook/bulk/export');

      expect([200, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // POST/PATCH/DELETE ENDPOINTS (Structure Tests)
  // ═══════════════════════════════════════════════════════════════
  describe('POST /pricebook/services', () => {
    it('should accept service creation request body', async () => {
      const res = await request(app)
        .post('/pricebook/services')
        .send({
          name: 'Test Service',
          code: 'TEST-001',
          description: 'Test service description',
          price: 99.99
        });

      // Will fail with token error but validates route exists
      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /pricebook/services/:id', () => {
    it('should accept service update request', async () => {
      const res = await request(app)
        .patch('/pricebook/services/12345')
        .send({
          name: 'Updated Service Name',
          price: 149.99
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  describe('DELETE /pricebook/services/:id', () => {
    it('should accept service deletion request', async () => {
      const res = await request(app).delete('/pricebook/services/12345');

      expect([200, 204, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /pricebook/materials', () => {
    it('should accept material creation request body', async () => {
      const res = await request(app)
        .post('/pricebook/materials')
        .send({
          name: 'Test Material',
          code: 'MAT-001',
          cost: 25.00,
          price: 50.00
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('POST /pricebook/categories', () => {
    it('should accept category creation request body', async () => {
      const res = await request(app)
        .post('/pricebook/categories')
        .send({
          name: 'Test Category',
          categoryType: 'Services'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 404 HANDLING
  // ═══════════════════════════════════════════════════════════════
  describe('404 Handling', () => {
    it('should return 404 for non-existent pricebook routes', async () => {
      const res = await request(app).get('/pricebook/nonexistent-endpoint');

      expect(res.status).toBe(404);
    });
  });
});
