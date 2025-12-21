/**
 * Monitoring Routes
 *
 * Real-time monitoring API for sync operations and workflows.
 * Includes SSE endpoint for live updates.
 */

import express from 'express';
import { getSyncMonitor } from '../services/sync-monitor.js';

const router = express.Router();

/**
 * GET /api/monitor/state
 * Get current monitoring state (stats, recent events, errors)
 */
router.get('/state', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    res.json({
      success: true,
      ...monitor.getState(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/monitor/stats
 * Get current statistics only
 */
router.get('/stats', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    res.json({
      success: true,
      stats: monitor.stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/monitor/events
 * Get recent events with optional filtering
 * Query: { limit?: number, since?: string, type?: string }
 */
router.get('/events', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    const limit = parseInt(req.query.limit, 10) || 50;
    const since = req.query.since;
    const type = req.query.type;

    let events = since ? monitor.getEventsSince(since) : monitor.events;

    if (type) {
      events = events.filter(e => e.type === type || e.type.startsWith(type));
    }

    res.json({
      success: true,
      events: events.slice(0, limit),
      total: events.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/monitor/errors
 * Get recent errors
 * Query: { limit?: number }
 */
router.get('/errors', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    const limit = parseInt(req.query.limit, 10) || 20;

    res.json({
      success: true,
      errors: monitor.errors.slice(0, limit),
      total: monitor.errors.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/monitor/operations
 * Get active operations
 */
router.get('/operations', (req, res) => {
  try {
    const monitor = getSyncMonitor();

    res.json({
      success: true,
      operations: Array.from(monitor.activeOperations.values()),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * GET /api/monitor/stream
 * Server-Sent Events stream for real-time updates
 */
router.get('/stream', (req, res) => {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const monitor = getSyncMonitor();

  // Send initial state
  const initialState = monitor.getState();
  res.write(`event: init\ndata: ${JSON.stringify(initialState)}\n\n`);

  // Event listener
  const onEvent = (event) => {
    res.write(`event: sync\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // Stats listener
  const onStats = (stats) => {
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
  };

  // Error listener
  const onError = (error) => {
    res.write(`event: error\ndata: ${JSON.stringify(error)}\n\n`);
  };

  // Heartbeat every 30 seconds
  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: new Date().toISOString() })}\n\n`);
  }, 30000);

  // Subscribe to events
  monitor.on('event', onEvent);
  monitor.on('stats', onStats);
  monitor.on('error', onError);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    monitor.off('event', onEvent);
    monitor.off('stats', onStats);
    monitor.off('error', onError);
  });
});

/**
 * POST /api/monitor/reset
 * Reset statistics (for testing)
 */
router.post('/reset', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    monitor.resetStats();

    res.json({
      success: true,
      message: 'Statistics reset',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/monitor/clear
 * Clear all events and errors
 */
router.post('/clear', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    monitor.clearEvents();

    res.json({
      success: true,
      message: 'Events cleared',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /api/monitor/test-event
 * Generate a test event (for testing the dashboard)
 */
router.post('/test-event', (req, res) => {
  try {
    const monitor = getSyncMonitor();
    const { type, data } = req.body;

    const eventTypes = [
      'customer_sync_success',
      'customer_sync_failed',
      'workflow_triggered',
      'workflow_completed',
    ];

    const eventType = type || eventTypes[Math.floor(Math.random() * eventTypes.length)];

    const event = monitor.recordEvent(eventType, {
      entityId: data?.entityId || Math.floor(Math.random() * 1000000),
      entityName: data?.entityName || 'Test Customer',
      source: 'test',
      ...data,
    });

    res.json({
      success: true,
      event,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
