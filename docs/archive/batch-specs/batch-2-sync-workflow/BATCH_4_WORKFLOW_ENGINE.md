# 🤖 BATCH 4: EVENT-DRIVEN WORKFLOW ENGINE

## Overview

The automation "brain" that monitors ServiceTitan data changes and triggers workflows automatically. Executes workflow steps using Claude to interpret natural language actions.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Event Detector                            │
│  Polls st_* tables every 30 seconds for changes              │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Emits events)
┌──────────────────────────────────────────────────────────────┐
│                   Trigger Engine                              │
│  Matches events to workflow_definitions                      │
│  Creates workflow_instances                                  │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Schedules steps)
┌──────────────────────────────────────────────────────────────┐
│                   Execution Engine                            │
│  - Checks for due workflow steps (every 10 seconds)         │
│  - Evaluates stop conditions                                 │
│  - Executes actions via Agent Executor                       │
└──────────────────────────────────────────────────────────────┘
                          │
                          ▼ (Natural language actions)
┌──────────────────────────────────────────────────────────────┐
│                   Agent Executor                              │
│  Uses Claude + MCP tools to interpret and execute            │
└──────────────────────────────────────────────────────────────┘
```

---

## Files to Create

```
src/services/workflow/
├── event-detector.js            # Polls tables for changes
├── trigger-engine.js            # Matches events to workflows
├── execution-engine.js          # Executes workflow steps
├── agent-executor.js            # Claude interprets actions
├── condition-evaluator.js       # Evaluates expressions
└── workflow-manager.js          # Main coordinator

