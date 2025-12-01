/**
 * ServiceTitan Client Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-fetch before importing stClient
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

// Mock tokenManager
vi.mock('../src/services/tokenManager.js', () => ({
  getAccessToken: vi.fn().mockResolvedValue('mock-token'),
}));

// Set env vars
process.env.NODE_ENV = 'test';
process.env.SERVICE_TITAN_TENANT_ID = 'test-tenant';
process.env.SERVICE_TITAN_CLIENT_ID = 'test-client';
process.env.SERVICE_TITAN_CLIENT_SECRET = 'test-secret';
process.env.SERVICE_TITAN_APP_KEY = 'test-key';

describe('stClient', () => {
  let fetch;
  let stRequest;

  beforeEach(async () => {
    vi.clearAllMocks();
    fetch = (await import('node-fetch')).default;
    stRequest = (await import('../src/services/stClient.js')).stRequest;
  });

  describe('stRequest', () => {
    it('should make GET request with correct headers', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json'),
        },
        json: vi.fn().mockResolvedValue({ data: [] }),
      };
      fetch.mockResolvedValue(mockResponse);

      const result = await stRequest('https://api.servicetitan.io/test');

      expect(fetch).toHaveBeenCalledWith(
        'https://api.servicetitan.io/test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock-token',
            'ST-App-Key': 'test-key',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result.status).toBe(200);
      expect(result.data).toEqual({ data: [] });
    });

    it('should add query parameters to URL', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        headers: {
          get: vi.fn().mockReturnValue('application/json'),
        },
        json: vi.fn().mockResolvedValue({ data: [] }),
      };
      fetch.mockResolvedValue(mockResponse);

      await stRequest('https://api.servicetitan.io/test', {
        query: { page: 1, pageSize: 50 },
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('page=1'),
        expect.any(Object)
      );
    });

    it('should include body for POST requests', async () => {
      const mockResponse = {
        ok: true,
        status: 201,
        headers: {
          get: vi.fn().mockReturnValue('application/json'),
        },
        json: vi.fn().mockResolvedValue({ id: 1 }),
      };
      fetch.mockResolvedValue(mockResponse);

      await stRequest('https://api.servicetitan.io/test', {
        method: 'POST',
        body: { name: 'Test' },
      });

      expect(fetch).toHaveBeenCalledWith(
        'https://api.servicetitan.io/test',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });
  });
});
