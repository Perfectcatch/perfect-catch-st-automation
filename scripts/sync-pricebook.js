#!/usr/bin/env node
/**
 * Sync Pricebook from ServiceTitan
 * Fetches materials, services, equipment, and categories
 * 
 * Usage: node scripts/sync-pricebook.js
 */

import { supabase, config, log, stRequest, logSync, exitWithCode } from './_base.js';

const TENANT_ID = config.serviceTitan.tenantId;

async function syncCategories() {
  log('Fetching pricebook categories...');
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', `/pricebook/v2/tenant/${TENANT_ID}/categories?page=${page}&pageSize=100`);
    
    if (!data.data || data.data.length === 0) break;
    
    for (const cat of data.data) {
      const { error } = await supabase.from('raw_pricebook_categories').upsert({
        st_id: cat.id,
        name: cat.name,
        code: cat.code,
        parent_id: cat.parentId,
        active: cat.active,
        full_data: cat,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Category ${cat.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    if (!data.hasMore) break;
    page++;
  }
  
  log(`Synced ${total} categories`);
  return total;
}

async function syncMaterials() {
  log('Fetching pricebook materials...');
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', `/pricebook/v2/tenant/${TENANT_ID}/materials?page=${page}&pageSize=100`);
    
    if (!data.data || data.data.length === 0) break;
    
    for (const item of data.data) {
      const { error } = await supabase.from('raw_pricebook_materials').upsert({
        st_id: item.id,
        code: item.code,
        name: item.displayName,
        description: item.description,
        price: item.price,
        cost: item.cost,
        active: item.active,
        category_id: item.categories?.[0]?.id,
        full_data: item,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Material ${item.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    if (!data.hasMore) break;
    page++;
  }
  
  log(`Synced ${total} materials`);
  return total;
}

async function syncServices() {
  log('Fetching pricebook services...');
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', `/pricebook/v2/tenant/${TENANT_ID}/services?page=${page}&pageSize=100`);
    
    if (!data.data || data.data.length === 0) break;
    
    for (const item of data.data) {
      const { error } = await supabase.from('raw_pricebook_services').upsert({
        st_id: item.id,
        code: item.code,
        name: item.displayName,
        description: item.description,
        price: item.price,
        duration_hours: item.durationHours,
        active: item.active,
        category_id: item.categories?.[0]?.id,
        full_data: item,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Service ${item.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    if (!data.hasMore) break;
    page++;
  }
  
  log(`Synced ${total} services`);
  return total;
}

async function syncEquipment() {
  log('Fetching pricebook equipment...');
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', `/pricebook/v2/tenant/${TENANT_ID}/equipment?page=${page}&pageSize=100`);
    
    if (!data.data || data.data.length === 0) break;
    
    for (const item of data.data) {
      const { error } = await supabase.from('raw_pricebook_equipment').upsert({
        st_id: item.id,
        code: item.code,
        name: item.displayName,
        description: item.description,
        price: item.price,
        cost: item.cost,
        active: item.active,
        category_id: item.categories?.[0]?.id,
        full_data: item,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Equipment ${item.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    if (!data.hasMore) break;
    page++;
  }
  
  log(`Synced ${total} equipment`);
  return total;
}

async function main() {
  log('=== Pricebook Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = {
      categories: await syncCategories(),
      materials: await syncMaterials(),
      services: await syncServices(),
      equipment: await syncEquipment(),
    };
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('pricebook-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== Pricebook Sync Complete (${duration}s) ===`);
    log(`Categories: ${stats.categories}, Materials: ${stats.materials}, Services: ${stats.services}, Equipment: ${stats.equipment}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('pricebook-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