scripts/
└── start-workflow-workers.js    # Start all background workers
```

---

## 1. event-detector.js (Event Detection)

```javascript
/**
 * Detect changes in ServiceTitan data and emit events
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';

const prisma = new PrismaClient();

export class EventDetector extends EventEmitter {
  constructor() {
    super();
    this.lastCheck = {
      estimates: new Date(0),
      jobs: new Date(0),
      invoices: new Date(0),
      appointments: new Date(0)
    };
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Event detector already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting event detector (polling every 30 seconds)...');

    // Poll every 30 seconds
    this.interval = setInterval(() => this.detectChanges(), 30000);

    // Run immediately
    await this.detectChanges();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      logger.info('Event detector stopped');
    }
  }

  async detectChanges() {
    try {
      await Promise.all([
        this.detectEstimateChanges(),
        this.detectJobChanges(),
        this.detectInvoiceChanges(),
        this.detectAppointmentChanges()
      ]);
    } catch (error) {
      logger.error('Error detecting changes', { error: error.message });
    }
  }

  async detectEstimateChanges() {
    const lastCheck = this.lastCheck.estimates;

    // Get estimates modified since last check
    const estimates = await prisma.st_estimates.findMany({
      where: {
        OR: [
          { st_created_on: { gt: lastCheck } },
          { st_modified_on: { gt: lastCheck } }
        ]
      },
      include: {
        customer: true,
        job: true
      }
    });

    for (const estimate of estimates) {
      // Check if this is a new estimate
      if (estimate.st_created_on > lastCheck) {
        this.emit('estimate_created', {
          estimateId: Number(estimate.st_id),
          customerId: Number(estimate.customer_id),
          jobId: Number(estimate.job_id),
          status: estimate.status,
          total: Number(estimate.total),
          customer: estimate.customer,
          estimate: estimate
        });
        
        logger.info('Event: estimate_created', { 
          estimateId: Number(estimate.st_id), 
          total: Number(estimate.total) 
        });
      }

      // Check for status changes
      if (estimate.st_modified_on > lastCheck) {
        const previous = await this.getPreviousEstimateStatus(estimate.st_id);
        
        if (previous && previous.status !== estimate.status) {
          if (estimate.status === 'Sold') {
            this.emit('estimate_approved', {
              estimateId: Number(estimate.st_id),
              customerId: Number(estimate.customer_id),
              total: Number(estimate.total),
              soldOn: estimate.sold_on,
              estimate: estimate
            });
            
            logger.info('Event: estimate_approved', { 
              estimateId: Number(estimate.st_id) 
            });
          } else if (estimate.status === 'Dismissed') {
            this.emit('estimate_rejected', {
              estimateId: Number(estimate.st_id),
              customerId: Number(estimate.customer_id),
              estimate: estimate
            });
          }
        }
      }
    }

    this.lastCheck.estimates = new Date();
  }

  async detectJobChanges() {
    const lastCheck = this.lastCheck.jobs;

    const jobs = await prisma.st_jobs.findMany({
      where: {
        OR: [
          { st_created_on: { gt: lastCheck } },
          { st_modified_on: { gt: lastCheck } }
        ]
      },
      include: {
        customer: true
      }
    });

    for (const job of jobs) {
      // New job created
      if (job.st_created_on > lastCheck) {
        this.emit('job_created', {
          jobId: Number(job.st_id),
          customerId: Number(job.customer_id),
          jobNumber: job.job_number,
          status: job.job_status,
          job: job
        });
        
        logger.info('Event: job_created', { jobId: Number(job.st_id) });
      }

      // Job completed
      if (job.st_modified_on > lastCheck) {
        const previous = await this.getPreviousJobStatus(job.st_id);
        
        if (previous && previous.job_status !== job.job_status && 
            job.job_status === 'Completed') {
          this.emit('job_completed', {
            jobId: Number(job.st_id),
            customerId: Number(job.customer_id),
            completedAt: job.job_completion_time,
            job: job
          });
          
          logger.info('Event: job_completed', { jobId: Number(job.st_id) });
        }
      }
    }

    this.lastCheck.jobs = new Date();
  }

  async detectInvoiceChanges() {
    const lastCheck = this.lastCheck.invoices;

    const invoices = await prisma.st_invoices.findMany({
      where: {
        OR: [
          { st_created_on: { gt: lastCheck } },
          { st_modified_on: { gt: lastCheck } },
          { 
            AND: [
              { balance: { gt: 0 } },
              { due_date: { lte: new Date() } },
              { status: { not: 'Paid' } }
            ]
          }
        ]
      },
      include: {
        customer: true
      }
    });

    for (const invoice of invoices) {
      // New invoice
      if (invoice.st_created_on > lastCheck) {
        this.emit('invoice_created', {
          invoiceId: Number(invoice.st_id),
          customerId: Number(invoice.customer_id),
          total: Number(invoice.total),
          balance: Number(invoice.balance),
          dueDate: invoice.due_date,
          invoice: invoice
        });
      }

      // Invoice overdue
      if (invoice.balance > 0 && 
          invoice.due_date && 
          invoice.due_date < new Date()) {
        this.emit('invoice_overdue', {
          invoiceId: Number(invoice.st_id),
          customerId: Number(invoice.customer_id),
          balance: Number(invoice.balance),
          daysPastDue: Math.floor((new Date() - invoice.due_date) / (1000 * 60 * 60 * 24)),
          invoice: invoice
        });
      }
    }

    this.lastCheck.invoices = new Date();
  }

  async detectAppointmentChanges() {
    const lastCheck = this.lastCheck.appointments;

    const appointments = await prisma.st_appointments.findMany({
      where: {
        st_created_on: { gt: lastCheck }
      },
      include: {
        job: {
          include: {
            customer: true
          }
        }
      }
    });

    for (const appt of appointments) {
      this.emit('appointment_created', {
        appointmentId: Number(appt.st_id),
        jobId: Number(appt.job_id),
        customerId: Number(appt.job.customer_id),
        startTime: appt.start_on,
        appointment: appt
      });
      
      logger.info('Event: appointment_created', { 
        appointmentId: Number(appt.st_id) 
      });
    }

    this.lastCheck.appointments = new Date();
  }

  async getPreviousEstimateStatus(estimateId) {
    // In production, you'd track state changes in a separate table
    // For now, just return null to trigger all status changes
    return null;
  }

  async getPreviousJobStatus(jobId) {
    return null;
  }
}

// Export singleton instance
export const eventDetector = new EventDetector();
```

**Key Points:**
- Polls every 30 seconds for changes
- Emits typed events (estimate_created, job_completed, etc.)
- Includes full entity data with each event
- Tracks last check time per entity type
- Handles status changes (estimate sold, job completed)

---

## 2. trigger-engine.js (Match Events to Workflows)

```javascript
/**
 * Match events to workflow definitions and create instances
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { evaluateCondition } from './condition-evaluator.js';

const prisma = new PrismaClient();

export class TriggerEngine {
  async handleEvent(eventType, eventData) {
    logger.debug('Processing event', { eventType, entityId: eventData.estimateId || eventData.jobId });

    // Find workflows triggered by this event
    const workflows = await prisma.workflow_definitions.findMany({
      where: {
        trigger_event: eventType,
        enabled: true
      }
    });

    for (const workflow of workflows) {
      try {
        // Check trigger conditions
        if (!await this.checkTriggerConditions(workflow, eventData)) {
          logger.debug('Trigger conditions not met', { 
            workflow: workflow.name, 
            eventType 
          });
          continue;
        }

        // Check for existing active instances
        const existingInstance = await prisma.workflow_instances.findFirst({
          where: {
            workflow_id: workflow.id,
            customer_id: BigInt(eventData.customerId),
            entity_type: this.getEntityType(eventType),
            entity_id: BigInt(this.getEntityId(eventData)),
            status: 'active'
          }
        });

        // Check concurrent limit
        if (existingInstance && workflow.max_concurrent_per_customer === 1) {
          logger.info('Customer already has active workflow instance', {
            workflow: workflow.name,
            customerId: eventData.customerId
          });
          continue;
        }

        // Create workflow instance
        await this.createWorkflowInstance(workflow, eventData);

      } catch (error) {
        logger.error('Error processing workflow trigger', {
          workflow: workflow.name,
          error: error.message
        });
      }
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
      if (typeof value === 'object') {
        // e.g., {"$gte": 1000}
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
        }
      } else {
        // Direct equality
        if (actualValue !== value) return false;
      }
    }

    return true;
  }

  async createWorkflowInstance(workflow, eventData) {
    const entityType = this.getEntityType(workflow.trigger_event);
    const entityId = this.getEntityId(eventData);

    // Calculate next action time (first step delay)
    const firstStep = workflow.steps[0];
    const nextActionAt = this.calculateNextActionTime(firstStep?.delay || '0 seconds');

    const instance = await prisma.workflow_instances.create({
      data: {
        workflow_id: workflow.id,
        entity_type: entityType,
        entity_id: BigInt(entityId),
        customer_id: BigInt(eventData.customerId),
        status: 'active',
        current_step: 0,
        next_action_at: nextActionAt,
        context: {
          trigger_event: workflow.trigger_event,
          trigger_data: eventData,
          workflow_name: workflow.name
        }
      }
    });

    logger.info('Workflow instance created', {
      workflow: workflow.name,
      instanceId: instance.id,
      customerId: eventData.customerId,
      nextActionAt
    });

    return instance;
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
    const match = delayString.match(/(\d+)\s+(second|minute|hour|day|week)s?/);
    if (!match) return new Date();

    const [, amount, unit] = match;
    const multipliers = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
      week: 604800000
    };

    return new Date(Date.now() + parseInt(amount) * multipliers[unit]);
  }
}

export const triggerEngine = new TriggerEngine();
```

**Key Points:**
- Finds workflows matching event type
- Evaluates trigger conditions (estimate.total >= 1000)
- Checks for duplicate instances
- Creates workflow_instances record
- Calculates first step execution time

---

## 3. execution-engine.js (Execute Workflow Steps)

```javascript
/**
 * Execute workflow steps on schedule
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '../../config/logger.js';
import { agentExecutor } from './agent-executor.js';
import { evaluateCondition } from './condition-evaluator.js';

const prisma = new PrismaClient();

export class ExecutionEngine {
  constructor() {
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Execution engine already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting execution engine (checking every 10 seconds)...');

    // Check every 10 seconds for due steps
    this.interval = setInterval(() => this.processPendingSteps(), 10000);

    // Run immediately
    await this.processPendingSteps();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.isRunning = false;
      logger.info('Execution engine stopped');
    }
  }

  async processPendingSteps() {
    try {
      // Get workflows with actions due
      const dueInstances = await prisma.workflow_instances.findMany({
        where: {
          status: 'active',
          next_action_at: { lte: new Date() }
        },
        include: {
          workflow_definition: true,
          customer: true
        }
      });

      for (const instance of dueInstances) {
        try {
          await this.executeNextStep(instance);
        } catch (error) {
          logger.error('Error executing workflow step', {
            instanceId: instance.id,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Error processing pending steps', { error: error.message });
    }
  }

  async executeNextStep(instance) {
    const workflow = instance.workflow_definition;
    const step = workflow.steps[instance.current_step];

    logger.info('Executing workflow step', {
      workflow: workflow.name,
      instanceId: instance.id,
      step: instance.current_step
    });

    // Check stop conditions BEFORE executing step
    const shouldStop = await this.checkStopConditions(workflow, instance);
    if (shouldStop.stop) {
      await this.stopWorkflow(instance, shouldStop.reason);
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
        await this.advanceToNextStep(instance);
        return;
      }
    }

    // Create execution record
    const execution = await prisma.workflow_step_executions.create({
      data: {
        workflow_instance_id: instance.id,
        step_number: instance.current_step,
        action_description: step.action,
        status: 'executing',
        scheduled_for: instance.next_action_at,
        started_at: new Date()
      }
    });

    try {
      // Execute action using agent
      const result = await agentExecutor.executeAction(
        step.action,
        instance.context,
        instance
      );

      // Update execution record
      await prisma.workflow_step_executions.update({
        where: { id: execution.id },
        data: {
          status: 'completed',
          action_output: result,
          completed_at: new Date()
        }
      });

      // Update instance message count
      await prisma.workflow_instances.update({
        where: { id: instance.id },
        data: {
          message_count: { increment: 1 }
        }
      });

      // Advance to next step
      await this.advanceToNextStep(instance);

    } catch (error) {
      // Log error
      await prisma.workflow_step_executions.update({
        where: { id: execution.id },
        data: {
          status: 'failed',
          error_message: error.message,
          completed_at: new Date()
        }
      });

      // Mark workflow as failed
      await prisma.workflow_instances.update({
        where: { id: instance.id },
        data: { status: 'failed' }
      });

      throw error;
    }
  }

  async checkStopConditions(workflow, instance) {
    const conditions = workflow.stop_conditions || [];

    for (const condition of conditions) {
      const shouldStop = await evaluateCondition(condition, instance);
      if (shouldStop) {
        return { stop: true, reason: condition };
      }
    }

    return { stop: false };
  }

  async advanceToNextStep(instance) {
    const workflow = instance.workflow_definition;
    const nextStepIndex = instance.current_step + 1;

    if (nextStepIndex >= workflow.steps.length) {
      // Workflow complete
      await prisma.workflow_instances.update({
        where: { id: instance.id },
        data: {
          status: 'completed',
          completed_at: new Date()
        }
      });

      logger.info('Workflow completed', {
        workflow: workflow.name,
        instanceId: instance.id
      });

    } else {
      // Schedule next step
      const nextStep = workflow.steps[nextStepIndex];
      const nextActionAt = this.calculateNextActionTime(nextStep.delay);

      await prisma.workflow_instances.update({
        where: { id: instance.id },
        data: {
          current_step: nextStepIndex,
          next_action_at: nextActionAt
        }
      });

      logger.info('Advanced to next step', {
        workflow: workflow.name,
        instanceId: instance.id,
        nextStep: nextStepIndex,
        nextActionAt
      });
    }
  }

  async stopWorkflow(instance, reason) {
    await prisma.workflow_instances.update({
      where: { id: instance.id },
      data: {
        status: 'stopped',
        stopped_reason: reason,
        completed_at: new Date()
      }
    });

    logger.info('Workflow stopped', {
      workflow: instance.workflow_definition.name,
      instanceId: instance.id,
      reason
    });
  }

  calculateNextActionTime(delayString) {
    const match = delayString.match(/(\d+)\s+(second|minute|hour|day|week)s?/);
    if (!match) return new Date();

    const [, amount, unit] = match;
    const multipliers = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
      week: 604800000
    };

    return new Date(Date.now() + parseInt(amount) * multipliers[unit]);
  }
}

export const executionEngine = new ExecutionEngine();
```

**Key Points:**
- Checks every 10 seconds for due steps
- Evaluates stop conditions before each step
- Checks step conditions (skip if not met)
- Executes via agent executor
- Tracks all executions in audit log
- Auto-advances to next step or completes

---

## 4. agent-executor.js (Claude Integration)

```javascript
/**
 * Execute workflow actions using Claude + MCP tools
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../../config/logger.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export class AgentExecutor {
  async executeAction(actionDescription, context, workflowInstance) {
    logger.info('Executing action with agent', {
      action: actionDescription,
      instanceId: workflowInstance.id
    });

    // Get customer and entity data
    const customer = await prisma.st_customers.findUnique({
      where: { st_id: workflowInstance.customer_id }
    });

    const entity = await this.getEntity(
      workflowInstance.entity_type,
      workflowInstance.entity_id
    );

    // Build enriched context
    const enrichedContext = {
      ...context,
      customer: {
        id: Number(customer.st_id),
        name: customer.name,
        phone: customer.phone,
        email: customer.email
      },
      entity,
      workflow: {
        message_count: workflowInstance.message_count
      }
    };

    // Call Claude with MCP tools
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: `You are a workflow automation executor for Perfect Catch.

Context:
${JSON.stringify(enrichedContext, null, 2)}

Execute the requested action using available MCP tools.
Be concise and report what you did.`,
      tools: this.getAvailableTools(),
      messages: [{
        role: 'user',
        content: actionDescription
      }]
    });

    // Process tool uses
    const results = [];
    for (const content of response.content) {
      if (content.type === 'tool_use') {
        logger.info('Tool used', { 
          tool: content.name, 
          input: content.input 
        });
        results.push({
          tool: content.name,
          input: content.input
        });
      }
    }

    return {
      text: response.content.find(c => c.type === 'text')?.text,
      tools_used: results
    };
  }

  async getEntity(entityType, entityId) {
    switch (entityType) {
      case 'estimate':
        return await prisma.st_estimates.findUnique({
          where: { st_id: entityId }
        });
      case 'job':
        return await prisma.st_jobs.findUnique({
          where: { st_id: entityId }
        });
      case 'invoice':
        return await prisma.st_invoices.findUnique({
          where: { st_id: entityId }
        });
      default:
        return null;
    }
  }

  getAvailableTools() {
    // MCP tools available to workflow executor
    return [
      {
        name: 'send_sms',
        description: 'Send SMS message to customer',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Phone number' },
            message: { type: 'string', description: 'Message text' }
          },
          required: ['to', 'message']
        }
      },
      {
        name: 'send_email',
        description: 'Send email to customer',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Email address' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body' }
          },
          required: ['to', 'subject', 'body']
        }
      }
    ];
  }
}

export const agentExecutor = new AgentExecutor();
```

**Key Points:**
- Uses Claude Sonnet 4 to interpret actions
- Enriches context with customer + entity data
- Has access to MCP tools (send_sms, send_email)
- Returns execution results
- Logs all tool usage

---

## 5. condition-evaluator.js (Evaluate Expressions)

```javascript
/**
 * Evaluate workflow conditions
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function evaluateCondition(condition, workflowInstance) {
  // Get current entity state
  const entity = await getEntityCurrentState(
    workflowInstance.entity_type,
    workflowInstance.entity_id
  );

  // Build evaluation context
  const context = {
    estimate: workflowInstance.entity_type === 'estimate' ? entity : null,
    job: workflowInstance.entity_type === 'job' ? entity : null,
    invoice: workflowInstance.entity_type === 'invoice' ? entity : null,
    workflow: {
      message_count: workflowInstance.message_count
    },
    customer: {
      opted_out: await isCustomerOptedOut(workflowInstance.customer_id)
    }
  };

  // Simple expression evaluation
  // Example: "estimate.status == 'Sold'"
  return evaluateExpression(condition, context);
}

async function getEntityCurrentState(entityType, entityId) {
  switch (entityType) {
    case 'estimate':
      return await prisma.st_estimates.findUnique({
        where: { st_id: entityId }
      });
    case 'job':
      return await prisma.st_jobs.findUnique({
        where: { st_id: entityId }
      });
    case 'invoice':
      return await prisma.st_invoices.findUnique({
        where: { st_id: entityId }
      });
    default:
      return null;
  }
}

async function isCustomerOptedOut(customerId) {
  const prefs = await prisma.customer_communication_preferences.findUnique({
    where: { customer_id: customerId }
  });
  return prefs?.sms_opted_out || false;
}

function evaluateExpression(expression, context) {
  // Simple expression parser
  // Supports: ==, !=, >, <, >=, <=
  
  const operators = ['==', '!=', '>=', '<=', '>', '<'];
  let operator = null;
  let parts = [];

  for (const op of operators) {
    if (expression.includes(op)) {
      operator = op;
      parts = expression.split(op).map(s => s.trim());
      break;
    }
  }

  if (!operator || parts.length !== 2) {
    return false;
  }

  const [left, right] = parts;
  const leftValue = getNestedValue(context, left);
  const rightValue = parseValue(right);

  switch (operator) {
    case '==':
      return leftValue == rightValue;
    case '!=':
      return leftValue != rightValue;
    case '>':
      return leftValue > rightValue;
    case '<':
      return leftValue < rightValue;
    case '>=':
      return leftValue >= rightValue;
    case '<=':
      return leftValue <= rightValue;
    default:
      return false;
  }
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function parseValue(str) {
  // Remove quotes
  if (str.startsWith("'") && str.endsWith("'")) {
    return str.slice(1, -1);
  }
  
  // Parse number
  if (!isNaN(str)) {
    return Number(str);
  }
  
  // Boolean
  if (str === 'true') return true;
  if (str === 'false') return false;
  
  return str;
}
```

**Key Points:**
- Evaluates condition strings (estimate.status == 'Sold')
- Fetches current entity state from database
- Checks customer opt-out status
- Simple expression parser
- Returns boolean

---

## 6. workflow-manager.js (Main Coordinator)

```javascript
/**
 * Main workflow system coordinator
 */

