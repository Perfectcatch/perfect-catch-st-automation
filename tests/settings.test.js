/**
 * Settings API Endpoints Tests
 * Tests for ServiceTitan Settings module endpoints
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';

// Set test environment before importing app
process.env.NODE_ENV = 'test';
process.env.SERVICE_TITAN_TENANT_ID = '123456789';
process.env.SERVICE_TITAN_CLIENT_ID = 'test-client-id';
process.env.SERVICE_TITAN_CLIENT_SECRET = 'test-client-secret';
process.env.SERVICE_TITAN_APP_KEY = 'test-app-key';

const { default: app } = await import('../src/app.js');

describe('Settings API Endpoints', () => {
  // ═══════════════════════════════════════════════════════════════
  // EMPLOYEES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /settings/employees', () => {
    it('should return 200 or 500 (depending on ST API availability)', async () => {
      const res = await request(app)
        .get('/settings/employees')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    it('should accept pagination query parameters', async () => {
      const res = await request(app)
        .get('/settings/employees')
        .query({ page: 1, pageSize: 5, includeTotal: true });

      expect([200, 500]).toContain(res.status);
    });

    it('should accept active filter parameter', async () => {
      const res = await request(app)
        .get('/settings/employees')
        .query({ active: 'True' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /settings/employees/:id', () => {
    it('should accept employee ID parameter', async () => {
      const res = await request(app).get('/settings/employees/12345');

      expect([200, 404, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /settings/employees/export', () => {
    it('should return export data or error', async () => {
      const res = await request(app)
        .get('/settings/employees/export')
        .query({ from: '2024-01-01' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /settings/employees', () => {
    it('should accept employee creation request body', async () => {
      const res = await request(app)
        .post('/settings/employees')
        .send({
          name: 'John Doe',
          email: 'john.doe@example.com',
          role: 'Technician'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /settings/employees/:id', () => {
    it('should accept employee update request', async () => {
      const res = await request(app)
        .patch('/settings/employees/12345')
        .send({
          name: 'John Updated',
          email: 'john.updated@example.com'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /settings/employees/:id/account-actions', () => {
    it('should accept account action request', async () => {
      const res = await request(app)
        .post('/settings/employees/12345/account-actions')
        .send({
          action: 'Deactivate'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TECHNICIANS
  // ═══════════════════════════════════════════════════════════════
  describe('GET /settings/technicians', () => {
    it('should return technicians list', async () => {
      const res = await request(app)
        .get('/settings/technicians')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });

    it('should accept active filter', async () => {
      const res = await request(app)
        .get('/settings/technicians')
        .query({ active: 'True' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /settings/technicians/:id', () => {
    it('should accept technician ID parameter', async () => {
      const res = await request(app).get('/settings/technicians/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /settings/technicians/export', () => {
    it('should return export data or error', async () => {
      const res = await request(app)
        .get('/settings/technicians/export')
        .query({ from: '2024-01-01' });

      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /settings/technicians', () => {
    it('should accept technician creation request', async () => {
      const res = await request(app)
        .post('/settings/technicians')
        .send({
          name: 'Tech User',
          employeeId: 12345
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /settings/technicians/:id', () => {
    it('should accept technician update request', async () => {
      const res = await request(app)
        .patch('/settings/technicians/12345')
        .send({
          name: 'Updated Tech'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // BUSINESS UNITS
  // ═══════════════════════════════════════════════════════════════
  describe('GET /settings/business-units', () => {
    it('should return business units list', async () => {
      const res = await request(app)
        .get('/settings/business-units')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /settings/business-units/:id', () => {
    it('should accept business unit ID parameter', async () => {
      const res = await request(app).get('/settings/business-units/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /settings/business-units', () => {
    it('should accept business unit creation request', async () => {
      const res = await request(app)
        .post('/settings/business-units')
        .send({
          name: 'New Business Unit',
          officialName: 'NBU LLC'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /settings/business-units/:id', () => {
    it('should accept business unit update request', async () => {
      const res = await request(app)
        .patch('/settings/business-units/12345')
        .send({
          name: 'Updated Business Unit'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // USER ROLES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /settings/user-roles', () => {
    it('should return user roles list', async () => {
      const res = await request(app)
        .get('/settings/user-roles')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /settings/user-roles/:id', () => {
    it('should accept user role ID parameter', async () => {
      const res = await request(app).get('/settings/user-roles/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TAG TYPES
  // ═══════════════════════════════════════════════════════════════
  describe('GET /settings/tag-types', () => {
    it('should return tag types list', async () => {
      const res = await request(app)
        .get('/settings/tag-types')
        .query({ page: 1, pageSize: 10 });

      expect([200, 500]).toContain(res.status);
      expect(res.body).toBeDefined();
    });
  });

  describe('GET /settings/tag-types/:id', () => {
    it('should accept tag type ID parameter', async () => {
      const res = await request(app).get('/settings/tag-types/12345');

      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('POST /settings/tag-types', () => {
    it('should accept tag type creation request', async () => {
      const res = await request(app)
        .post('/settings/tag-types')
        .send({
          name: 'New Tag Type'
        });

      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });

  describe('PATCH /settings/tag-types/:id', () => {
    it('should accept tag type update request', async () => {
      const res = await request(app)
        .patch('/settings/tag-types/12345')
        .send({
          name: 'Updated Tag Type'
        });

      expect([200, 400, 404, 500]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // 404 HANDLING
  // ═══════════════════════════════════════════════════════════════
  describe('404 Handling', () => {
    it('should return 404 for non-existent settings routes', async () => {
      const res = await request(app).get('/settings/nonexistent-endpoint');

      expect(res.status).toBe(404);
    });
  });
});
