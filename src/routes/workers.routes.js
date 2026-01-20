/**
 * Workers Routes
 * API endpoints for managing and triggering sync workers
 */

import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import {
  startWorkers,
  stopWorkers,
  getWorkersStatus,
  runWorker,
  enableWorker,
  disableWorker,
  registry
} from '../workers-new/index.js';

const router = Router();
const logger = createLogger('workers-routes');

// ═══════════════════════════════════════════════════════════════
// WORKER STATUS & MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * GET /workers/status
 * Get status of all registered workers
 */
router.get('/status', async (req, res) => {
  try {
    const status = getWorkersStatus();
    res.json({
      count: status.length,
      workers: status
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error getting workers status');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /workers/:name/status
 * Get status of a specific worker
 */
router.get('/:name/status', async (req, res) => {
  try {
    const { name } = req.params;
    const worker = registry.get(name);

    if (!worker) {
      return res.status(404).json({
        error: 'Worker not found',
        name,
        availableWorkers: registry.getAll().map(w => w.name)
      });
    }

    res.json(worker.getStatus());
  } catch (error) {
    logger.error({ error: error.message, worker: req.params.name }, 'Error getting worker status');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// WORKER EXECUTION
// ═══════════════════════════════════════════════════════════════

/**
 * POST /workers/:name/run
 * Manually trigger a specific worker
 */
router.post('/:name/run', async (req, res) => {
  try {
    const { name } = req.params;

    const worker = registry.get(name);
    if (!worker) {
      return res.status(404).json({
        error: 'Worker not found',
        name,
        availableWorkers: registry.getAll().map(w => w.name)
      });
    }

    logger.info({ worker: name }, 'Manually triggering worker');

    const result = await runWorker(name);

    res.json({
      status: 'completed',
      worker: name,
      ...result
    });
  } catch (error) {
    logger.error({ error: error.message, worker: req.params.name }, 'Error running worker');
    res.status(500).json({
      status: 'error',
      worker: req.params.name,
      error: error.message
    });
  }
});

/**
 * POST /workers/run-all
 * Run all enabled workers (use with caution)
 */
router.post('/run-all', async (req, res) => {
  try {
    const workers = registry.getAll().filter(w => w.enabled);
    const results = [];

    logger.info({ count: workers.length }, 'Running all enabled workers');

    for (const worker of workers) {
      try {
        const result = await worker.run();
        results.push({
          worker: worker.name,
          ...result
        });
      } catch (error) {
        results.push({
          worker: worker.name,
          status: 'error',
          error: error.message
        });
      }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;

    res.json({
      status: 'completed',
      summary: { total: workers.length, succeeded, failed },
      results
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error running all workers');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// WORKER ENABLE/DISABLE
// ═══════════════════════════════════════════════════════════════

/**
 * POST /workers/:name/enable
 * Enable a specific worker
 */
router.post('/:name/enable', async (req, res) => {
  try {
    const { name } = req.params;

    enableWorker(name);

    logger.info({ worker: name }, 'Worker enabled');

    res.json({
      status: 'enabled',
      worker: name,
      ...registry.get(name).getStatus()
    });
  } catch (error) {
    logger.error({ error: error.message, worker: req.params.name }, 'Error enabling worker');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /workers/:name/disable
 * Disable a specific worker
 */
router.post('/:name/disable', async (req, res) => {
  try {
    const { name } = req.params;

    disableWorker(name);

    logger.info({ worker: name }, 'Worker disabled');

    res.json({
      status: 'disabled',
      worker: name,
      ...registry.get(name).getStatus()
    });
  } catch (error) {
    logger.error({ error: error.message, worker: req.params.name }, 'Error disabling worker');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// SCHEDULER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

/**
 * POST /workers/scheduler/start
 * Start the worker scheduler
 */
router.post('/scheduler/start', async (req, res) => {
  try {
    startWorkers();
    logger.info('Worker scheduler started');
    res.json({ status: 'started' });
  } catch (error) {
    logger.error({ error: error.message }, 'Error starting scheduler');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /workers/scheduler/stop
 * Stop the worker scheduler
 */
router.post('/scheduler/stop', async (req, res) => {
  try {
    stopWorkers();
    logger.info('Worker scheduler stopped');
    res.json({ status: 'stopped' });
  } catch (error) {
    logger.error({ error: error.message }, 'Error stopping scheduler');
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// PIPELINE-SPECIFIC SHORTCUTS
// ═══════════════════════════════════════════════════════════════

/**
 * POST /workers/pipeline/job-stage-sync
 * Trigger the job stage sync worker (shortcut)
 */
router.post('/pipeline/job-stage-sync', async (req, res) => {
  try {
    logger.info('Triggering job-stage-sync worker');
    const result = await runWorker('job-stage-sync');
    res.json({ status: 'completed', ...result });
  } catch (error) {
    logger.error({ error: error.message }, 'Error running job-stage-sync');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /workers/pipeline/relationship-tracker
 * Trigger the relationship tracker worker (shortcut)
 */
router.post('/pipeline/relationship-tracker', async (req, res) => {
  try {
    logger.info('Triggering relationship-tracker worker');
    const result = await runWorker('relationship-tracker');
    res.json({ status: 'completed', ...result });
  } catch (error) {
    logger.error({ error: error.message }, 'Error running relationship-tracker');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /workers/pipeline/all
 * Run all pipeline-related workers in sequence
 */
router.post('/pipeline/all', async (req, res) => {
  try {
    logger.info('Running all pipeline workers');

    const pipelineWorkers = [
      'estimates-to-ghl',
      'relationship-tracker',
      'job-stage-sync',
      'install-pipeline-mover',
      'in-progress-stage-mover'
    ];

    const results = [];

    for (const workerName of pipelineWorkers) {
      try {
        const worker = registry.get(workerName);
        if (worker && worker.enabled) {
          const result = await worker.run();
          results.push({ worker: workerName, ...result });
        } else {
          results.push({ worker: workerName, status: 'skipped', reason: 'disabled or not found' });
        }
      } catch (error) {
        results.push({ worker: workerName, status: 'error', error: error.message });
      }
    }

    res.json({
      status: 'completed',
      results
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Error running pipeline workers');
    res.status(500).json({ error: error.message });
  }
});

export default router;
