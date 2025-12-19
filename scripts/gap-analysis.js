#!/usr/bin/env node
/**
 * Gap Analysis Script
 * Compares ServiceTitan API data with local database
 * Identifies missing records for backfill
 */

import 'dotenv/config';
import pg from 'pg';
import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import { createLogger } from '../src/lib/logger.js';

const { Pool } = pg;
const logger = createLogger('gap-analysis');

const tenantId = config.serviceTitan.tenantId;
const baseUrl = config.serviceTitan.apiBaseUrl;

// Database connection - use localhost for host execution
let connectionString = config.database?.url || process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
if (connectionString && connectionString.includes('@postgres:5432')) {
  connectionString = connectionString.replace('@postgres:5432', '@localhost:6432');
}
const pool = new Pool({ connectionString, max: 5 });

/**
 * Fetch all IDs from ServiceTitan API for a given endpoint
 */
async function fetchAllSTIds(endpoint, entityName) {
  const ids = new Set();
  let page = 1;
  let hasMore = true;
  
  console.log(`  Fetching ${entityName} from ServiceTitan...`);
  
  while (hasMore) {
    const url = `${endpoint}&page=${page}&pageSize=200`;
    const response = await stRequest(url);
    
    if (!response.ok || !response.data?.data) {
      console.log(`  Warning: Failed to fetch page ${page} for ${entityName}`);
      break;
    }
    
    for (const item of response.data.data) {
      ids.add(Number(item.id));
    }
    
    hasMore = response.data.hasMore;
    page++;
    
    if (page % 5 === 0) {
      console.log(`    ... fetched ${ids.size} ${entityName} so far (page ${page})`);
    }
  }
  
  console.log(`  Total ${entityName} in ST: ${ids.size}`);
  return ids;
}

/**
 * Fetch all IDs from local database
 */
