/**
 * ServiceTitan Merge Workers
 *
 * This module exports all merge workers that combine raw_st_* tables
 * into dashboard-ready st_* main tables.
 *
 * Usage:
 *   import { runAllMergeWorkers, runCustomerMerge } from './mergers/index.js';
 *
 *   // Merge all tables
 *   await runAllMergeWorkers();
 *
 *   // Or merge specific tables
 *   await runCustomerMerge();
 */

// Base class
export { BaseMerger } from './base-merger.js';

// Complex Mergers (combine multiple raw tables)
export { CustomerMerger, runCustomerMerge } from './customer-merger.js';
export { JobMerger, runJobMerge } from './job-merger.js';
export { LocationMerger, runLocationMerge } from './location-merger.js';
export { InvoiceMerger, runInvoiceMerge } from './invoice-merger.js';
export { TechnicianMerger, runTechnicianMerge } from './technician-merger.js';

// Simple Copiers (direct copy with minimal transformation)
export {
  BusinessUnitsCopier,
  CampaignsCopier,
  JobTypesCopier,
  TagTypesCopier,
  EstimatesCopier,
  AppointmentsCopier,
  PaymentsCopier,
  InstalledEquipmentCopier,
  runBusinessUnitsCopy,
  runCampaignsCopy,
  runJobTypesCopy,
  runTagTypesCopy,
  runEstimatesCopy,
  runAppointmentsCopy,
  runPaymentsCopy,
  runInstalledEquipmentCopy,
  runAllReferenceCopies,
} from './simple-copiers.js';

// Import for internal use
import { CustomerMerger } from './customer-merger.js';
import { LocationMerger } from './location-merger.js';
import { JobMerger } from './job-merger.js';
import { InvoiceMerger } from './invoice-merger.js';
import { TechnicianMerger } from './technician-merger.js';
import {
  BusinessUnitsCopier,
  CampaignsCopier,
  JobTypesCopier,
  TagTypesCopier,
  EstimatesCopier,
  AppointmentsCopier,
  PaymentsCopier,
  InstalledEquipmentCopier,
} from './simple-copiers.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('merge-workers');

/**
 * Run all merge workers in the correct order
 *
 * Order matters because of foreign key dependencies:
 * 1. Reference data (business units, job types, tag types, campaigns)
 * 2. Customers (no dependencies)
 * 3. Locations (depends on customers)
 * 4. Technicians (no dependencies on merged tables)
 * 5. Jobs (depends on customers, locations, business units)
 * 6. Appointments (depends on jobs)
 * 7. Estimates (depends on jobs, customers)
 * 8. Invoices (depends on jobs, customers)
 * 9. Payments (depends on invoices, customers)
 * 10. Installed Equipment (depends on locations)
 */
export async function runAllMergeWorkers(options = {}) {
  const { incremental = false, since, includeReference = true } = options;

  const results = {
    startedAt: new Date(),
    mergers: {},
  };

  logger.info('Starting merge workers...', { incremental, includeReference });

  // Define all mergers in dependency order
  const allMergers = [];

  // Reference data first (if included)
  if (includeReference) {
    allMergers.push(
      { name: 'business_units', Merger: BusinessUnitsCopier },
      { name: 'job_types', Merger: JobTypesCopier },
      { name: 'tag_types', Merger: TagTypesCopier },
      { name: 'campaigns', Merger: CampaignsCopier },
    );
  }

  // Core entity mergers
  allMergers.push(
    { name: 'customers', Merger: CustomerMerger },
    { name: 'locations', Merger: LocationMerger },
    { name: 'technicians', Merger: TechnicianMerger },
    { name: 'jobs', Merger: JobMerger },
    { name: 'appointments', Merger: AppointmentsCopier },
    { name: 'estimates', Merger: EstimatesCopier },
    { name: 'invoices', Merger: InvoiceMerger },
    { name: 'payments', Merger: PaymentsCopier },
    { name: 'installed_equipment', Merger: InstalledEquipmentCopier },
  );

  for (const { name, Merger } of allMergers) {
    logger.info(`Running ${name} merge...`);
    const merger = new Merger();
    const startTime = Date.now();

    try {
      if (incremental) {
        results.mergers[name] = await merger.incrementalMerge(since);
      } else {
        results.mergers[name] = await merger.fullMerge();
      }
      results.mergers[name].duration = Date.now() - startTime;
      logger.info(`${name} merge completed`, results.mergers[name]);
    } catch (error) {
      results.mergers[name] = {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
      };
      logger.error(`${name} merge failed`, { error: error.message });
    } finally {
      await merger.close();
    }
  }

  results.completedAt = new Date();
  results.totalDuration = results.completedAt - results.startedAt;

  logger.info('All merge workers completed', {
    duration: `${results.totalDuration}ms`,
    mergers: Object.keys(results.mergers),
  });

  return results;
}

/**
 * Run core merges only (skip reference data and secondary tables)
 */
export async function runCoreMerges(options = {}) {
  const { incremental = false, since } = options;
  const results = {};

  const coreMergers = [
    { name: 'customers', Merger: CustomerMerger },
    { name: 'locations', Merger: LocationMerger },
    { name: 'technicians', Merger: TechnicianMerger },
    { name: 'jobs', Merger: JobMerger },
    { name: 'invoices', Merger: InvoiceMerger },
  ];

  for (const { name, Merger } of coreMergers) {
    const merger = new Merger();
    try {
      if (incremental) {
        results[name] = await merger.incrementalMerge(since);
      } else {
        results[name] = await merger.fullMerge();
      }
    } finally {
      await merger.close();
    }
  }

  return results;
}

/**
 * Run only customer-related merges (customers + locations)
 */
export async function runCRMMerge(options = {}) {
  const { incremental = false, since } = options;
  const results = {};

  const customerMerger = new CustomerMerger();
  const locationMerger = new LocationMerger();

  try {
    if (incremental) {
      results.customers = await customerMerger.incrementalMerge(since);
      results.locations = await locationMerger.incrementalMerge(since);
    } else {
      results.customers = await customerMerger.fullMerge();
      results.locations = await locationMerger.fullMerge();
    }
  } finally {
    await customerMerger.close();
    await locationMerger.close();
  }

  return results;
}

/**
 * Run only job-related merges (jobs + invoices + estimates + appointments)
 */
export async function runJobsMerge(options = {}) {
  const { incremental = false, since } = options;
  const results = {};

  const jobMerger = new JobMerger();
  const appointmentsCopier = new AppointmentsCopier();
  const estimatesCopier = new EstimatesCopier();
  const invoiceMerger = new InvoiceMerger();

  try {
    if (incremental) {
      results.jobs = await jobMerger.incrementalMerge(since);
      results.appointments = await appointmentsCopier.incrementalMerge(since);
      results.estimates = await estimatesCopier.incrementalMerge(since);
      results.invoices = await invoiceMerger.incrementalMerge(since);
    } else {
      results.jobs = await jobMerger.fullMerge();
      results.appointments = await appointmentsCopier.fullMerge();
      results.estimates = await estimatesCopier.fullMerge();
      results.invoices = await invoiceMerger.fullMerge();
    }
  } finally {
    await jobMerger.close();
    await appointmentsCopier.close();
    await estimatesCopier.close();
    await invoiceMerger.close();
  }

  return results;
}

export default {
  runAllMergeWorkers,
  runCoreMerges,
  runCRMMerge,
  runJobsMerge,
};
