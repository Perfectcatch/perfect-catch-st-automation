/**
 * Health Routes
 * Endpoints for health checks and system status
 */

import { Router } from 'express';
import { ping, health, status } from '../controllers/health.controller.js';

const router = Router();

// Simple ping - backward compatible with existing /ping
router.get('/ping', ping);

// Detailed health check
router.get('/health', health);

// Full status with metrics
router.get('/status', status);

export default router;