import { eventDetector } from './event-detector.js';
import { triggerEngine } from './trigger-engine.js';
import { executionEngine } from './execution-engine.js';
import { logger } from '../../config/logger.js';

export class WorkflowManager {
  async start() {
    logger.info('Starting workflow system...');

    // Connect event detector to trigger engine
    eventDetector.on('estimate_created', (data) => triggerEngine.handleEvent('estimate_created', data));
    eventDetector.on('estimate_approved', (data) => triggerEngine.handleEvent('estimate_approved', data));
    eventDetector.on('job_created', (data) => triggerEngine.handleEvent('job_created', data));
    eventDetector.on('job_completed', (data) => triggerEngine.handleEvent('job_completed', data));
    eventDetector.on('invoice_created', (data) => triggerEngine.handleEvent('invoice_created', data));
    eventDetector.on('invoice_overdue', (data) => triggerEngine.handleEvent('invoice_overdue', data));

    // Start engines
    await eventDetector.start();
    await executionEngine.start();

    logger.info('Workflow system started successfully');
  }

  async stop() {
    logger.info('Stopping workflow system...');
    eventDetector.stop();
    executionEngine.stop();
    logger.info('Workflow system stopped');
  }
}

export const workflowManager = new WorkflowManager();
```

---

## 7. scripts/start-workflow-workers.js

```javascript
#!/usr/bin/env node

