/**
 * Execution Engine
 * Executes workflow steps on schedule
 */

import pg from 'pg';
import { createLogger } from '../../lib/logger.js';
import { agentExecutor } from './agent-executor.js';
import { evaluateCondition } from './condition-evaluator.js';

const { Pool } = pg;
const logger = createLogger('execution-engine');

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

export class ExecutionEngine {
  constructor() {
    this.isRunning = false;
    this.interval = null;
    this.checkIntervalMs = parseInt(process.env.EXECUTION_CHECK_INTERVAL_MS) || 10000;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Execution engine already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting execution engine (checking every ${this.checkIntervalMs / 1000} seconds)...`);

    // Check at configured interval
    this.interval = setInterval(() => this.processPendingSteps(), this.checkIntervalMs);

    // Run immediately
    await this.processPendingSteps();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('Execution engine stopped');
  }

  async processPendingSteps() {
    const client = await getPool().connect();
    try {
      // Get workflows with actions due
      const result = await client.query(`
        SELECT wi.*, wd.name as workflow_name, wd.steps, wd.stop_conditions,
               c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wi.workflow_id = wd.id
        LEFT JOIN st_customers c ON wi.customer_id = c.st_id
        WHERE wi.status = 'active' AND wi.next_action_at <= NOW()
      `);

      for (const instance of result.rows) {
        try {
          await this.executeNextStep(client, instance);
        } catch (error) {
          logger.error('Error executing workflow step', {
            instanceId: instance.id,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Error processing pending steps', { error: error.message });
    } finally {
      client.release();
    }
  }

  async executeNextStep(client, instance) {
    const steps = instance.steps || [];
    const step = steps[instance.current_step];

    if (!step) {
      logger.warn('No step found at index', { 
        instanceId: instance.id, 
        stepIndex: instance.current_step 
      });
      await this.completeWorkflow(client, instance);
      return;
    }

    logger.info('Executing workflow step', {
      workflow: instance.workflow_name,
      instanceId: instance.id,
      step: instance.current_step,
      action: step.action?.substring(0, 50)
    });

    // Check stop conditions BEFORE executing step
    const shouldStop = await this.checkStopConditions(client, instance);
    if (shouldStop.stop) {
      await this.stopWorkflow(client, instance, shouldStop.reason);
      return;
    }

    // Check step condition (if any)
    if (step.condition) {
      const conditionMet = await evaluateCondition(step.condition, instance);
      if (!conditionMet) {
        logger.info('Step condition not met, skipping', {
          instanceId: instance.id,
          condition: step.condition
        });
        await this.advanceToNextStep(client, instance);
        return;
      }
    }

    // Create execution record
    const execResult = await client.query(`
      INSERT INTO workflow_step_executions (
        workflow_instance_id, step_number, action_description,
        status, scheduled_for, started_at
      ) VALUES ($1, $2, $3, 'executing', $4, NOW())
      RETURNING id
    `, [instance.id, instance.current_step, step.action, instance.next_action_at]);

    const executionId = execResult.rows[0].id;

    try {
      // Build context for agent
      const context = {
        ...(typeof instance.context === 'string' ? JSON.parse(instance.context) : instance.context),
        customer: {
          id: Number(instance.customer_id),
          name: instance.customer_name,
          phone: instance.customer_phone,
          email: instance.customer_email
        },
        workflow: {
          message_count: instance.message_count || 0
        }
      };

      // Execute action using agent
      const result = await agentExecutor.executeAction(step.action, context, instance);

      // Update execution record
      await client.query(`
        UPDATE workflow_step_executions
        SET status = 'completed', action_output = $2, completed_at = NOW()
        WHERE id = $1
      `, [executionId, JSON.stringify(result)]);

      // Update instance message count
      await client.query(`
        UPDATE workflow_instances
        SET message_count = message_count + 1
        WHERE id = $1
      `, [instance.id]);

      // Advance to next step
      await this.advanceToNextStep(client, instance);

    } catch (error) {
      // Log error
      await client.query(`
        UPDATE workflow_step_executions
        SET status = 'failed', error_message = $2, completed_at = NOW()
        WHERE id = $1
      `, [executionId, error.message]);

      // Mark workflow as failed
      await client.query(`
        UPDATE workflow_instances SET status = 'failed' WHERE id = $1
      `, [instance.id]);

      throw error;
    }
  }

  async checkStopConditions(client, instance) {
    const stopConditions = instance.stop_conditions || [];

    for (const condition of stopConditions) {
      const shouldStop = await evaluateCondition(condition, instance);
      if (shouldStop) {
        return { stop: true, reason: condition };
      }
    }

    return { stop: false };
  }

  async advanceToNextStep(client, instance) {
    const steps = instance.steps || [];
    const nextStepIndex = instance.current_step + 1;

    if (nextStepIndex >= steps.length) {
      // Workflow complete
      await this.completeWorkflow(client, instance);
    } else {
      // Schedule next step
      const nextStep = steps[nextStepIndex];
      const nextActionAt = this.calculateNextActionTime(nextStep.delay);

      await client.query(`
        UPDATE workflow_instances
        SET current_step = $2, next_action_at = $3
        WHERE id = $1
      `, [instance.id, nextStepIndex, nextActionAt]);

      logger.info('Advanced to next step', {
        workflow: instance.workflow_name,
        instanceId: instance.id,
        nextStep: nextStepIndex,
        nextActionAt
      });
    }
  }

  async completeWorkflow(client, instance) {
    await client.query(`
      UPDATE workflow_instances
      SET status = 'completed', completed_at = NOW()
      WHERE id = $1
    `, [instance.id]);

    logger.info('Workflow completed', {
      workflow: instance.workflow_name,
      instanceId: instance.id
    });
  }

  async stopWorkflow(client, instance, reason) {
    await client.query(`
      UPDATE workflow_instances
      SET status = 'stopped', stopped_reason = $2, completed_at = NOW()
      WHERE id = $1
    `, [instance.id, reason]);

    logger.info('Workflow stopped', {
      workflow: instance.workflow_name,
      instanceId: instance.id,
      reason
    });
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

export const executionEngine = new ExecutionEngine();

export default ExecutionEngine;
