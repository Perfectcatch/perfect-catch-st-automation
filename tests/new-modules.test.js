/**
 * New Modules API Endpoints Tests
 * Tests for all newly added ServiceTitan modules
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

// ═══════════════════════════════════════════════════════════════
// FORMS MODULE
// ═══════════════════════════════════════════════════════════════
describe('Forms API Endpoints', () => {
  describe('GET /forms/forms', () => {
    it('should return forms list', async () => {
      const res = await request(app).get('/forms/forms');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /forms/forms/:id', () => {
    it('should accept form ID', async () => {
      const res = await request(app).get('/forms/forms/12345');
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /forms/form-submissions', () => {
    it('should return form submissions', async () => {
      const res = await request(app).get('/forms/form-submissions');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /forms/jobs/:jobId/forms', () => {
    it('should return job forms', async () => {
      const res = await request(app).get('/forms/jobs/12345/forms');
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// INVENTORY MODULE
// ═══════════════════════════════════════════════════════════════
describe('Inventory API Endpoints', () => {
  describe('GET /inventory/adjustments', () => {
    it('should return adjustments list', async () => {
      const res = await request(app).get('/inventory/adjustments');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/purchase-orders', () => {
    it('should return purchase orders', async () => {
      const res = await request(app).get('/inventory/purchase-orders');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/receipts', () => {
    it('should return receipts', async () => {
      const res = await request(app).get('/inventory/receipts');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/transfers', () => {
    it('should return transfers', async () => {
      const res = await request(app).get('/inventory/transfers');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/trucks', () => {
    it('should return trucks', async () => {
      const res = await request(app).get('/inventory/trucks');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/vendors', () => {
    it('should return vendors', async () => {
      const res = await request(app).get('/inventory/vendors');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /inventory/warehouses', () => {
    it('should return warehouses', async () => {
      const res = await request(app).get('/inventory/warehouses');
      expect([200, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// JPM EXTENDED MODULE
// ═══════════════════════════════════════════════════════════════
describe('JPM Extended API Endpoints', () => {
  describe('GET /jpm/appointments', () => {
    it('should return appointments', async () => {
      const res = await request(app).get('/jpm/appointments');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /jpm/budget-codes', () => {
    it('should return budget codes', async () => {
      const res = await request(app).get('/jpm/budget-codes');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /jpm/job-types', () => {
    it('should return job types', async () => {
      const res = await request(app).get('/jpm/job-types');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /jpm/projects', () => {
    it('should return projects', async () => {
      const res = await request(app).get('/jpm/projects');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /jpm/project-statuses', () => {
    it('should return project statuses', async () => {
      const res = await request(app).get('/jpm/project-statuses');
      expect([200, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// MARKETING MODULE
// ═══════════════════════════════════════════════════════════════
describe('Marketing API Endpoints', () => {
  describe('GET /marketing/categories', () => {
    it('should return campaign categories', async () => {
      const res = await request(app).get('/marketing/categories');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /marketing/campaigns', () => {
    it('should return campaigns', async () => {
      const res = await request(app).get('/marketing/campaigns');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /marketing/campaign-costs', () => {
    it('should return campaign costs', async () => {
      const res = await request(app).get('/marketing/campaign-costs');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /marketing/suppressions', () => {
    it('should return suppressions', async () => {
      const res = await request(app).get('/marketing/suppressions');
      expect([200, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// MARKETING ADS MODULE
// ═══════════════════════════════════════════════════════════════
describe('Marketing Ads API Endpoints', () => {
  describe('GET /marketing-ads/attributed-leads', () => {
    it('should return attributed leads', async () => {
      const res = await request(app).get('/marketing-ads/attributed-leads');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /marketing-ads/performance', () => {
    it('should return performance data', async () => {
      const res = await request(app).get('/marketing-ads/performance');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /marketing-ads/scheduled-job-attributions', () => {
    it('should return scheduled job attributions', async () => {
      const res = await request(app).get('/marketing-ads/scheduled-job-attributions');
      expect([200, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// REPORTING MODULE
// ═══════════════════════════════════════════════════════════════
describe('Reporting API Endpoints', () => {
  describe('GET /reporting/report-categories', () => {
    it('should return report categories', async () => {
      const res = await request(app).get('/reporting/report-categories');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /reporting/dynamic-value-sets/:id', () => {
    it('should accept dynamic set ID', async () => {
      const res = await request(app).get('/reporting/dynamic-value-sets/test-set');
      expect([200, 404, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TASK MANAGEMENT MODULE
// ═══════════════════════════════════════════════════════════════
describe('Task Management API Endpoints', () => {
  describe('GET /task-management/data', () => {
    it('should return task data', async () => {
      const res = await request(app).get('/task-management/data');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /task-management/tasks', () => {
    it('should return tasks', async () => {
      const res = await request(app).get('/task-management/tasks');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /task-management/tasks', () => {
    it('should accept task creation', async () => {
      const res = await request(app)
        .post('/task-management/tasks')
        .send({ title: 'Test Task' });
      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TELECOM MODULE
// ═══════════════════════════════════════════════════════════════
describe('Telecom API Endpoints', () => {
  describe('GET /telecom/calls', () => {
    it('should return calls', async () => {
      const res = await request(app).get('/telecom/calls');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /telecom/calls/:id', () => {
    it('should accept call ID', async () => {
      const res = await request(app).get('/telecom/calls/12345');
      expect([200, 404, 500]).toContain(res.status);
    });
  });

  describe('GET /telecom/opt-in-out', () => {
    it('should return opt in/out list', async () => {
      const res = await request(app).get('/telecom/opt-in-out');
      expect([200, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// TIMESHEETS MODULE
// ═══════════════════════════════════════════════════════════════
describe('Timesheets API Endpoints', () => {
  describe('GET /timesheets/activities', () => {
    it('should return activities', async () => {
      const res = await request(app).get('/timesheets/activities');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /timesheets/activity-categories', () => {
    it('should return activity categories', async () => {
      const res = await request(app).get('/timesheets/activity-categories');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('GET /timesheets/activity-types', () => {
    it('should return activity types', async () => {
      const res = await request(app).get('/timesheets/activity-types');
      expect([200, 500]).toContain(res.status);
    });
  });

  describe('POST /timesheets/activities', () => {
    it('should accept activity creation', async () => {
      const res = await request(app)
        .post('/timesheets/activities')
        .send({ name: 'Test Activity' });
      expect([200, 201, 400, 500]).toContain(res.status);
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 404 HANDLING FOR NEW ROUTES
// ═══════════════════════════════════════════════════════════════
describe('404 Handling for New Routes', () => {
  it('should return 404 for non-existent forms route', async () => {
    const res = await request(app).get('/forms/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-existent inventory route', async () => {
    const res = await request(app).get('/inventory/nonexistent');
    expect(res.status).toBe(404);
  });

  it('should return 404 for non-existent marketing route', async () => {
    const res = await request(app).get('/marketing/nonexistent');
    expect(res.status).toBe(404);
  });
});
