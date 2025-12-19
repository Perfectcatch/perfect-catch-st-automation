#!/usr/bin/env node

/**
 * Run Initial Full Sync
 * One-time script to populate database with ServiceTitan data
 * Usage: node scripts/run-initial-sync.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { runFullSync, getSyncStatus } from '../src/services/sync/sync-orchestrator.js';
import { createLogger } from '../src/lib/logger.js';

const logger = createLogger('initial-sync');

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  INITIAL SERVICETITAN SYNC');
  console.log('='.repeat(60));
  console.log('');
  console.log('This will sync ALL data from ServiceTitan to your local database.');
  console.log('Estimated time: 10-30 minutes depending on data volume.');
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  const startTime = Date.now();

  try {
    logger.info('Starting initial sync...');
    const result = await runFullSync();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log('='.repeat(60));
    console.log('  ✅ SYNC COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('');
    console.log('Summary:');
    console.log(`  Duration: ${duration}s`);
    console.log('');
    
    if (result.stats.reference) {
      console.log('  Reference Data:');
      console.log(`    - Business Units: ${result.stats.reference.businessUnits?.created || 0} created`);
      console.log(`    - Technicians: ${result.stats.reference.technicians?.created || 0} created`);
      console.log(`    - Job Types: ${result.stats.reference.jobTypes?.created || 0} created`);
      console.log(`    - Campaigns: ${result.stats.reference.campaigns?.created || 0} created`);
      console.log('');
    }

    console.log('  Transactional Data:');
    console.log(`    - Customers: ${result.stats.customers?.created || 0} created, ${result.stats.customers?.updated || 0} updated`);
    console.log(`    - Jobs: ${result.stats.jobs?.created || 0} created, ${result.stats.jobs?.updated || 0} updated`);
    console.log(`    - Estimates: ${result.stats.estimates?.created || 0} created, ${result.stats.estimates?.updated || 0} updated`);
    console.log(`    - Appointments: ${result.stats.appointments?.created || 0} created, ${result.stats.appointments?.updated || 0} updated`);
    console.log(`    - Invoices: ${result.stats.invoices?.created || 0} created, ${result.stats.invoices?.updated || 0} updated`);
    console.log('');
    console.log('='.repeat(60));
    console.log('');
    console.log('Next steps:');
    console.log('  1. Verify data in database');
    console.log('  2. Start incremental sync: npm run worker:sync');
    console.log('  3. Start workflow engine: npm run worker:workflows');
    console.log('');
    console.log('Verification commands:');
    console.log('  psql -d perfectcatch_automation -c "SELECT COUNT(*) FROM st_customers;"');
    console.log('  psql -d perfectcatch_automation -c "SELECT COUNT(*) FROM st_jobs;"');
    console.log('  psql -d perfectcatch_automation -c "SELECT * FROM st_sync_log ORDER BY started_at DESC LIMIT 5;"');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('  ❌ SYNC FAILED');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Error: ${error.message}`);
    console.log('');
    
    if (error.stack) {
      console.log('Stack trace:');
      console.log(error.stack);
    }
    
    console.log('');
    console.log('Troubleshooting:');
    console.log('  1. Check ServiceTitan credentials in .env');
    console.log('  2. Verify database connection');
    console.log('  3. Check network connectivity');
    console.log('  4. Review logs for more details');
    console.log('');

    process.exit(1);
  }
}

main();
