#!/usr/bin/env node
/**
 * Sync All ServiceTitan Customers to Salesforce
 *
 * This script fetches all customers from the local database and syncs them
 * to Salesforce as Contacts and Accounts.
 *
 * Usage: node scripts/sync-customers-to-salesforce.js [--limit N] [--offset N] [--dry-run]
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { batchSyncCustomersToSalesforce, getSalesforceStatus } from '../src/integrations/salesforce/index.js';

dotenv.config();

const { Pool } = pg;

// Parse command line arguments
const args = process.argv.slice(2);
const limitArg = args.find(a => a.startsWith('--limit='));
const offsetArg = args.find(a => a.startsWith('--offset='));
const dryRun = args.includes('--dry-run');
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
const offset = offsetArg ? parseInt(offsetArg.split('=')[1], 10) : 0;

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 6432,
  database: 'perfectcatch_automation',
  user: 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Catchadmin@2025',
});

async function fetchCustomers() {
  console.log('\n📊 Fetching customers from database...');

  let query = `
    SELECT
      st_id,
      tenant_id,
      name,
      first_name,
      last_name,
      email,
      phone,
      type,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      postal_code,
      country,
      balance,
      active,
      do_not_service,
      do_not_mail,
      total_jobs,
      completed_jobs,
      lifetime_value,
      first_job_date,
      last_job_date,
      st_modified_on
    FROM servicetitan.st_customers
    ORDER BY st_modified_on DESC
  `;

  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  if (offset) {
    query += ` OFFSET ${offset}`;
  }

  const result = await pool.query(query);
  console.log(`   Found ${result.rows.length} customers`);
  return result.rows;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('   SALESFORCE CUSTOMER SYNC');
  console.log('═══════════════════════════════════════════════════════════');

  if (dryRun) {
    console.log('🔸 DRY RUN MODE - No changes will be made to Salesforce');
  }

  try {
    // Check Salesforce connection
    console.log('\n🔌 Checking Salesforce connection...');
    const status = await getSalesforceStatus();

    if (!status.connected) {
      console.error('❌ Salesforce is not connected!');
      console.error('   Please authenticate first: http://localhost:3001/api/salesforce/auth');
      process.exit(1);
    }

    console.log(`   ✅ Connected to: ${status.instanceUrl}`);
    console.log(`   📈 API calls remaining: ${status.limits?.dailyApiRequests?.remaining?.toLocaleString() || 'unknown'}`);

    // Fetch customers
    const customers = await fetchCustomers();

    if (customers.length === 0) {
      console.log('\n⚠️  No customers to sync');
      process.exit(0);
    }

    // Calculate estimated API calls (2 per customer: Account + Contact)
    const estimatedCalls = customers.length * 2;
    console.log(`\n📝 Sync Plan:`);
    console.log(`   • Customers to sync: ${customers.length}`);
    console.log(`   • Estimated API calls: ${estimatedCalls}`);
    console.log(`   • API calls available: ${status.limits?.dailyApiRequests?.remaining?.toLocaleString() || 'unknown'}`);

    if (dryRun) {
      console.log('\n🔸 DRY RUN - Showing first 5 customers that would be synced:');
      customers.slice(0, 5).forEach((c, i) => {
        console.log(`   ${i + 1}. ${c.name} (ST ID: ${c.st_id}) - $${c.lifetime_value || 0} LTV`);
      });
      console.log('\n✅ Dry run complete. Run without --dry-run to sync.');
      process.exit(0);
    }

    // Sync to Salesforce
    console.log('\n🚀 Starting Salesforce sync...');
    console.log('   This may take a few minutes...\n');

    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;
    const batchSize = 50;

    for (let i = 0; i < customers.length; i += batchSize) {
      const batch = customers.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(customers.length / batchSize);

      process.stdout.write(`   Batch ${batchNum}/${totalBatches} (${batch.length} customers)... `);

      const result = await batchSyncCustomersToSalesforce(batch);

      successCount += result.summary.successful;
      failCount += result.summary.failed;

      console.log(`✅ ${result.summary.successful} synced, ${result.summary.failed} failed`);

      // Log any errors
      const errors = result.results.filter(r => !r.success);
      if (errors.length > 0) {
        errors.slice(0, 3).forEach(e => {
          console.log(`      ⚠️  ST ID ${e.stId}: ${e.error}`);
        });
        if (errors.length > 3) {
          console.log(`      ... and ${errors.length - 3} more errors`);
        }
      }

      // Small delay between batches to avoid rate limits
      if (i + batchSize < customers.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const duration = Math.round((Date.now() - startTime) / 1000);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('   SYNC COMPLETE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   ✅ Successfully synced: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   ⏱️  Duration: ${duration} seconds`);
    console.log(`   📊 Rate: ${(customers.length / duration).toFixed(1)} customers/sec`);

    // Check remaining API calls
    const finalStatus = await getSalesforceStatus();
    console.log(`   📈 API calls remaining: ${finalStatus.limits?.dailyApiRequests?.remaining?.toLocaleString() || 'unknown'}`);

  } catch (error) {
    console.error('\n❌ Sync failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
