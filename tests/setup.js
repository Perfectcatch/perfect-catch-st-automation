/**
 * Test Setup
 * Common test configuration and utilities
 */

import { vi, beforeAll, afterAll, beforeEach } from 'vitest';

// Set test environment
process.env.NODE_ENV = 'test';
process.env.SERVICE_TITAN_TENANT_ID = 'test-tenant-id';
process.env.SERVICE_TITAN_CLIENT_ID = 'test-client-id';
process.env.SERVICE_TITAN_CLIENT_SECRET = 'test-client-secret';
process.env.SERVICE_TITAN_APP_KEY = 'test-app-key';
process.env.PORT = '3099';

// Mock fetch globally for unit tests
export const mockFetch = vi.fn();

beforeAll(() => {
  // Setup before all tests
});

afterAll(() => {
  // Cleanup after all tests
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

export { vi };
