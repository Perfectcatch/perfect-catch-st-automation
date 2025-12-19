#!/usr/bin/env node

/**
 * Test workflow triggering by creating a test estimate
 */

import 'dotenv/config';
import pg from 'pg';
import { createLogger } from '../src/lib/logger.js';

const { Pool } = pg;
const logger = createLogger('test-workflow');

const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function createTestEstimate() {
  const client = await pool.connect();
  
  try {
    logger.info('Creating test estimate to trigger workflow...');
    
    // Get a real customer and job
    const customerResult = await client.query('SELECT * FROM st_customers LIMIT 1');
    const customer = customerResult.rows[0];
    
    if (!customer) {
      throw new Error('Need at least 1 customer in database');
    }
    
    const jobResult = await client.query(
      'SELECT * FROM st_jobs WHERE customer_id = $1 LIMIT 1',
      [customer.st_id]
    );
    let job = jobResult.rows[0];
    
    if (!job) {
      // Get any job
      const anyJobResult = await client.query('SELECT * FROM st_jobs LIMIT 1');
      job = anyJobResult.rows[0];
    }
    
    if (!job) {
      throw new Error('Need at least 1 job in database');
    }
    
    // Create test estimate with unique ID
    const testStId = 999999000 + Math.floor(Math.random() * 1000);
    
    const insertResult = await client.query(`
      INSERT INTO st_estimates (
        st_id, tenant_id, customer_id, job_id, estimate_number, name,
        status, subtotal, total, st_created_on, st_modified_on, full_data, local_synced_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
      )
      RETURNING *
    `, [
      testStId,
      customer.tenant_id || 3222348440,
      customer.st_id,
      job.st_id,
      `TEST-${Date.now()}`,
      'Test Estimate for Workflow Testing',
      'Open',
      1500.00,
      1500.00,
      new Date(),
      new Date(),
      JSON.stringify({ test: true })
    ]);
    
    const testEstimate = insertResult.rows[0];
    
    logger.info('Test estimate created', {
      estimateId: Number(testEstimate.st_id),
      customerId: Number(testEstimate.customer_id),
      customerName: customer.name,
      jobId: Number(testEstimate.job_id),
      total: Number(testEstimate.total)
    });
    
    logger.info('Waiting 35 seconds for event detector to pick it up...');
    
    setTimeout(async () => {
      const instanceResult = await client.query(`
        SELECT * FROM workflow_instances 
        WHERE trigger_data->>'estimateId' = $1
        ORDER BY created_at DESC
        LIMIT 1
      `, [String(testEstimate.st_id)]);
      
      const instance = instanceResult.rows[0];
      
      if (instance) {
        logger.info('✅ SUCCESS: Workflow instance created!', {
          instanceId: instance.id,
          workflowId: instance.workflow_definition_id,
          status: instance.status
        });
      } else {
        logger.warn('⚠️  No workflow instance created. Check:');
        logger.warn('1. Are workers running? (docker ps | grep worker)');
        logger.warn('2. Check workflow_definitions trigger_conditions');
        logger.warn('3. Check event-detector logs');
        
        // Show workflow definitions
        const defsResult = await client.query('SELECT name, trigger_event, trigger_conditions, enabled FROM workflow_definitions');
        logger.info('Current workflow definitions:', defsResult.rows);
      }
      
      client.release();
      await pool.end();
      process.exit(0);
    }, 35000);
    
  } catch (error) {
    logger.error('Failed to create test estimate', {
      error: error.message,
      stack: error.stack
    });
    client.release();
    await pool.end();
    process.exit(1);
  }
}

createTestEstimate();