async function fetchLocalIds(tableName, dateColumn, since) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT st_id FROM ${tableName} 
      WHERE ${dateColumn} >= $1
    `, [since]);
    
    const ids = new Set(result.rows.map(r => Number(r.st_id)));
    console.log(`  Total ${tableName} in DB (since ${since.toISOString().split('T')[0]}): ${ids.size}`);
    return ids;
  } finally {
    client.release();
  }
}

/**
 * Find missing IDs (in ST but not in DB)
 */
function findMissingIds(stIds, dbIds) {
  const missing = [];
  for (const id of stIds) {
    if (!dbIds.has(id)) {
      missing.push(id);
    }
  }
  return missing;
}

/**
 * Run gap analysis for all entities
 */
async function runGapAnalysis(daysBack = 30) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceISO = since.toISOString();
  
  console.log('');
  console.log('='.repeat(70));
  console.log('  GAP ANALYSIS: ServiceTitan vs Local Database');
  console.log('='.repeat(70));
  console.log(`  Date range: Last ${daysBack} days (since ${sinceISO.split('T')[0]})`);
  console.log('='.repeat(70));
  console.log('');
  
  const results = {};
  
  // Jobs
  console.log('📋 JOBS');
  const jobsEndpoint = `${baseUrl}/jpm/v2/tenant/${tenantId}/jobs?createdOnOrAfter=${sinceISO}`;
  const stJobIds = await fetchAllSTIds(jobsEndpoint, 'jobs');
  const dbJobIds = await fetchLocalIds('st_jobs', 'st_created_on', since);
  const missingJobs = findMissingIds(stJobIds, dbJobIds);
  results.jobs = { stCount: stJobIds.size, dbCount: dbJobIds.size, missing: missingJobs };
  console.log(`  ❌ Missing in DB: ${missingJobs.length}`);
  console.log('');
  
  // Estimates
  console.log('📝 ESTIMATES');
  const estimatesEndpoint = `${baseUrl}/sales/v2/tenant/${tenantId}/estimates?createdOnOrAfter=${sinceISO}`;
  const stEstimateIds = await fetchAllSTIds(estimatesEndpoint, 'estimates');
  const dbEstimateIds = await fetchLocalIds('st_estimates', 'st_created_on', since);
  const missingEstimates = findMissingIds(stEstimateIds, dbEstimateIds);
  results.estimates = { stCount: stEstimateIds.size, dbCount: dbEstimateIds.size, missing: missingEstimates };
  console.log(`  ❌ Missing in DB: ${missingEstimates.length}`);
  console.log('');
  
  // Appointments
  console.log('📅 APPOINTMENTS');
  const appointmentsEndpoint = `${baseUrl}/jpm/v2/tenant/${tenantId}/appointments?createdOnOrAfter=${sinceISO}`;
  const stAppointmentIds = await fetchAllSTIds(appointmentsEndpoint, 'appointments');
  const dbAppointmentIds = await fetchLocalIds('st_appointments', 'st_created_on', since);
  const missingAppointments = findMissingIds(stAppointmentIds, dbAppointmentIds);
  results.appointments = { stCount: stAppointmentIds.size, dbCount: dbAppointmentIds.size, missing: missingAppointments };
  console.log(`  ❌ Missing in DB: ${missingAppointments.length}`);
  console.log('');
  
  // Customers
  console.log('👥 CUSTOMERS');
  const customersEndpoint = `${baseUrl}/crm/v2/tenant/${tenantId}/customers?createdOnOrAfter=${sinceISO}`;
  const stCustomerIds = await fetchAllSTIds(customersEndpoint, 'customers');
  const dbCustomerIds = await fetchLocalIds('st_customers', 'st_created_on', since);
  const missingCustomers = findMissingIds(stCustomerIds, dbCustomerIds);
  results.customers = { stCount: stCustomerIds.size, dbCount: dbCustomerIds.size, missing: missingCustomers };
  console.log(`  ❌ Missing in DB: ${missingCustomers.length}`);
  console.log('');
  
  // Invoices
  console.log('💰 INVOICES');
  const invoicesEndpoint = `${baseUrl}/accounting/v2/tenant/${tenantId}/invoices?createdOnOrAfter=${sinceISO}`;
  const stInvoiceIds = await fetchAllSTIds(invoicesEndpoint, 'invoices');
  const dbInvoiceIds = await fetchLocalIds('st_invoices', 'st_created_on', since);
  const missingInvoices = findMissingIds(stInvoiceIds, dbInvoiceIds);
  results.invoices = { stCount: stInvoiceIds.size, dbCount: dbInvoiceIds.size, missing: missingInvoices };
  console.log(`  ❌ Missing in DB: ${missingInvoices.length}`);
  console.log('');
  
  // Summary
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log('  Entity       | In ST  | In DB  | Missing | Status');
  console.log('  -------------|--------|--------|---------|--------');
  
  for (const [entity, data] of Object.entries(results)) {
    const status = data.missing.length === 0 ? '✅ OK' : '⚠️ GAPS';
    console.log(`  ${entity.padEnd(12)} | ${String(data.stCount).padStart(6)} | ${String(data.dbCount).padStart(6)} | ${String(data.missing.length).padStart(7)} | ${status}`);
  }
  
  console.log('');
  
  // Return results for potential backfill
  await pool.end();
  return results;
}

// Run if called directly
const daysBack = parseInt(process.argv[2]) || 30;
runGapAnalysis(daysBack)
  .then(results => {
    const totalMissing = Object.values(results).reduce((sum, r) => sum + r.missing.length, 0);
    if (totalMissing > 0) {
      console.log(`\n⚠️ Total missing records: ${totalMissing}`);
      console.log('Run backfill with: npm run sync:backfill');
    } else {
      console.log('\n✅ All records are synced!');
    }
    process.exit(0);
  })
  .catch(err => {
    console.error('Gap analysis failed:', err);
    process.exit(1);
  });

export { runGapAnalysis };
