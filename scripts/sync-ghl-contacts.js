#!/usr/bin/env node
/**
 * Sync Contacts FROM GoHighLevel
 * Pulls contacts from GHL and stores in local database
 * 
 * Usage: node scripts/sync-ghl-contacts.js
 */

import { supabase, config, log, ghlClient, logSync, exitWithCode } from './_base.js';

const LOCATION_ID = config.ghl.locationId;

async function syncContacts() {
  log('Fetching contacts from GHL...');
  
  let total = 0;
  let created = 0;
  let updated = 0;
  let nextPageUrl = null;
  
  do {
    const url = nextPageUrl || `/contacts/?locationId=${LOCATION_ID}&limit=100`;
    const response = await ghlClient.get(url);
    const { contacts, meta } = response.data;
    
    if (!contacts || contacts.length === 0) break;
    
    for (const contact of contacts) {
      // Check if exists
      const { data: existing } = await supabase
        .from('ghl_contacts')
        .select('id')
        .eq('ghl_id', contact.id)
        .single();
      
      const record = {
        ghl_id: contact.id,
        location_id: contact.locationId,
        first_name: contact.firstName,
        last_name: contact.lastName,
        name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        email: contact.email,
        phone: contact.phone,
        address: contact.address1,
        city: contact.city,
        state: contact.state,
        postal_code: contact.postalCode,
        tags: contact.tags,
        source: contact.source,
        st_customer_id: contact.customFields?.find(f => f.key === 'st_customer_id')?.value,
        full_data: contact,
        fetched_at: new Date().toISOString(),
      };
      
      const { error } = await supabase
        .from('ghl_contacts')
        .upsert(record, { onConflict: 'ghl_id' });
      
      if (error) {
        log(`Contact ${contact.id} error: ${error.message}`, 'warn');
      } else {
        total++;
        if (existing) updated++;
        else created++;
      }
    }
    
    log(`Processed ${contacts.length} contacts (total: ${total})`);
    
    nextPageUrl = meta?.nextPageUrl;
    
    // Rate limit: 250ms between requests
    await new Promise(r => setTimeout(r, 250));
    
  } while (nextPageUrl);
  
  return { total, created, updated };
}

async function main() {
  log('=== GHL Contact Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = await syncContacts();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('ghl-contact-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== GHL Contact Sync Complete (${duration}s) ===`);
    log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('ghl-contact-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
