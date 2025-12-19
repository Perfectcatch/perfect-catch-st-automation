/**
 * Workflow Tools Index
 * Exports all 7 workflow automation tools
 */

import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

// Tool 1: Create Workflow
export const createWorkflow = {
  name: 'create_workflow',
  description: 'Create a new workflow automation',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Workflow name' },
      triggerEvent: { type: 'string', description: 'Event that triggers the workflow', enum: ['estimate_created', 'job_completed', 'invoice_created', 'appointment_scheduled'] },
      triggerConditions: { type: 'object', description: 'Conditions that must be met' },
      steps: { type: 'array', items: { type: 'object' }, description: 'Workflow steps' },
      enabled: { type: 'boolean', default: false }
    },
    required: ['name', 'triggerEvent', 'steps']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        INSERT INTO workflow_definitions (name, trigger_event, trigger_conditions, steps, enabled, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING id
      `, [params.name, params.triggerEvent, JSON.stringify(params.triggerConditions || {}), JSON.stringify(params.steps), params.enabled || false]);
      
      return {
        success: true,
        workflowId: result.rows[0].id,
        name: params.name,
        triggerEvent: params.triggerEvent,
        enabled: params.enabled || false,
        message: `Workflow "${params.name}" created`
      };
    } finally { client.release(); }
  }
};

// Tool 2: Get Active Workflows
export const getActiveWorkflows = {
  name: 'get_active_workflows',
  description: 'Get all active workflow instances',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['active', 'completed', 'failed', 'all'], default: 'active' },
      limit: { type: 'number', default: 50 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = `
        SELECT wi.id, wi.status, wi.current_step, wi.started_at, wi.completed_at,
               wd.name as workflow_name, wd.trigger_event
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wi.workflow_id = wd.id
      `;
      
      if (params.status && params.status !== 'all') {
        sql += ` WHERE wi.status = '${params.status}'`;
      }
      
      sql += ` ORDER BY wi.started_at DESC LIMIT $1`;
      
      const result = await client.query(sql, [params.limit || 50]);
      
      return {
        success: true,
        count: result.rows.length,
        workflows: result.rows.map(w => ({
          instanceId: w.id,
          workflowName: w.workflow_name,
          triggerEvent: w.trigger_event,
          status: w.status,
          currentStep: w.current_step,
          startedAt: w.started_at,
          completedAt: w.completed_at
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 3: Control Workflow
export const controlWorkflow = {
  name: 'control_workflow',
  description: 'Control a workflow instance (pause, resume, stop)',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: 'Workflow instance ID' },
      action: { type: 'string', enum: ['pause', 'resume', 'stop'], description: 'Action to take' },
      reason: { type: 'string', description: 'Reason for action' }
    },
    required: ['instanceId', 'action']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let newStatus;
      switch (params.action) {
        case 'pause': newStatus = 'paused'; break;
        case 'resume': newStatus = 'active'; break;
        case 'stop': newStatus = 'stopped'; break;
      }
      
      const result = await client.query(
        'UPDATE workflow_instances SET status = $1, stopped_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING id',
        [newStatus, params.reason || null, params.instanceId]
      );
      
      if (result.rows.length === 0) return { success: false, error: 'Workflow instance not found' };
      
      return {
        success: true,
        instanceId: params.instanceId,
        action: params.action,
        newStatus,
        message: `Workflow ${params.action}ed`
      };
    } finally { client.release(); }
  }
};

// Tool 4: Get Workflow Analytics
export const getWorkflowAnalytics = {
  name: 'get_workflow_analytics',
  description: 'Get analytics on workflow performance',
  inputSchema: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: 'Specific workflow ID (optional)' },
      dateRange: { type: 'number', description: 'Number of days to analyze', default: 30 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    const days = params.dateRange || 30;
    try {
      const result = await client.query(`
        SELECT 
          wd.name,
          COUNT(wi.id) as total_runs,
          COUNT(*) FILTER (WHERE wi.status = 'completed') as completed,
          COUNT(*) FILTER (WHERE wi.status = 'failed') as failed,
          AVG(EXTRACT(EPOCH FROM (wi.completed_at - wi.started_at))) as avg_duration_seconds
        FROM workflow_definitions wd
        LEFT JOIN workflow_instances wi ON wd.id = wi.workflow_id
          AND wi.started_at >= NOW() - INTERVAL '${days} days'
        GROUP BY wd.id, wd.name
      `);
      
      return {
        success: true,
        dateRange: `Last ${days} days`,
        workflows: result.rows.map(w => ({
          name: w.name,
          totalRuns: Number(w.total_runs),
          completed: Number(w.completed),
          failed: Number(w.failed),
          successRate: Number(w.total_runs) > 0 ? ((Number(w.completed) / Number(w.total_runs)) * 100).toFixed(1) + '%' : 'N/A',
          avgDurationMinutes: w.avg_duration_seconds ? (Number(w.avg_duration_seconds) / 60).toFixed(1) : null
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 5: Test Workflow
export const testWorkflow = {
  name: 'test_workflow',
  description: 'Test a workflow with sample data without actually executing actions',
  inputSchema: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: 'Workflow definition ID' },
      testData: { type: 'object', description: 'Sample data to test with' }
    },
    required: ['workflowId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM workflow_definitions WHERE id = $1', [params.workflowId]);
      if (result.rows.length === 0) return { success: false, error: 'Workflow not found' };
      
      const workflow = result.rows[0];
      const steps = workflow.steps || [];
      
      // Simulate workflow execution
      const simulation = steps.map((step, idx) => ({
        stepNumber: idx + 1,
        action: step.action,
        wouldExecute: true,
        estimatedDelay: step.delay_minutes || 0
      }));
      
      return {
        success: true,
        workflowId: params.workflowId,
        workflowName: workflow.name,
        testMode: true,
        steps: simulation,
        message: 'Workflow test completed. No actions were actually executed.'
      };
    } finally { client.release(); }
  }
};

// Tool 6: Get Workflow History
export const getWorkflowHistory = {
  name: 'get_workflow_history',
  description: 'Get execution history for a specific workflow or entity',
  inputSchema: {
    type: 'object',
    properties: {
      workflowId: { type: 'string', description: 'Workflow definition ID' },
      entityId: { type: 'number', description: 'Entity ID (customer, job, etc.)' },
      limit: { type: 'number', default: 20 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = `
        SELECT wi.id, wi.status, wi.current_step, wi.started_at, wi.completed_at, wi.entity_type, wi.entity_id,
               wd.name as workflow_name
        FROM workflow_instances wi
        JOIN workflow_definitions wd ON wi.workflow_id = wd.id
        WHERE 1=1
      `;
      const values = [];
      let idx = 1;
      
      if (params.workflowId) {
        sql += ` AND wi.workflow_id = $${idx}`;
        values.push(params.workflowId);
        idx++;
      }
      if (params.entityId) {
        sql += ` AND wi.entity_id = $${idx}`;
        values.push(params.entityId);
        idx++;
      }
      
      sql += ` ORDER BY wi.started_at DESC LIMIT $${idx}`;
      values.push(params.limit || 20);
      
      const result = await client.query(sql, values);
      
      return {
        success: true,
        count: result.rows.length,
        history: result.rows.map(h => ({
          instanceId: h.id,
          workflowName: h.workflow_name,
          entityType: h.entity_type,
          entityId: Number(h.entity_id),
          status: h.status,
          currentStep: h.current_step,
          startedAt: h.started_at,
          completedAt: h.completed_at
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 7: List Available Triggers
export const listAvailableTriggers = {
  name: 'list_available_triggers',
  description: 'List all available workflow trigger events',
  inputSchema: {
    type: 'object',
    properties: {}
  },
  async handler() {
    return {
      success: true,
      triggers: [
        { event: 'estimate_created', description: 'When a new estimate is created', conditions: ['estimate.total', 'estimate.status', 'customer.type'] },
        { event: 'estimate_sold', description: 'When an estimate is marked as sold', conditions: ['estimate.total', 'estimate.items'] },
        { event: 'job_created', description: 'When a new job is created', conditions: ['job.type', 'customer.type'] },
        { event: 'job_completed', description: 'When a job is marked complete', conditions: ['job.type', 'job.total'] },
        { event: 'invoice_created', description: 'When an invoice is generated', conditions: ['invoice.total', 'invoice.balance'] },
        { event: 'invoice_overdue', description: 'When an invoice becomes overdue', conditions: ['invoice.days_overdue', 'invoice.balance'] },
        { event: 'appointment_scheduled', description: 'When an appointment is scheduled', conditions: ['appointment.date', 'technician.id'] },
        { event: 'appointment_completed', description: 'When an appointment is completed', conditions: ['appointment.duration'] },
        { event: 'customer_created', description: 'When a new customer is added', conditions: ['customer.type', 'customer.source'] },
        { event: 'customer_inactive', description: 'When a customer becomes inactive', conditions: ['customer.days_since_service'] }
      ]
    };
  }
};
