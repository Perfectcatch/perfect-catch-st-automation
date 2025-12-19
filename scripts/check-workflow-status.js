#!/usr/bin/env node

/**
 * Check workflow engine status
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function checkStatus() {
  const client = await pool.connect();
  
  try {
    console.log('\n' + '='.repeat(60));
    console.log('WORKFLOW ENGINE STATUS');
    console.log('='.repeat(60));
    
    // Workflow definitions
    const defsResult = await client.query('SELECT * FROM workflow_definitions');
    console.log('\nWorkflow Definitions:', defsResult.rows.length);
    for (const def of defsResult.rows) {
      console.log(`  • ${def.name}`);
      console.log(`    Trigger: ${def.trigger_event}`);
      console.log(`    Conditions: ${JSON.stringify(def.trigger_conditions)}`);
      console.log(`    Enabled: ${def.enabled}`);
    }
    
    // Active instances
    const instancesResult = await client.query(`
      SELECT wi.*, wd.name as workflow_name
      FROM workflow_instances wi
      JOIN workflow_definitions wd ON wi.workflow_id = wd.id
      WHERE wi.status = 'active'
    `);
    console.log('\nActive Workflow Instances:', instancesResult.rows.length);
    for (const inst of instancesResult.rows) {
      console.log(`  • Instance ${inst.id}: ${inst.workflow_name}`);
      console.log(`    Customer: ${inst.customer_id}`);
      console.log(`    Step: ${inst.current_step}`);
      console.log(`    Next action: ${inst.next_action_at}`);
    }
    
    // Recent executions
    const execsResult = await client.query(`
      SELECT * FROM workflow_step_executions
      ORDER BY started_at DESC
      LIMIT 10
    `);
    console.log('\nRecent Step Executions:', execsResult.rows.length);
    for (const exec of execsResult.rows) {
      console.log(`  • Step ${exec.step_number}: ${exec.status}`);
      console.log(`    Started: ${exec.started_at}`);
      if (exec.error_message) {
        console.log(`    Error: ${exec.error_message}`);
      }
    }
    
    // Estimates that should trigger workflows
    const estimatesResult = await client.query(`
      SELECT e.st_id, e.name, e.status, e.total, e.st_created_on, c.name as customer_name
      FROM st_estimates e
      LEFT JOIN st_customers c ON e.customer_id = c.st_id
      WHERE e.status = 'Open' AND e.total >= 1000
      ORDER BY e.st_created_on DESC
      LIMIT 5
    `);
    console.log('\nOpen Estimates (>= $1000):', estimatesResult.rows.length);
    for (const est of estimatesResult.rows) {
      console.log(`  • Estimate ${est.st_id}: $${est.total}`);
      console.log(`    Customer: ${est.customer_name}`);
      console.log(`    Created: ${est.st_created_on}`);
      
      const hasInstanceResult = await client.query(`
        SELECT id FROM workflow_instances 
        WHERE trigger_data->>'estimateId' = $1
        LIMIT 1
      `, [String(est.st_id)]);
      console.log(`    Has workflow: ${hasInstanceResult.rows.length > 0 ? 'YES' : 'NO'}`);
    }
    
    // Recent sync logs
    const syncResult = await client.query(`
      SELECT module, status, records_created, records_updated, started_at
      FROM st_sync_log
      ORDER BY started_at DESC
      LIMIT 5
    `);
    console.log('\nRecent Sync Activity:');
    for (const sync of syncResult.rows) {
      console.log(`  • ${sync.module}: ${sync.status} (${sync.records_created} created, ${sync.records_updated} updated)`);
      console.log(`    Started: ${sync.started_at}`);
    }
    
    console.log('\n' + '='.repeat(60));
    
  } finally {
    client.release();
    await pool.end();
  }
}

checkStatus().catch(console.error);
