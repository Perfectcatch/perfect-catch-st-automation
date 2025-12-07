/**
 * Sync Controller
 * HTTP API endpoints for pricebook sync operations
 */

import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('sync-controller');

export function createSyncRouter(syncEngine, scheduler) {
  const router = Router();

  /**
   * POST /api/sync/pricebook/full
   * Trigger a full sync
   */
  router.post('/full', async (req, res) => {
    try {
      const {
        resolveConflicts = 'manual',
        entityTypes,
        dryRun = false,
      } = req.body;

      logger.info({ resolveConflicts, entityTypes, dryRun }, 'Full sync requested');

      const result = await syncEngine.sync({
        direction: 'from_st',
        fullSync: true,
        resolveConflicts,
        entityTypes,
        dryRun,
        triggeredBy: 'api',
      });

      res.json({
        success: true,
        syncLogId: result.syncLogId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Full sync failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/sync/pricebook/incremental
   * Trigger an incremental sync
   */
  router.post('/incremental', async (req, res) => {
    try {
      const {
        resolveConflicts = 'manual',
        entityTypes,
        dryRun = false,
      } = req.body;

      logger.info({ resolveConflicts, entityTypes, dryRun }, 'Incremental sync requested');

      const result = await syncEngine.sync({
        direction: 'from_st',
        fullSync: false,
        resolveConflicts,
        entityTypes,
        dryRun,
        triggeredBy: 'api',
      });

      res.json({
        success: true,
        syncLogId: result.syncLogId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        conflicts: result.conflicts.length,
        errors: result.errors.length,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Incremental sync failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/sync/pricebook/status
   * Get sync status and statistics
   */
  router.get('/status', async (req, res) => {
    try {
      const status = await syncEngine.getStatus();
      const schedulerStatus = scheduler.getStatus();

      res.json({
        success: true,
        ...status,
        scheduler: schedulerStatus,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get sync status');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/sync/pricebook/conflicts
   * Get unresolved conflicts
   */
  router.get('/conflicts', async (req, res) => {
    try {
      const { limit = 100, entityType } = req.query;

      const conflicts = await syncEngine.getConflicts(parseInt(limit, 10));

      res.json({
        success: true,
        count: conflicts.length,
        conflicts,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get conflicts');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/sync/pricebook/resolve-conflict/:id
   * Resolve a specific conflict
   */
  router.post('/resolve-conflict/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { strategy, resolvedBy } = req.body;

      if (!strategy || !['keep_st', 'keep_local'].includes(strategy)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid strategy. Must be "keep_st" or "keep_local"',
        });
      }

      logger.info({ conflictId: id, strategy, resolvedBy }, 'Resolving conflict');

      const resolved = await syncEngine.resolveConflict(id, strategy, resolvedBy || 'api');

      res.json({
        success: true,
        conflict: resolved,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to resolve conflict');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/sync/pricebook/logs
   * Get sync logs
   */
  router.get('/logs', async (req, res) => {
    try {
      const { limit = 50, status } = req.query;

      const prisma = syncEngine.prisma;
      const where = status ? { status } : {};

      const logs = await prisma.pricebookSyncLog.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit, 10),
      });

      res.json({
        success: true,
        count: logs.length,
        logs,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get sync logs');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/sync/pricebook/logs/:id
   * Get a specific sync log
   */
  router.get('/logs/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const prisma = syncEngine.prisma;

      const log = await prisma.pricebookSyncLog.findUnique({
        where: { id },
        include: {
          conflicts: true,
          changes: {
            take: 100,
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!log) {
        return res.status(404).json({
          success: false,
          error: 'Sync log not found',
        });
      }

      res.json({
        success: true,
        log,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get sync log');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/sync/pricebook/scheduler/start
   * Start the sync scheduler
   */
  router.post('/scheduler/start', (req, res) => {
    try {
      scheduler.start();
      res.json({
        success: true,
        message: 'Scheduler started',
        status: scheduler.getStatus(),
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to start scheduler');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/sync/pricebook/scheduler/stop
   * Stop the sync scheduler
   */
  router.post('/scheduler/stop', (req, res) => {
    try {
      scheduler.stop();
      res.json({
        success: true,
        message: 'Scheduler stopped',
        status: scheduler.getStatus(),
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to stop scheduler');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

export default createSyncRouter;
