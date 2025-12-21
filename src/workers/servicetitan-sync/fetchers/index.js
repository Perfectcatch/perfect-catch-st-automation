/**
 * ServiceTitan Raw Table Fetchers
 *
 * This module exports all fetchers for populating raw_st_* tables
 * from ServiceTitan API endpoints.
 *
 * Usage:
 *   import { syncAllRaw, CustomersFetcher } from './fetchers/index.js';
 *
 *   // Sync all raw tables
 *   await syncAllRaw();
 *
 *   // Or sync specific tables
 *   const fetcher = new CustomersFetcher();
 *   await fetcher.fullSync();
 */

// Base class
export { BaseFetcher } from './base-fetcher.js';

// CRM Module
export {
  CustomersFetcher,
  CustomerContactsFetcher,
  LocationsFetcher,
  LocationContactsFetcher,
  syncAllCRM,
} from './crm-fetchers.js';

// JPM Module
export {
  JobsFetcher,
  AppointmentsFetcher,
  JobTypesFetcher,
  syncAllJPM,
} from './jpm-fetchers.js';

// Accounting Module
export {
  InvoicesFetcher,
  PaymentsFetcher,
  syncAllAccounting,
} from './accounting-fetchers.js';

// Settings Module
export {
  TechniciansFetcher,
  EmployeesFetcher,
  BusinessUnitsFetcher,
  TagTypesFetcher,
  syncAllSettings,
} from './settings-fetchers.js';

// Other Modules (Dispatch, Marketing, Equipment, Sales)
export {
  AppointmentAssignmentsFetcher,
  TeamsFetcher,
  ZonesFetcher,
  CampaignsFetcher,
  InstalledEquipmentFetcher,
  EstimatesFetcher,
  syncAllDispatch,
  syncAllOther,
} from './other-fetchers.js';

// Pricebook Module
export {
  PricebookMaterialsFetcher,
  PricebookServicesFetcher,
  PricebookEquipmentFetcher,
  PricebookCategoriesFetcher,
  syncAllPricebook,
} from './pricebook-fetchers.js';

// Import for internal use
import { syncAllCRM } from './crm-fetchers.js';
import { syncAllJPM } from './jpm-fetchers.js';
import { syncAllAccounting } from './accounting-fetchers.js';
import { syncAllSettings } from './settings-fetchers.js';
import { syncAllDispatch, syncAllOther } from './other-fetchers.js';
import { syncAllPricebook } from './pricebook-fetchers.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('raw-sync');

/**
 * Sync all raw tables in the recommended order
 *
 * Order:
 * 1. Settings (reference data first)
 * 2. CRM (customers, locations, contacts)
 * 3. JPM (jobs, appointments)
 * 4. Accounting (invoices, payments)
 * 5. Dispatch (assignments)
 * 6. Other (campaigns, equipment, estimates)
 * 7. Pricebook (optional, large dataset)
 */
export async function syncAllRaw(options = {}) {
  const {
    includePricebook = false,
    modules = ['settings', 'crm', 'jpm', 'accounting', 'dispatch', 'other'],
  } = options;

  const results = {
    startedAt: new Date(),
    modules: {},
  };

  logger.info('Starting full raw sync...', { modules, includePricebook });

  const syncFunctions = {
    settings: syncAllSettings,
    crm: syncAllCRM,
    jpm: syncAllJPM,
    accounting: syncAllAccounting,
    dispatch: syncAllDispatch,
    other: syncAllOther,
    pricebook: syncAllPricebook,
  };

  const modulesToSync = includePricebook ? [...modules, 'pricebook'] : modules;

  for (const moduleName of modulesToSync) {
    const syncFn = syncFunctions[moduleName];
    if (!syncFn) {
      logger.warn(`Unknown module: ${moduleName}`);
      continue;
    }

    logger.info(`Syncing module: ${moduleName}`);
    const startTime = Date.now();

    try {
      results.modules[moduleName] = await syncFn();
      results.modules[moduleName].duration = Date.now() - startTime;
      logger.info(`Module ${moduleName} completed`, results.modules[moduleName]);
    } catch (error) {
      results.modules[moduleName] = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
      logger.error(`Module ${moduleName} failed`, { error: error.message });
    }
  }

  results.completedAt = new Date();
  results.totalDuration = results.completedAt - results.startedAt;

  logger.info('Full raw sync completed', {
    duration: `${results.totalDuration}ms`,
    modules: Object.keys(results.modules),
  });

  return results;
}

/**
 * Quick sync - just the most critical tables
 */
export async function syncCriticalRaw() {
  return syncAllRaw({
    modules: ['settings', 'crm', 'jpm'],
    includePricebook: false,
  });
}

export default {
  syncAllRaw,
  syncCriticalRaw,
};
