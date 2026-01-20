#!/usr/bin/env node
/**
 * Sync Jobs from ServiceTitan
 * Fetches job records with appointments and technicians
 * 
 * Usage: node scripts/sync-jobs.js [--days=14]
 */

import { supabase, config, log, stRequest, logSync, exitWithCode } from './_base.js';

const TENANT_ID = config.serviceTitan.tenantId;

// Parse command line args
const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const DAYS_BACK = daysArg ? parseInt(daysArg.split('=')[1]) : 14;

async function syncJobs() {
  log(`Fetching jobs modified in last ${DAYS_BACK} days...`);
  
  const modifiedOnOrAfter = new Date();
  modifiedOnOrAfter.setDate(modifiedOnOrAfter.getDate() - DAYS_BACK);
  
  let page = 1;
  let total = 0;
  let created = 0;
  let updated = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/jpm/v2/tenant/${TENANT_ID}/jobs?page=${page}&pageSize=100&modifiedOnOrAfter=${modifiedOnOrAfter.toISOString()}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    for (const job of data.data) {
      // Check if exists
      const { data: existing } = await supabase
        .from('raw_st_jobs')
        .select('st_id')
        .eq('st_id', job.id)
        .single();
      
      const record = {
        st_id: job.id,
        job_number: job.number,
        customer_id: job.customerId,
        location_id: job.locationId,
        business_unit_id: job.businessUnitId,
        job_type_id: job.jobTypeId,
        status: job.jobStatus,
        summary: job.summary,
        total: job.total,
        st_created_on: job.createdOn,
        st_modified_on: job.modifiedOn,
        completed_on: job.completedOn,
        full_data: job,
        fetched_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from('raw_st_jobs')
        .upsert(record, { onConflict: 'st_id' });
      
      if (error) {
        log(`Job ${job.id} error: ${error.message}`, 'warn');
      } else {
        total++;
        if (existing) updated++;
        else created++;
      }
    }
    
    log(`Page ${page}: processed ${data.data.length} jobs`);
    
    if (!data.hasMore) break;
    page++;
    
    // Rate limit: 250ms between requests
    await new Promise(r => setTimeout(r, 250));
  }
  
  return { total, created, updated };
}

async function main() {
  log('=== Job Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = await syncJobs();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('job-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== Job Sync Complete (${duration}s) ===`);
    log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('job-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
