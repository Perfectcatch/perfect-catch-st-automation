#!/usr/bin/env node
/**
 * Backfill Missing Records Script
 * Fetches and syncs specific missing records from ServiceTitan
 */

import 'dotenv/config';
import pg from 'pg';
import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import { createLogger } from '../src/lib/logger.js';

const { Pool } = pg;
const logger = createLogger('backfill');

const tenantId = config.serviceTitan.tenantId;
const baseUrl = config.serviceTitan.apiBaseUrl;

// Database connection - use localhost for host execution
let connectionString = config.database?.url || process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
if (connectionString && connectionString.includes('@postgres:5432')) {
  connectionString = connectionString.replace('@postgres:5432', '@localhost:6432');
}
const pool = new Pool({ connectionString, max: 5 });

/**
 * Fetch all IDs from ServiceTitan API
 */
async function fetchAllSTIds(endpoint, entityName) {
  const ids = new Set();
  let page = 1;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${endpoint}&page=${page}&pageSize=200`;
    const response = await stRequest(url);
    
    if (!response.ok || !response.data?.data) break;
    
    for (const item of response.data.data) {
      ids.add(Number(item.id));
    }
    
    hasMore = response.data.hasMore;
    page++;
  }
  
  return ids;
}

/**
 * Fetch local IDs from database
 */
async function fetchLocalIds(tableName, dateColumn, since) {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      SELECT st_id FROM ${tableName} 
      WHERE ${dateColumn} >= $1
    `, [since]);
    return new Set(result.rows.map(r => Number(r.st_id)));
  } finally {
    client.release();
  }
}

/**
 * Backfill estimates
 */
async function backfillEstimates(missingIds) {
  if (missingIds.length === 0) return { synced: 0, failed: 0 };
  
  console.log(`\n📝 Backfilling ${missingIds.length} estimates...`);
  
  const client = await pool.connect();
  let synced = 0;
  let failed = 0;
  
  try {
    for (const id of missingIds) {
      try {
        // Fetch estimate details
        const url = `${baseUrl}/sales/v2/tenant/${tenantId}/estimates/${id}`;
        const response = await stRequest(url);
        
        if (!response.ok || !response.data) {
          console.log(`  ⚠️ Failed to fetch estimate ${id}`);
          failed++;
          continue;
        }
        
        const estimate = response.data;
        
        // Skip estimates without required fields
        if (!estimate.jobId) {
          console.log(`  ⚠️ Skipping estimate ${id} - no jobId (standalone estimate)`);
          failed++;
          continue;
        }
        if (!estimate.customerId) {
          console.log(`  ⚠️ Skipping estimate ${id} - no customerId`);
          failed++;
          continue;
        }
        
        // Upsert to database
        await client.query(`
          INSERT INTO st_estimates (
            st_id, tenant_id, job_id, customer_id, location_id,
            estimate_number, name, status,
            subtotal, total, sold_by_id, sold_on,
            st_created_on, st_modified_on, full_data, local_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            status = EXCLUDED.status,
            subtotal = EXCLUDED.subtotal,
            total = EXCLUDED.total,
            sold_on = EXCLUDED.sold_on,
            st_modified_on = EXCLUDED.st_modified_on,
            full_data = EXCLUDED.full_data,
            local_synced_at = NOW()
        `, [
          estimate.id,
          tenantId,
          estimate.jobId,
          estimate.customerId,
          estimate.locationId,
          estimate.number || String(estimate.id),
          estimate.name,
          estimate.status,
          estimate.subTotal || 0,
          estimate.total || 0,
          estimate.soldById,
          estimate.soldOn ? new Date(estimate.soldOn) : null,
          estimate.createdOn ? new Date(estimate.createdOn) : null,
          estimate.modifiedOn ? new Date(estimate.modifiedOn) : null,
          JSON.stringify(estimate)
        ]);
        
        synced++;
        console.log(`  ✅ Synced estimate ${id}`);
        
      } catch (err) {
        console.log(`  ❌ Error syncing estimate ${id}: ${err.message}`);
        failed++;
      }
    }
  } finally {
    client.release();
  }
  
  return { synced, failed };
}

/**
 * Backfill invoices
 */
