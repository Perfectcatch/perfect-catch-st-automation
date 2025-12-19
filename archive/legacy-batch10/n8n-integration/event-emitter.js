/**
 * Pricebook Event Emitter
 * Emits events for pricebook operations that can trigger webhooks
 */

import { EventEmitter } from 'events';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('pricebook-events');

// Event types
export const PRICEBOOK_EVENTS = {
  // Material events
  MATERIAL_CREATED: 'material_created',
  MATERIAL_UPDATED: 'material_updated',
  MATERIAL_DELETED: 'material_deleted',

  // Service events
  SERVICE_CREATED: 'service_created',
  SERVICE_UPDATED: 'service_updated',
  SERVICE_DELETED: 'service_deleted',

  // Equipment events
  EQUIPMENT_CREATED: 'equipment_created',
  EQUIPMENT_UPDATED: 'equipment_updated',
  EQUIPMENT_DELETED: 'equipment_deleted',

  // Category events
  CATEGORY_CREATED: 'category_created',
  CATEGORY_UPDATED: 'category_updated',
  CATEGORY_DELETED: 'category_deleted',

  // Sync events
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',

  // Conflict events
  CONFLICT_DETECTED: 'conflict_detected',
  CONFLICT_RESOLVED: 'conflict_resolved',
};

class PricebookEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.logger = logger;
    this.webhookSender = null;
  }

  /**
   * Set the webhook sender for sending events to n8n
   * @param {import('./webhook-sender.js').WebhookSender} sender
   */
  setWebhookSender(sender) {
    this.webhookSender = sender;
  }

  /**
   * Emit an event and optionally send to webhooks
   * @param {string} eventType
   * @param {Object} data
   * @param {boolean} sendToWebhooks
   */
  async emitEvent(eventType, data, sendToWebhooks = true) {
    this.logger.debug({ eventType, data }, 'Emitting event');

    // Emit locally
    this.emit(eventType, data);

    // Send to webhooks if configured
    if (sendToWebhooks && this.webhookSender) {
      try {
        await this.webhookSender.sendEvent(eventType, data);
      } catch (error) {
        this.logger.error({ eventType, error: error.message }, 'Failed to send event to webhooks');
      }
    }
  }

  // Convenience methods for common events

  /**
   * Emit material created event
   * @param {Object} material
   */
  async materialCreated(material) {
    await this.emitEvent(PRICEBOOK_EVENTS.MATERIAL_CREATED, {
      id: material.id,
      stId: material.stId?.toString(),
      name: material.name,
      code: material.code,
      price: material.price ? Number(material.price) : null,
      categoryId: material.categoryId?.toString(),
    });
  }

  /**
   * Emit material updated event
   * @param {Object} material
   * @param {Object} changes
   */
  async materialUpdated(material, changes = {}) {
    await this.emitEvent(PRICEBOOK_EVENTS.MATERIAL_UPDATED, {
      id: material.id,
      stId: material.stId?.toString(),
      name: material.name,
      changes,
    });
  }

  /**
   * Emit material deleted event
   * @param {Object} material
   */
  async materialDeleted(material) {
    await this.emitEvent(PRICEBOOK_EVENTS.MATERIAL_DELETED, {
      id: material.id,
      stId: material.stId?.toString(),
      name: material.name,
    });
  }

  /**
   * Emit service created event
   * @param {Object} service
   */
  async serviceCreated(service) {
    await this.emitEvent(PRICEBOOK_EVENTS.SERVICE_CREATED, {
      id: service.id,
      stId: service.stId?.toString(),
      name: service.name,
      code: service.code,
      price: service.price ? Number(service.price) : null,
    });
  }

  /**
   * Emit service updated event
   * @param {Object} service
   * @param {Object} changes
   */
  async serviceUpdated(service, changes = {}) {
    await this.emitEvent(PRICEBOOK_EVENTS.SERVICE_UPDATED, {
      id: service.id,
      stId: service.stId?.toString(),
      name: service.name,
      changes,
    });
  }

  /**
   * Emit sync started event
   * @param {Object} syncLog
   */
  async syncStarted(syncLog) {
    await this.emitEvent(PRICEBOOK_EVENTS.SYNC_STARTED, {
      syncLogId: syncLog.id,
      syncType: syncLog.syncType,
      direction: syncLog.direction,
      startedAt: syncLog.startedAt,
    });
  }

  /**
   * Emit sync completed event
   * @param {Object} result
   */
  async syncCompleted(result) {
    await this.emitEvent(PRICEBOOK_EVENTS.SYNC_COMPLETED, {
      syncLogId: result.syncLogId,
      status: result.status,
      duration: result.duration,
      stats: result.stats,
    });
  }

  /**
   * Emit sync failed event
   * @param {Object} error
   * @param {string} syncLogId
   */
  async syncFailed(error, syncLogId) {
    await this.emitEvent(PRICEBOOK_EVENTS.SYNC_FAILED, {
      syncLogId,
      error: error.message,
    });
  }

  /**
   * Emit conflict detected event
   * @param {Object} conflict
   */
  async conflictDetected(conflict) {
    await this.emitEvent(PRICEBOOK_EVENTS.CONFLICT_DETECTED, {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      stId: conflict.stId?.toString(),
      conflictType: conflict.conflictType,
    });
  }

  /**
   * Emit conflict resolved event
   * @param {Object} conflict
   */
  async conflictResolved(conflict) {
    await this.emitEvent(PRICEBOOK_EVENTS.CONFLICT_RESOLVED, {
      conflictId: conflict.id,
      entityType: conflict.entityType,
      entityId: conflict.entityId,
      resolution: conflict.resolutionStrategy,
      resolvedBy: conflict.resolvedBy,
    });
  }
}

// Singleton instance
export const pricebookEvents = new PricebookEventEmitter();

export default pricebookEvents;
