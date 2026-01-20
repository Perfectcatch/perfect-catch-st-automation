#!/usr/bin/env node
/**
 * Sync Scheduling Data from ServiceTitan
 * Fetches appointments, technicians, and dispatch info
 * 
 * Usage: node scripts/sync-scheduling.js [--days=7]
 */

import { supabase, config, log, stRequest, logSync, exitWithCode } from './_base.js';

const TENANT_ID = config.serviceTitan.tenantId;

// Parse command line args
const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const DAYS_BACK = daysArg ? parseInt(daysArg.split('=')[1]) : 7;

async function syncTechnicians() {
  log('Fetching technicians...');
  
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/settings/v2/tenant/${TENANT_ID}/technicians?page=${page}&pageSize=100`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    for (const tech of data.data) {
      const { error } = await supabase.from('raw_st_technicians').upsert({
        st_id: tech.id,
        name: tech.name,
        email: tech.email,
        phone: tech.phoneNumber,
        active: tech.active,
        full_data: tech,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Technician ${tech.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    if (!data.hasMore) break;
    page++;
  }
  
  log(`Synced ${total} technicians`);
  return total;
}

async function syncAppointments() {
  log(`Fetching appointments for last ${DAYS_BACK} days...`);
  
  const startsOnOrAfter = new Date();
  startsOnOrAfter.setDate(startsOnOrAfter.getDate() - DAYS_BACK);
  
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/jpm/v2/tenant/${TENANT_ID}/appointments?page=${page}&pageSize=100&startsOnOrAfter=${startsOnOrAfter.toISOString()}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    for (const appt of data.data) {
      const { error } = await supabase.from('raw_st_appointments').upsert({
        st_id: appt.id,
        job_id: appt.jobId,
        start_time: appt.start,
        end_time: appt.end,
        status: appt.status,
        technician_ids: appt.assignedTechnicians?.map(t => t.technicianId) || [],
        full_data: appt,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'st_id' });
      
      if (error) log(`Appointment ${appt.id} error: ${error.message}`, 'warn');
      else total++;
    }
    
    log(`Page ${page}: processed ${data.data.length} appointments`);
    
    if (!data.hasMore) break;
    page++;
    
    // Rate limit
    await new Promise(r => setTimeout(r, 250));
  }
  
  log(`Synced ${total} appointments`);
  return total;
}

async function syncBusinessUnits() {
  log('Fetching business units...');
  
  const data = await stRequest('GET', `/settings/v2/tenant/${TENANT_ID}/business-units`);
  let total = 0;
  
  for (const bu of data.data || []) {
    const { error } = await supabase.from('raw_st_business_units').upsert({
      st_id: bu.id,
      name: bu.name,
      active: bu.active,
      full_data: bu,
      fetched_at: new Date().toISOString(),
    }, { onConflict: 'st_id' });
    
    if (error) log(`Business unit ${bu.id} error: ${error.message}`, 'warn');
    else total++;
  }
  
  log(`Synced ${total} business units`);
  return total;
}

async function main() {
  log('=== Scheduling Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = {
      technicians: await syncTechnicians(),
      appointments: await syncAppointments(),
      businessUnits: await syncBusinessUnits(),
    };
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('scheduling-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== Scheduling Sync Complete (${duration}s) ===`);
    log(`Technicians: ${stats.technicians}, Appointments: ${stats.appointments}, Business Units: ${stats.businessUnits}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('scheduling-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
