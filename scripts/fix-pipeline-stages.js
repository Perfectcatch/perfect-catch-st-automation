#!/usr/bin/env node

/**
 * Fix Pipeline Stages
 * Moves opportunities to correct stages based on estimate and job status
 *
 * Flow:
 *   1. Sold Estimate → Move opportunity to "Job Sold" stage
 *   2. Install Job exists → Move opportunity to "Install Pipeline"
 */

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import axios from 'axios';

const { Pool } = pg;

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// Pipeline configuration
const PIPELINES = {
  SALES: {
    id: 'fWJfnMsPzwOXgKdWxdjC',
    name: 'SALES PIPELINE',
    stages: {
      PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
      JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd'
    }
  },
  INSTALL: {
    id: 'bbsMqYClVMDN26Lr6HdV',
    name: 'INSTALL PIPELINE',
    stages: {
      ESTIMATE_APPROVED: 'acf34a4c-30c1-4511-85ed-d384f0dc8365'
    }
  }
};

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SERVICETITAN_DATABASE_URL
});

async function fixPipelineStages() {
  const client = await pool.connect();

  console.log('');
  console.log('='.repeat(60));
  console.log('  FIXING PIPELINE STAGES');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Step 1: Find opportunities that should be in Job Sold (have sold estimates)
    console.log('Step 1: Finding opportunities with sold estimates...');

    const soldEstimatesResult = await client.query(`
      SELECT DISTINCT ON (o.ghl_id)
        o.ghl_id,
        o.name as opp_name,
        o.stage_name as current_stage,
        o.st_customer_id,
        c.name as customer_name,
        e.st_id as estimate_id,
        e.total as estimate_total,
        e.sold_on
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_estimates e ON e.customer_id = c.st_id AND e.status = 'Sold'
      WHERE o.pipeline_name = 'SALES PIPELINE'
        AND o.ghl_pipeline_stage_id = $1
        AND o.status = 'open'
      ORDER BY o.ghl_id, e.sold_on DESC
    `, [PIPELINES.SALES.stages.PROPOSAL_SENT]);

    console.log(`Found ${soldEstimatesResult.rows.length} opportunities to move to Job Sold`);

    // Step 2: Check which ones also have install jobs (should go to Install Pipeline)
    console.log('');
    console.log('Step 2: Checking for install jobs...');

    const installJobsResult = await client.query(`
      SELECT DISTINCT ON (o.ghl_id)
        o.ghl_id,
        o.name as opp_name,
        o.st_customer_id,
        c.name as customer_name,
        e.st_id as estimate_id,
        e.total as estimate_total,
        ij.st_id as install_job_id,
        ij.job_number as install_job_number,
        bu.name as business_unit
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_estimates e ON e.customer_id = c.st_id AND e.status = 'Sold'
      JOIN ${SCHEMA.st}.st_jobs ij ON ij.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON ij.business_unit_id = bu.st_id
      WHERE o.pipeline_name = 'SALES PIPELINE'
        AND o.ghl_pipeline_stage_id = $1
        AND o.status = 'open'
        AND bu.name LIKE '%Install%'
      ORDER BY o.ghl_id, ij.st_created_on DESC
    `, [PIPELINES.SALES.stages.PROPOSAL_SENT]);

    const hasInstallJob = new Set(installJobsResult.rows.map(r => r.ghl_id));
    console.log(`Found ${installJobsResult.rows.length} opportunities that should go to Install Pipeline`);

    // Step 3: Process moves
    console.log('');
    console.log('Step 3: Processing moves...');
    console.log('');

    let movedToJobSold = 0;
    let movedToInstall = 0;
    let failed = 0;

    for (const opp of soldEstimatesResult.rows) {
      try {
        const shouldGoToInstall = hasInstallJob.has(opp.ghl_id);
        const installInfo = installJobsResult.rows.find(r => r.ghl_id === opp.ghl_id);

        if (shouldGoToInstall && installInfo) {
          // Move directly to Install Pipeline
          console.log(`Moving to INSTALL PIPELINE: ${opp.customer_name}`);

          const newName = `${opp.customer_name} - Install Job #${installInfo.install_job_number} - $${Number(opp.estimate_total).toLocaleString()}`;

          await ghlClient.put(`/opportunities/${opp.ghl_id}`, {
            pipelineId: PIPELINES.INSTALL.id,
            pipelineStageId: PIPELINES.INSTALL.stages.ESTIMATE_APPROVED,
            name: newName
          });

          // Update local database
          await client.query(`
            UPDATE ${SCHEMA.ghl}.ghl_opportunities
            SET ghl_pipeline_id = $2,
                pipeline_name = $3,
                ghl_pipeline_stage_id = $4,
                stage_name = $5,
                st_job_id = $6,
                name = $7,
                local_updated_at = NOW()
            WHERE ghl_id = $1
          `, [
            opp.ghl_id,
            PIPELINES.INSTALL.id,
            PIPELINES.INSTALL.name,
            PIPELINES.INSTALL.stages.ESTIMATE_APPROVED,
            'Estimate Approved / Job Created',
            installInfo.install_job_id,
            newName
          ]);

          movedToInstall++;
          console.log(`  ✅ ${opp.customer_name} → Install Pipeline (Job #${installInfo.install_job_number})`);

        } else {
          // Move to Job Sold stage
          console.log(`Moving to JOB SOLD: ${opp.customer_name}`);

          await ghlClient.put(`/opportunities/${opp.ghl_id}`, {
            pipelineStageId: PIPELINES.SALES.stages.JOB_SOLD,
            monetaryValue: Number(opp.estimate_total) || 0
          });

          // Update local database
          await client.query(`
            UPDATE ${SCHEMA.ghl}.ghl_opportunities
            SET ghl_pipeline_stage_id = $2,
                stage_name = $3,
                monetary_value = $4,
                local_updated_at = NOW()
            WHERE ghl_id = $1
          `, [
            opp.ghl_id,
            PIPELINES.SALES.stages.JOB_SOLD,
            'Job Sold',
            opp.estimate_total
          ]);

          movedToJobSold++;
          console.log(`  ✅ ${opp.customer_name} → Job Sold ($${Number(opp.estimate_total).toLocaleString()})`);
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 300));

      } catch (error) {
        console.error(`  ❌ Failed: ${opp.customer_name} - ${error.message}`);
        failed++;
      }
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  RESULTS');
    console.log('='.repeat(60));
    console.log(`  Moved to Job Sold:      ${movedToJobSold}`);
    console.log(`  Moved to Install:       ${movedToInstall}`);
    console.log(`  Failed:                 ${failed}`);
    console.log(`  Total Processed:        ${soldEstimatesResult.rows.length}`);
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('Error fixing pipeline stages:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixPipelineStages()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
