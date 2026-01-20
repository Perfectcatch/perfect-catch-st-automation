#!/usr/bin/env node
/**
 * Sync Opportunities FROM GoHighLevel
 * Pulls opportunities from GHL pipelines and stores in local database
 * 
 * Usage: node scripts/sync-ghl-opportunities.js
 */

import { supabase, config, log, ghlClient, logSync, exitWithCode } from './_base.js';

const LOCATION_ID = config.ghl.locationId;

// Pipeline IDs (from GHL)
const PIPELINES = {
  SALES_PIPELINE: 'fWJfnMsPzwOXgKdWxdjC',
  LEAD_NURTURE: 'wSZFCaTL4sD8WGVjjgbr',
  REVIEWS_REFERRALS: 'ONnbxgt47h3zcd1wkM6M',
  SERVICE: 'xcoyzWHzUxOwzzvEPkMD',
};

async function syncOpportunities() {
  log('Fetching opportunities from GHL...');
  
  let total = 0;
  let created = 0;
  let updated = 0;
  
  // Sync from each pipeline
  for (const [pipelineName, pipelineId] of Object.entries(PIPELINES)) {
    log(`Syncing pipeline: ${pipelineName}`);
    
    let nextPageUrl = null;
    
    do {
      const url = nextPageUrl || `/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&limit=100`;
      const response = await ghlClient.get(url);
      const { opportunities, meta } = response.data;
      
      if (!opportunities || opportunities.length === 0) break;
      
      for (const opp of opportunities) {
        // Check if exists
        const { data: existing } = await supabase
          .from('ghl_opportunities')
          .select('id')
          .eq('ghl_id', opp.id)
          .single();
        
        const record = {
          ghl_id: opp.id,
          location_id: opp.locationId,
          contact_id: opp.contactId,
          pipeline_id: opp.pipelineId,
          pipeline_stage_id: opp.pipelineStageId,
          name: opp.name,
          status: opp.status,
          monetary_value: opp.monetaryValue,
          source: opp.source,
          st_job_id: opp.customFields?.find(f => f.key === 'st_job_id')?.value,
          st_estimate_id: opp.customFields?.find(f => f.key === 'st_estimate_id')?.value,
          full_data: opp,
          fetched_at: new Date().toISOString(),
        };
        
        const { error } = await supabase
          .from('ghl_opportunities')
          .upsert(record, { onConflict: 'ghl_id' });
        
        if (error) {
          log(`Opportunity ${opp.id} error: ${error.message}`, 'warn');
        } else {
          total++;
          if (existing) updated++;
          else created++;
        }
      }
      
      nextPageUrl = meta?.nextPageUrl;
      
      // Rate limit: 250ms between requests
      await new Promise(r => setTimeout(r, 250));
      
    } while (nextPageUrl);
    
    log(`Pipeline ${pipelineName}: done`);
  }
  
  return { total, created, updated };
}

async function main() {
  log('=== GHL Opportunity Sync Started ===');
  const startTime = Date.now();
  
  try {
    const stats = await syncOpportunities();
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    await logSync('ghl-opportunity-sync', 'success', { ...stats, duration_seconds: duration });
    
    log(`=== GHL Opportunity Sync Complete (${duration}s) ===`);
    log(`Total: ${stats.total}, Created: ${stats.created}, Updated: ${stats.updated}`);
    
    exitWithCode(0);
  } catch (error) {
    log(`Sync failed: ${error.message}`, 'error');
    await logSync('ghl-opportunity-sync', 'failed', { error: error.message });
    exitWithCode(1, error.message);
  }
}

main();
