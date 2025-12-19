/**
 * Trigger Engine
 * Matches events to workflow definitions and creates instances
 */

import pg from 'pg';
import { createLogger } from '../../lib/logger.js';
import { evaluateCondition } from './condition-evaluator.js';

const { Pool } = pg;
const logger = createLogger('trigger-engine');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export class TriggerEngine {
  async handleEvent(eventType, eventData) {
    logger.info('🎯 Event received by trigger engine', { 
      eventType, 
      entityId: eventData.estimateId || eventData.jobId || eventData.invoiceId,
      customerId: eventData.customerId
    });

    const client = await getPool().connect();
    try {
      // Find workflows triggered by this event
      const result = await client.query(`
        SELECT * FROM workflow_definitions
        WHERE trigger_event = $1 AND enabled = true
      `, [eventType]);

      const workflows = result.rows;

      logger.info('Found matching workflow definitions', {
        eventType,
        count: workflows.length,
        workflows: workflows.map(w => w.name)
      });

      if (workflows.length === 0) {
        logger.warn('No workflows match this event type', { eventType });
        return;
      }

      for (const workflow of workflows) {
        try {
          // Check trigger conditions
          logger.info('Checking workflow conditions', {
            workflow: workflow.name,
            conditions: workflow.trigger_conditions
          });

          if (!await this.checkTriggerConditions(workflow, eventData)) {
            logger.info('❌ Trigger conditions not met', {
              workflow: workflow.name,
              conditions: workflow.trigger_conditions,
              actualData: {
                total: eventData.total,
                status: eventData.status
              }
            });
            continue;
          }

          logger.info('✅ Trigger conditions met, creating instance', {
            workflow: workflow.name
          });

          // Check for existing active instances
          const existingResult = await client.query(`
            SELECT id FROM workflow_instances
            WHERE workflow_id = $1 
              AND customer_id = $2
              AND entity_type = $3
              AND entity_id = $4
              AND status = 'active'
          `, [
            workflow.id,
            eventData.customerId,
            this.getEntityType(eventType),
            this.getEntityId(eventData)
          ]);

          // Check concurrent limit
          if (existingResult.rows.length > 0 && workflow.max_concurrent_per_customer === 1) {
            logger.info('Customer already has active workflow instance', {
              workflow: workflow.name,
              customerId: eventData.customerId
            });
            continue;
          }

          // Create workflow instance
          await this.createWorkflowInstance(client, workflow, eventData);

        } catch (error) {
          logger.error('Error processing workflow trigger', {
            workflow: workflow.name,
            error: error.message
          });
        }
      }
    } finally {
      client.release();
    }
  }

  async checkTriggerConditions(workflow, eventData) {
    const conditions = workflow.trigger_conditions || {};

    // Empty conditions = always trigger
    if (Object.keys(conditions).length === 0) {
      return true;
    }

    // Evaluate each condition
    for (const [key, value] of Object.entries(conditions)) {
      const actualValue = this.getNestedValue(eventData, key);

      // Handle comparison operators
      if (typeof value === 'object' && value !== null) {
        const operator = Object.keys(value)[0];
        const compareValue = value[operator];

        switch (operator) {
          case '$gte':
            if (!(actualValue >= compareValue)) return false;
            break;
          case '$lte':
            if (!(actualValue <= compareValue)) return false;
            break;
          case '$gt':
            if (!(actualValue > compareValue)) return false;
            break;
          case '$lt':
            if (!(actualValue < compareValue)) return false;
            break;
          case '$ne':
            if (actualValue === compareValue) return false;
            break;
          case '$in':
            if (!compareValue.includes(actualValue)) return false;
            break;
        }
      } else {
        // Direct equality
        if (actualValue !== value) return false;
      }
    }

    return true;
  }

  async createWorkflowInstance(client, workflow, eventData) {
    const entityType = this.getEntityType(workflow.trigger_event);
    const entityId = this.getEntityId(eventData);

    // Calculate next action time (first step delay)
    const firstStep = workflow.steps?.[0];
    const nextActionAt = this.calculateNextActionTime(firstStep?.delay || '0 seconds');

    const result = await client.query(`
      INSERT INTO workflow_instances (
        workflow_id, entity_type, entity_id, customer_id,
        status, current_step, next_action_at, context
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      workflow.id,
      entityType,
      entityId,
      eventData.customerId,
      'active',
      0,
      nextActionAt,
      JSON.stringify({
        trigger_event: workflow.trigger_event,
        trigger_data: eventData,
        workflow_name: workflow.name
      })
    ]);

    logger.info('Workflow instance created', {
      workflow: workflow.name,
      instanceId: result.rows[0].id,
      customerId: eventData.customerId,
      nextActionAt
    });

    return result.rows[0];
  }

  getEntityType(eventType) {
    if (eventType.startsWith('estimate_')) return 'estimate';
    if (eventType.startsWith('job_')) return 'job';
    if (eventType.startsWith('invoice_')) return 'invoice';
    if (eventType.startsWith('appointment_')) return 'appointment';
    return 'unknown';
  }

  getEntityId(eventData) {
    return eventData.estimateId || eventData.jobId ||
           eventData.invoiceId || eventData.appointmentId;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  calculateNextActionTime(delayString) {
    if (!delayString) return new Date();
    
    const match = delayString.match(/(\d+)\s+(second|minute|hour|day|week)s?/i);
    if (!match) return new Date();

    const [, amount, unit] = match;
    const multipliers = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
      week: 604800000
    };

    return new Date(Date.now() + parseInt(amount) * multipliers[unit.toLowerCase()]);
  }
}

export const triggerEngine = new TriggerEngine();

export default TriggerEngine;
