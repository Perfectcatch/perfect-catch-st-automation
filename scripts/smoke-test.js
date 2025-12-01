#!/usr/bin/env node

/**
 * Smoke Test Script
 * Tests all endpoints against a running server
 * 
 * Usage: npm run smoke
 * Or:    node scripts/smoke-test.js [baseUrl]
 */

const BASE_URL = process.argv[2] || 'http://localhost:3001';

const tests = [
  { name: 'Health: /ping', method: 'GET', path: '/ping' },
  { name: 'Health: /health', method: 'GET', path: '/health' },
  { name: 'Health: /status', method: 'GET', path: '/status' },
  { name: 'Jobs: /jobs', method: 'GET', path: '/jobs?page=1&pageSize=5' },
  { name: 'Customers: /customers', method: 'GET', path: '/customers?page=1&pageSize=5' },
  { name: 'Contacts: /customers/contacts', method: 'GET', path: '/customers/contacts?page=1&pageSize=5' },
  { name: 'Estimates: /estimates', method: 'GET', path: '/estimates?page=1&pageSize=5' },
  { name: 'Opportunities: /opportunities', method: 'GET', path: '/opportunities?page=1&pageSize=5' },
];

async function runTest(test) {
  const url = `${BASE_URL}${test.path}`;
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: test.method,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const duration = Date.now() - start;
    const data = await response.json();
    const isJson = typeof data === 'object';

    return {
      name: test.name,
      status: response.status,
      duration: `${duration}ms`,
      success: response.ok && isJson,
      dataKeys: isJson ? Object.keys(data) : null,
      error: response.ok ? null : data.error?.message || 'Unknown error',
    };
  } catch (error) {
    return {
      name: test.name,
      status: 'ERROR',
      duration: `${Date.now() - start}ms`,
      success: false,
      error: error.message,
    };
  }
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Perfect Catch ST Automation - Smoke Tests                ║
╠════════════════════════════════════════════════════════════╣
║   Target: ${BASE_URL.padEnd(47)}║
║   Tests:  ${tests.length.toString().padEnd(47)}║
╚════════════════════════════════════════════════════════════╝
`);

  console.log('Running tests...\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    const result = await runTest(test);

    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   Status: ${result.status} | Duration: ${result.duration}`);

    if (result.success) {
      console.log(`   Response keys: ${result.dataKeys?.join(', ') || 'N/A'}`);
      passed++;
    } else {
      console.log(`   Error: ${result.error}`);
      failed++;
    }

    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed out of ${tests.length} tests`);
  console.log('═'.repeat(60));

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
