/**
 * Health Routes
 * Endpoints for health checks and system status
 *
 * Batch 10: Added GHL status and worker status endpoints
 */

import { Router } from 'express';
import {
  ping,
  health,
  status,
  detailedHealth,
  workflowHealth,
  ghlStatus,
  workerStatus
} from '../controllers/health.controller.js';

const router = Router();

// Simple ping - backward compatible with existing /ping
router.get('/ping', ping);

// Basic health check
router.get('/health', health);

// Detailed health check with all components
router.get('/health/detailed', detailedHealth);

// Workflow-specific health check
router.get('/health/workflows', workflowHealth);

// Batch 10: GHL sync status
router.get('/health/ghl', ghlStatus);
router.get('/api/ghl/status', ghlStatus);

// Batch 10: Worker health status
router.get('/health/workers', workerStatus);
router.get('/api/workers/status', workerStatus);

// Full status with metrics
router.get('/status', status);

export default router;
