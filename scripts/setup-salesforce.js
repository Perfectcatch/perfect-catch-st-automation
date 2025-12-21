#!/usr/bin/env node
/**
 * Salesforce Integration Setup Script
 * 
 * Verifies configuration and tests connectivity.
 * 
 * Usage:
 *   node scripts/setup-salesforce.js
 */

import 'dotenv/config';

console.log('='.repeat(60));
console.log('Salesforce Integration Setup');
console.log('='.repeat(60));
console.log();

// Check required environment variables
const required = [
  'SALESFORCE_CLIENT_ID',
  'SALESFORCE_CLIENT_SECRET',
];

const optional = [
  'SALESFORCE_REDIRECT_URI',
  'SALESFORCE_LOGIN_URL',
  'SALESFORCE_API_VERSION',
  'SALESFORCE_SYNC_ENABLED',
  'REDIS_URL',
];

console.log('Checking configuration...\n');

let hasErrors = false;

// Check required vars
console.log('Required Environment Variables:');
for (const key of required) {
  const value = process.env[key];
  if (value) {
    const masked = value.substring(0, 8) + '...' + value.substring(value.length - 4);
    console.log(`  ✓ ${key}: ${masked}`);
  } else {
    console.log(`  ✗ ${key}: NOT SET`);
    hasErrors = true;
  }
}

console.log('\nOptional Environment Variables:');
for (const key of optional) {
  const value = process.env[key];
  if (value) {
    console.log(`  ✓ ${key}: ${value}`);
  } else {
    console.log(`  - ${key}: using default`);
  }
}

console.log();

if (hasErrors) {
  console.log('❌ Configuration incomplete. Please set the required environment variables.');
  console.log('\nAdd to your .env file:');
  console.log('  SALESFORCE_CLIENT_ID=your_consumer_key');
  console.log('  SALESFORCE_CLIENT_SECRET=your_consumer_secret');
  process.exit(1);
}

// Test Redis connection
console.log('Testing Redis connection...');
try {
  const { redis, checkRedisHealth } = await import('../src/db/redis.js');
  const healthy = await checkRedisHealth();
  if (healthy) {
    console.log('  ✓ Redis connected');
  } else {
    console.log('  ✗ Redis not responding');
    hasErrors = true;
  }
  await redis.quit();
} catch (error) {
  console.log(`  ✗ Redis error: ${error.message}`);
  hasErrors = true;
}

console.log();

if (hasErrors) {
  console.log('❌ Setup incomplete. Please fix the errors above.');
  process.exit(1);
}

console.log('✅ Configuration verified!');
console.log();
console.log('Next steps:');
console.log('  1. Start the server: npm run dev');
console.log('  2. Connect to Salesforce: http://localhost:3001/api/salesforce/auth');
console.log('  3. Check status: http://localhost:3001/api/salesforce/status');
console.log();
console.log('API Endpoints:');
console.log('  GET  /api/salesforce/auth      - Start OAuth flow');
console.log('  GET  /api/salesforce/callback  - OAuth callback');
console.log('  GET  /api/salesforce/status    - Connection status');
console.log('  GET  /api/salesforce/config    - View configuration');
console.log('  POST /api/salesforce/disconnect - Disconnect');
console.log('  POST /api/salesforce/sync/customer  - Sync single customer');
console.log('  POST /api/salesforce/sync/customers - Batch sync');
console.log('  GET  /api/salesforce/query?q=SOQL  - Query Salesforce');
console.log();

process.exit(0);
