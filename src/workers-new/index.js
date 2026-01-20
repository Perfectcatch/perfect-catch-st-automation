/**
 * Workers Index
 * Registers all workers and exports the registry
 *
 * Worker Schedule Summary:
 *   - st-customers-sync:         every 15 min
 *   - st-jobs-sync:              every 10 min
 *   - ghl-contacts-sync:         every 30 min
 *   - ghl-opportunities-sync:    every 15 min
 *   - estimates-to-ghl:          every 5 min
 *   - install-pipeline-mover:    every 5 min
 *   - in-progress-stage-mover:   every 5 min (moves to "In Progress / On Site" when dispatched)
 *   - relationship-tracker:      every 3 min (creates/enriches job_relationships)
 *   - job-stage-sync:            every 5 min (syncs ST status to GHL stages)
 *   - cleanup-logs:              daily at 2am
 */

import { registry } from './registry.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('workers');

// Import all workers
import stCustomersWorker from './sync/st-customers.worker.js';
import stJobsWorker from './sync/st-jobs.worker.js';
import ghlContactsWorker from './sync/ghl-contacts.worker.js';
import ghlOpportunitiesWorker from './sync/ghl-opportunities.worker.js';
import estimatesToGhlWorker from './pipelines/estimates-to-ghl.worker.js';
import installPipelineMoverWorker from './pipelines/install-pipeline-mover.worker.js';
import inProgressStageMoverWorker from './pipelines/in-progress-stage-mover.worker.js';
import relationshipTrackerWorker from './pipelines/relationship-tracker.worker.js';
import jobStageSyncWorker from './pipelines/job-stage-sync.worker.js';
import cleanupLogsWorker from './maintenance/cleanup-logs.worker.js';

// Register all workers
registry
  // ST Sync Workers
  .register(stCustomersWorker)
  .register(stJobsWorker)
  // GHL Sync Workers
  .register(ghlContactsWorker)
  .register(ghlOpportunitiesWorker)
  // Pipeline Workers
  .register(estimatesToGhlWorker)
  .register(installPipelineMoverWorker)
  .register(inProgressStageMoverWorker)
  .register(relationshipTrackerWorker)
  .register(jobStageSyncWorker)
  // Maintenance Workers
  .register(cleanupLogsWorker);

/**
 * Start all workers
 */
export function startWorkers() {
  logger.info('Starting all workers...');
  registry.start();
}

/**
 * Stop all workers
 */
export function stopWorkers() {
  logger.info('Stopping all workers...');
  registry.stop();
}

/**
 * Get status of all workers
 */
export function getWorkersStatus() {
  return registry.getStatus();
}

/**
 * Run a specific worker manually
 */
export async function runWorker(name) {
  return registry.runWorker(name);
}

/**
 * Enable a worker
 */
export function enableWorker(name) {
  registry.enable(name);
}

/**
 * Disable a worker
 */
export function disableWorker(name) {
  registry.disable(name);
}

export { registry };

export default {
  startWorkers,
  stopWorkers,
  getWorkersStatus,
  runWorker,
  enableWorker,
  disableWorker,
  registry
};
