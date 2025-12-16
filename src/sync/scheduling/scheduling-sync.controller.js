/**
 * Scheduling Sync Controller
 * HTTP routes for scheduling sync operations
 */

import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('scheduling-sync-controller');

/**
 * Create router for scheduling sync endpoints
 * @param {import('./scheduling-sync.engine.js').SchedulingSyncEngine} syncEngine
 * @param {import('./scheduling-sync.scheduler.js').SchedulingSyncScheduler} scheduler
 * @returns {Router}
 */
export function createSchedulingSyncRouter(syncEngine, scheduler) {
  const router = Router();

  /**
   * POST /full - Trigger a full sync
   */
  router.post('/full', async (req, res) => {
    try {
      const { entityTypes, dryRun } = req.body;

      logger.info({ entityTypes, dryRun }, 'API: Full sync requested');

      const result = await syncEngine.sync({
        entityTypes: entityTypes || ['teams', 'zones', 'technicians', 'jobTypes', 'businessHours', 'arrivalWindows'],
        fullSync: true,
        dryRun: dryRun || false,
        triggeredBy: 'api',
      });

      res.json({
        success: true,
        syncLogId: result.syncLogId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Full sync failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /incremental - Trigger an incremental sync
   */
  router.post('/incremental', async (req, res) => {
    try {
      const { entityTypes, dryRun } = req.body;

      logger.info({ entityTypes, dryRun }, 'API: Incremental sync requested');

      const result = await syncEngine.sync({
        entityTypes: entityTypes || ['teams', 'zones', 'technicians'],
        fullSync: false,
        dryRun: dryRun || false,
        triggeredBy: 'api',
      });

      res.json({
        success: true,
        syncLogId: result.syncLogId,
        status: result.status,
        duration: result.duration,
        stats: result.stats,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Incremental sync failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /status - Get sync status
   */
  router.get('/status', async (req, res) => {
    try {
      const syncStatus = await syncEngine.getStatus();
      const schedulerStatus = scheduler ? scheduler.getStatus() : null;

      res.json({
        success: true,
        sync: syncStatus,
        scheduler: schedulerStatus,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Get status failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /technicians - Get synced technicians
   */
  router.get('/technicians', async (req, res) => {
    try {
      const { active, teamId, zoneId } = req.query;

      const technicians = await syncEngine.getTechnicians({
        active: active !== undefined ? active === 'true' : undefined,
        teamId: teamId ? parseInt(teamId) : undefined,
        zoneId: zoneId ? parseInt(zoneId) : undefined,
      });

      res.json({
        success: true,
        count: technicians.length,
        data: technicians,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Get technicians failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /zones - Get synced zones
   */
  router.get('/zones', async (req, res) => {
    try {
      const { active } = req.query;

      const zones = await syncEngine.getZones({
        active: active !== undefined ? active === 'true' : undefined,
      });

      res.json({
        success: true,
        count: zones.length,
        data: zones,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Get zones failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /teams - Get synced teams
   */
  router.get('/teams', async (req, res) => {
    try {
      const { active } = req.query;

      const teams = await syncEngine.getTeams({
        active: active !== undefined ? active === 'true' : undefined,
      });

      res.json({
        success: true,
        count: teams.length,
        data: teams,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Get teams failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /scheduler/start - Start the scheduler
   */
  router.post('/scheduler/start', (req, res) => {
    if (!scheduler) {
      return res.status(400).json({
        success: false,
        error: 'Scheduler not configured',
      });
    }

    try {
      scheduler.start();
      res.json({
        success: true,
        message: 'Scheduler started',
        status: scheduler.getStatus(),
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Start scheduler failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /scheduler/stop - Stop the scheduler
   */
  router.post('/scheduler/stop', (req, res) => {
    if (!scheduler) {
      return res.status(400).json({
        success: false,
        error: 'Scheduler not configured',
      });
    }

    try {
      scheduler.stop();
      res.json({
        success: true,
        message: 'Scheduler stopped',
        status: scheduler.getStatus(),
      });
    } catch (error) {
      logger.error({ error: error.message }, 'API: Stop scheduler failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

export default createSchedulingSyncRouter;