async function backfillInvoices(missingIds) {
  if (missingIds.length === 0) return { synced: 0, failed: 0 };
  
  console.log(`\n💰 Backfilling ${missingIds.length} invoices...`);
  
  const client = await pool.connect();
  let synced = 0;
  let failed = 0;
  
  try {
    // Fetch invoices in batches using the list endpoint with IDs filter
    const batchSize = 50;
    for (let i = 0; i < missingIds.length; i += batchSize) {
      const batch = missingIds.slice(i, i + batchSize);
      const idsParam = batch.join(',');
      
      // Use list endpoint with ids filter
      const url = `${baseUrl}/accounting/v2/tenant/${tenantId}/invoices?ids=${idsParam}&pageSize=50`;
      const response = await stRequest(url);
      
      if (!response.ok || !response.data?.data) {
        console.log(`  ⚠️ Failed to fetch invoice batch`);
        failed += batch.length;
        continue;
      }
      
      for (const invoice of response.data.data) {
        try {
          await upsertInvoice(client, invoice);
          synced++;
          console.log(`  ✅ Synced invoice ${invoice.id}`);
        } catch (err) {
          console.log(`  ❌ Error syncing invoice ${invoice.id}: ${err.message}`);
          failed++;
        }
      }
      
      // Mark any IDs that weren't returned as failed (deleted in ST)
      const returnedIds = new Set(response.data.data.map(inv => inv.id));
      for (const id of batch) {
        if (!returnedIds.has(id)) {
          console.log(`  ⚠️ Invoice ${id} not found in ST (may be deleted)`);
          failed++;
        }
      }
    }
  } finally {
    client.release();
  }
  
  return { synced, failed };
}

async function upsertInvoice(client, invoice) {
  // Extract IDs from nested objects (ST API returns nested objects, not flat IDs)
  const jobId = invoice.jobId || invoice.job?.id;
  const customerId = invoice.customerId || invoice.customer?.id;
  const businessUnitId = invoice.businessUnitId || invoice.businessUnit?.id;
  const locationId = invoice.locationId || invoice.location?.id;
  const invoiceNumber = invoice.number || invoice.referenceNumber || String(invoice.id);
  
  // Skip invoices without required fields
  if (!jobId || !customerId || !businessUnitId) {
    throw new Error(`Missing required fields: jobId=${jobId}, customerId=${customerId}, businessUnitId=${businessUnitId}`);
  }
  
  await client.query(`
    INSERT INTO st_invoices (
      st_id, tenant_id, job_id, customer_id, location_id, business_unit_id,
      invoice_number, status,
      subtotal, total, balance,
      due_date, invoice_date,
      st_created_on, st_modified_on, full_data, local_synced_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
    ON CONFLICT (st_id) DO UPDATE SET
      status = EXCLUDED.status,
      total = EXCLUDED.total,
      balance = EXCLUDED.balance,
      st_modified_on = EXCLUDED.st_modified_on,
      full_data = EXCLUDED.full_data,
      local_synced_at = NOW()
  `, [
    invoice.id,
    tenantId,
    jobId,
    customerId,
    locationId,
    businessUnitId,
    invoiceNumber,
    invoice.status || invoice.syncStatus || 'Unknown',
    invoice.subTotal || 0,
    invoice.total || 0,
    invoice.balance || 0,
    invoice.dueDate ? new Date(invoice.dueDate) : null,
    invoice.invoiceDate ? new Date(invoice.invoiceDate) : null,
    invoice.createdOn ? new Date(invoice.createdOn) : null,
    invoice.modifiedOn ? new Date(invoice.modifiedOn) : null,
    JSON.stringify(invoice)
  ]);
}

/**
 * OLD Backfill invoices - individual fetch (kept for reference)
 */
