/**
 * Enhanced Sync Orchestrator
 * Coordinates all sync modules with proper ordering
 */

import { syncReferenceData } from './sync-reference-data-enhanced.js';
import { CustomerSync } from './sync-customers-enhanced.js';
import { JobSync } from './sync-jobs-enhanced.js';
import { EstimateSync } from './sync-estimates-enhanced.js';
import { InvoiceSync } from './sync-invoices-enhanced.js';
import { AppointmentSync } from './sync-appointments-enhanced.js';
import { TechnicianSync } from './sync-technicians-enhanced.js';
import { getPool, logger } from './sync-base-enhanced.js';

export class SyncOrchestrator {
  constructor() {
    this.syncers = {
      customers: new CustomerSync(),
      jobs: new JobSync(),
      estimates: new EstimateSync(),
      invoices: new InvoiceSync(),
      appointments: new AppointmentSync(),
      technicians: new TechnicianSync()
    };
  }
  
  async runFullSync() {
    logger.info('='.repeat(60));
    logger.info('STARTING FULL SYNC WITH ENRICHMENT');
    logger.info('='.repeat(60));
    
    const startTime = Date.now();
    const results = {};
    
    try {
      // Phase 0: Reference data (required for foreign keys)
      logger.info('\n--- PHASE 0: Reference Data ---');
      results.reference = await syncReferenceData();
      
      // Phase 1: Core entities
      logger.info('\n--- PHASE 1: Customers ---');
      results.customers = await this.syncers.customers.run();
      
      // Phase 2: Jobs (depends on customers)
      logger.info('\n--- PHASE 2: Jobs ---');
      results.jobs = await this.syncers.jobs.run();
      
      // Phase 3: Related entities (parallel)
      logger.info('\n--- PHASE 3: Estimates, Invoices, Appointments ---');
      const [estimates, invoices, appointments] = await Promise.all([
        this.syncers.estimates.run(),
        this.syncers.invoices.run(),
        this.syncers.appointments.run()
      ]);
      results.estimates = estimates;
      results.invoices = invoices;
      results.appointments = appointments;
      
      // Phase 4: Technicians
      logger.info('\n--- PHASE 4: Technicians ---');
      results.technicians = await this.syncers.technicians.run();
      
      // Phase 5: Refresh aggregates
      logger.info('\n--- PHASE 5: Refreshing Aggregates ---');
      const client = await getPool().connect();
      try {
        await client.query('SELECT refresh_all_aggregates()');
      } finally {
        client.release();
      }
      
      const duration = Date.now() - startTime;
      
      logger.info('\n' + '='.repeat(60));
      logger.info('FULL SYNC COMPLETE');
      logger.info('='.repeat(60));
      logger.info(`Duration: ${(duration / 1000).toFixed(1)} seconds`);
      logger.info('Results:', JSON.stringify(results, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value, 2));
      
      return {
        success: true,
        duration,
        results
      };
      
    } catch (error) {
      logger.error('FULL SYNC FAILED', { error: error.message });
      throw error;
    }
  }
  
  async runIncrementalSync() {
    logger.info('Starting incremental sync...');
    
    const results = {};
    
    results.customers = await this.syncers.customers.run();
    results.jobs = await this.syncers.jobs.run();
    results.estimates = await this.syncers.estimates.run();
    results.invoices = await this.syncers.invoices.run();
    
    return results;
  }
  
  async runSingleSync(entity) {
    if (!this.syncers[entity]) {
      throw new Error(`Unknown entity: ${entity}`);
    }
    
    return this.syncers[entity].run();
  }
}

export const syncOrchestrator = new SyncOrchestrator();

export async function runFullSync() {
  return syncOrchestrator.runFullSync();
}

export async function runIncrementalSync() {
  return syncOrchestrator.runIncrementalSync();
}

export async function runSingleSync(entity) {
  return syncOrchestrator.runSingleSync(entity);
}

export default { SyncOrchestrator, syncOrchestrator, runFullSync, runIncrementalSync, runSingleSync };
