/**
 * Sync Monitor Service
 *
 * Tracks all sync operations, errors, and workflows in real-time.
 * Provides event streaming for live dashboard updates.
 */

import { EventEmitter } from 'events';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('sync-monitor');

class SyncMonitor extends EventEmitter {
  constructor() {
    super();
    this.events = [];
    this.maxEvents = 500;
    this.stats = {
      customers: { synced: 0, failed: 0, pending: 0 },
      jobs: { synced: 0, failed: 0, pending: 0 },
      opportunities: { synced: 0, failed: 0, pending: 0 },
      workflows: { triggered: 0, completed: 0, failed: 0, active: 0 },
    };
    this.activeOperations = new Map();
    this.errors = [];
    this.maxErrors = 100;
  }

  /**
   * Record a sync event
   */
  recordEvent(type, data) {
    const event = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      timestamp: new Date().toISOString(),
      ...data,
    };

    this.events.unshift(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(0, this.maxEvents);
    }

    // Update stats
    this.updateStats(type, data);

    // Emit for real-time listeners
    this.emit('event', event);
    logger.debug({ type, entityId: data.entityId }, 'Sync event recorded');

    return event;
  }

  /**
   * Record an error
   */
  recordError(source, error, context = {}) {
    const errorRecord = {
      id: `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      source,
      message: error.message || error,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString(),
    };

    this.errors.unshift(errorRecord);
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(0, this.maxErrors);
    }

    // Also record as event
    this.recordEvent('error', {
      source,
      message: errorRecord.message,
      ...context,
    });

    this.emit('error', errorRecord);
    logger.error({ source, error: errorRecord.message }, 'Sync error recorded');

    return errorRecord;
  }

  /**
   * Start tracking an operation
   */
  startOperation(operationId, type, details = {}) {
    const operation = {
      id: operationId,
      type,
      status: 'running',
      startedAt: new Date().toISOString(),
      ...details,
    };

    this.activeOperations.set(operationId, operation);
    this.recordEvent('operation_started', { operationId, operationType: type, ...details });

    return operation;
  }

  /**
   * Complete an operation
   */
  completeOperation(operationId, result = {}) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'completed';
      operation.completedAt = new Date().toISOString();
      operation.duration = new Date(operation.completedAt) - new Date(operation.startedAt);
      operation.result = result;

      this.activeOperations.delete(operationId);
      this.recordEvent('operation_completed', {
        operationId,
        operationType: operation.type,
        duration: operation.duration,
        ...result,
      });
    }
  }

  /**
   * Fail an operation
   */
  failOperation(operationId, error) {
    const operation = this.activeOperations.get(operationId);
    if (operation) {
      operation.status = 'failed';
      operation.failedAt = new Date().toISOString();
      operation.error = error.message || error;

      this.activeOperations.delete(operationId);
      this.recordError(operation.type, error, { operationId });
    }
  }

  /**
   * Update statistics based on event type
   */
  updateStats(type, data) {
    switch (type) {
      case 'customer_sync_success':
        this.stats.customers.synced++;
        break;
      case 'customer_sync_failed':
        this.stats.customers.failed++;
        break;
      case 'job_sync_success':
        this.stats.jobs.synced++;
        break;
      case 'job_sync_failed':
        this.stats.jobs.failed++;
        break;
      case 'opportunity_sync_success':
        this.stats.opportunities.synced++;
        break;
      case 'opportunity_sync_failed':
        this.stats.opportunities.failed++;
        break;
      case 'workflow_triggered':
        this.stats.workflows.triggered++;
        this.stats.workflows.active++;
        break;
      case 'workflow_completed':
        this.stats.workflows.completed++;
        this.stats.workflows.active = Math.max(0, this.stats.workflows.active - 1);
        break;
      case 'workflow_failed':
        this.stats.workflows.failed++;
        this.stats.workflows.active = Math.max(0, this.stats.workflows.active - 1);
        break;
    }

    this.emit('stats', this.stats);
  }

  /**
   * Get current state for dashboard
   */
  getState() {
    return {
      stats: this.stats,
      recentEvents: this.events.slice(0, 50),
      activeOperations: Array.from(this.activeOperations.values()),
      recentErrors: this.errors.slice(0, 20),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get events since a timestamp
   */
  getEventsSince(since) {
    const sinceDate = new Date(since);
    return this.events.filter(e => new Date(e.timestamp) > sinceDate);
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      customers: { synced: 0, failed: 0, pending: 0 },
      jobs: { synced: 0, failed: 0, pending: 0 },
      opportunities: { synced: 0, failed: 0, pending: 0 },
      workflows: { triggered: 0, completed: 0, failed: 0, active: 0 },
    };
    this.emit('stats', this.stats);
  }

  /**
   * Clear all events
   */
  clearEvents() {
    this.events = [];
    this.errors = [];
    this.emit('cleared');
  }
}

// Singleton instance
let monitorInstance = null;

export function getSyncMonitor() {
  if (!monitorInstance) {
    monitorInstance = new SyncMonitor();
  }
  return monitorInstance;
}

export default SyncMonitor;