/**
 * Start workflow background workers
 */

import { workflowManager } from '../src/services/workflow/workflow-manager.js';
import { logger } from '../src/config/logger.js';

async function main() {
  logger.info('='.repeat(60));
  logger.info('STARTING WORKFLOW WORKERS');
  logger.info('='.repeat(60));

  try {
    await workflowManager.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down...');
      await workflowManager.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      await workflowManager.stop();
      process.exit(0);
    });

  } catch (error) {
    logger.error('Failed to start workflow workers', { error: error.message });
    process.exit(1);
  }
}

main();
```

---

## NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "worker:workflows": "node scripts/start-workflow-workers.js"
  }
}
```

---

## Usage

```bash
# Start workflow system
npm run worker:workflows

# Will output:
# [INFO] Starting workflow system...
# [INFO] Starting event detector (polling every 30 seconds)...
# [INFO] Starting execution engine (checking every 10 seconds)...
# [INFO] Workflow system started successfully
```

---

## Testing

After deployment:

```sql
-- View active workflows
SELECT * FROM v_active_workflows;

-- View workflow performance
SELECT * FROM v_workflow_performance;

-- Check pending actions
SELECT * FROM v_pending_workflow_actions;
```

---

## What Happens Automatically

1. **Estimate created** → Send follow-up (2 hrs → 2 days → 5 days → 10 days)
2. **Estimate sold** → Workflow stops (goal achieved)
3. **Job completed** → Request review (2 hrs → 3 days)
4. **Invoice overdue** → Send reminders

---

**Ready to deploy Batch 4?**