async function backfillInvoicesOld(missingIds) {
  if (missingIds.length === 0) return { synced: 0, failed: 0 };
  
  console.log(`\n💰 Backfilling ${missingIds.length} invoices...`);
  
  const client = await pool.connect();
  let synced = 0;
  let failed = 0;
  
  try {
    for (const id of missingIds) {
      try {
        // Fetch invoice details
        const url = `${baseUrl}/accounting/v2/tenant/${tenantId}/invoices/${id}`;
        const response = await stRequest(url);
        
        if (!response.ok || !response.data) {
          console.log(`  ⚠️ Failed to fetch invoice ${id}`);
          failed++;
          continue;
        }
        
        const invoice = response.data;
        
        // Upsert to database
        await client.query(`
          INSERT INTO st_invoices (
            st_id, tenant_id, job_id, customer_id, location_id,
            invoice_number, status, summary,
            subtotal, total, balance,
            due_date, created_by_id,
            st_created_on, st_modified_on, full_data, local_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT (st_id) DO UPDATE SET
            status = EXCLUDED.status,
            total = EXCLUDED.total,
            balance = EXCLUDED.balance,
            st_modified_on = EXCLUDED.st_modified_on,
            full_data = EXCLUDED.full_data,
            local_synced_at = NOW()
        `, [
          invoice.id,
          tenantId,
          invoice.jobId,
          invoice.customerId,
          invoice.locationId,
          invoice.number || invoice.id,
          invoice.status,
          invoice.summary,
          invoice.subTotal || 0,
          invoice.total || 0,
          invoice.balance || 0,
          invoice.dueDate ? new Date(invoice.dueDate) : null,
          invoice.createdById,
          invoice.createdOn ? new Date(invoice.createdOn) : null,
          invoice.modifiedOn ? new Date(invoice.modifiedOn) : null,
          JSON.stringify(invoice)
        ]);
        
        synced++;
        console.log(`  ✅ Synced invoice ${id}`);
        
      } catch (err) {
        console.log(`  ❌ Error syncing invoice ${id}: ${err.message}`);
        failed++;
      }
    }
  } finally {
    client.release();
  }
  
  return { synced, failed };
}

/**
 * Run backfill for all entities
 */
async function runBackfill(daysBack = 30) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceISO = since.toISOString();
  
  console.log('');
  console.log('='.repeat(70));
  console.log('  BACKFILL: Syncing Missing Records');
  console.log('='.repeat(70));
  console.log(`  Date range: Last ${daysBack} days (since ${sinceISO.split('T')[0]})`);
  console.log('='.repeat(70));
  
  const results = {};
  
  // Find and backfill missing estimates
  console.log('\n📝 Checking estimates...');
  const estimatesEndpoint = `${baseUrl}/sales/v2/tenant/${tenantId}/estimates?createdOnOrAfter=${sinceISO}`;
  const stEstimateIds = await fetchAllSTIds(estimatesEndpoint, 'estimates');
  const dbEstimateIds = await fetchLocalIds('st_estimates', 'st_created_on', since);
  const missingEstimates = [...stEstimateIds].filter(id => !dbEstimateIds.has(id));
  console.log(`  Found ${missingEstimates.length} missing estimates`);
  results.estimates = await backfillEstimates(missingEstimates);
  
  // Find and backfill missing invoices
  console.log('\n💰 Checking invoices...');
  const invoicesEndpoint = `${baseUrl}/accounting/v2/tenant/${tenantId}/invoices?createdOnOrAfter=${sinceISO}`;
  const stInvoiceIds = await fetchAllSTIds(invoicesEndpoint, 'invoices');
  const dbInvoiceIds = await fetchLocalIds('st_invoices', 'st_created_on', since);
  const missingInvoices = [...stInvoiceIds].filter(id => !dbInvoiceIds.has(id));
  console.log(`  Found ${missingInvoices.length} missing invoices`);
  results.invoices = await backfillInvoices(missingInvoices);
  
  // Summary
  console.log('');
  console.log('='.repeat(70));
  console.log('  BACKFILL SUMMARY');
  console.log('='.repeat(70));
  console.log('');
  console.log('  Entity       | Synced | Failed');
  console.log('  -------------|--------|--------');
  
  let totalSynced = 0;
  let totalFailed = 0;
  
  for (const [entity, data] of Object.entries(results)) {
    console.log(`  ${entity.padEnd(12)} | ${String(data.synced).padStart(6)} | ${String(data.failed).padStart(6)}`);
    totalSynced += data.synced;
    totalFailed += data.failed;
  }
  
  console.log('  -------------|--------|--------');
  console.log(`  TOTAL        | ${String(totalSynced).padStart(6)} | ${String(totalFailed).padStart(6)}`);
  console.log('');
  
  await pool.end();
  return results;
}

// Run if called directly
const daysBack = parseInt(process.argv[2]) || 30;
runBackfill(daysBack)
  .then(() => {
    console.log('✅ Backfill complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });

export { runBackfill };
