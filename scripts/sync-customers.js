#!/usr/bin/env node
/**
 * Sync Customers from ServiceTitan
 * Fetches customer records with contact info
 * 
 * Usage: node scripts/sync-customers.js [--days=30]
 */

import { supabase, config, log, stRequest, logSync, exitWithCode } from './_base.js';

const TENANT_ID = config.serviceTitan.tenantId;

// Parse command line args
const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const DAYS_BACK = daysArg ? parseInt(daysArg.split('=')[1]) : 30;

async function syncCustomers() {
  log(`Fetching customers modified in last ${DAYS_BACK} days...`);
  
  const modifiedOnOrAfter = new Date();
  modifiedOnOrAfter.setDate(modifiedOnOrAfter.getDate() - DAYS_BACK);
  
  let page = 1;
  let total = 0;
  let created = 0;
  let updated = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/crm/v2/tenant/${TENANT_ID}/customers?page=${page}&pageSize=100&modifiedOnOrAfter=${modifiedOnOrAfter.toISOString()}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    for (const customer of data.data) {
      // Check if exists
      const { data: existing } = await supabase
        .from('raw_st_customers')
        .select('st_id')
        .eq('st_id', customer.id)
        .single();
      
      const record = {
        st_id: customer.id,
        name: customer.name,
        first_name: customer.contacts?.[0]?.firstName,
        last_name: customer.contacts?.[0]?.lastName,
        email: customer.contacts?.[0]?.email,
        phone: customer.contacts?.[0]?.phoneNumber,
        address_line1: customer.address?.street,
        city: customer.address?.city,
        state: customer.address?.state,
        zip: customer.address?.zip,
        active: customer.active,
        st_created_on: customer.createdOn,
        st_modified_on: customer.modifiedOn,
        full_data: customer,
        fetched_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from('raw_st_customers')
        .upsert(record, { onConflict: 'st_id' });
      
      if (error) {
        log(`Customer ${customer.id} error: ${error.message}`, 'warn');
      } else {
        total++;
        if (existing) updated++;
        else created++;
      }
    }
    
    log(`Page ${page}: processed ${data.data.length} customers`);
    
    if (!data.hasMore) break;
    page++;
    
    // Rate limit: 250ms between requests
    await new Promise(r => setTimeout(r, 250));
  }
  
  return { total, created, updated };
}

async function main() {
  log('=== Customer Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = await syncCustomers();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('customer-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== Customer Sync Complete (${duration}s) ===`);
    log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('customer-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
