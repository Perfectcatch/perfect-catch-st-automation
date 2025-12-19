#!/usr/bin/env node
/**
 * Test GHL Pipeline Stages
 * Step 1: Move contacts to Contacted stage
 * Step 2: Move to Appointment Scheduled if job has appointments
 * Step 3: Move to Proposal Sent if estimate exists
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import { stRequest } from '../src/services/stClient.js';
import { stEndpoints } from '../src/lib/stEndpoints.js';

const { Pool } = pg;

// Schema prefixes
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// SALES PIPELINE stages
const PIPELINE = {
  id: 'fWJfnMsPzwOXgKdWxdjC',
  name: 'SALES PIPELINE',
  stages: {
    NEW_LEAD: '3dc14ef1-7883-40d4-9831-61a313a46e0a',
    CONTACTED: '56ab4d16-e629-4315-a755-7755677e03e1',
    APPOINTMENT_SCHEDULED: 'e439d832-d8af-47a6-b459-26ed1f210f96',
    PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
    ESTIMATE_FOLLOWUP: 'de5601ac-5dbe-4980-a960-b1699b9f4a74',
    JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd',
    ESTIMATE_LOST: 'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db'
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

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

async function main() {
  console.log('🔄 GHL Pipeline Stages Test');
  console.log('============================\n');

  const client = await pool.connect();
  const locationId = process.env.GHL_LOCATION_ID;

  try {
    // =========================================
    // STEP 1: Create opportunities in Contacted stage
    // =========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 1: Create opportunities in CONTACTED stage');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get the 10 synced contacts with their ST customer IDs
    const contactsResult = await client.query(`
      SELECT
        gc.ghl_id, gc.name, gc.st_customer_id,
        c.st_id, c.name as st_name
      FROM ${SCHEMA.ghl}.ghl_contacts gc
      JOIN ${SCHEMA.st}.st_customers c ON gc.st_customer_id = c.st_id
      WHERE gc.st_customer_id IS NOT NULL
        AND gc.ghl_created_at >= NOW() - INTERVAL '1 day'
      ORDER BY gc.ghl_created_at DESC
      LIMIT 10
    `);

    console.log(`Found ${contactsResult.rows.length} contacts to process\n`);

    let createdOpps = 0;
    let skippedOpps = 0;
    const opportunityMap = new Map(); // Track opportunities we create

    for (const contact of contactsResult.rows) {
      try {
        // Check if opportunity already exists for this contact
        const existingOpp = await client.query(`
          SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_opportunities
          WHERE ghl_contact_id = $1
        `, [contact.ghl_id]);

        if (existingOpp.rows.length > 0) {
          console.log(`   ⏭️  ${contact.name} - opportunity exists`);
          opportunityMap.set(contact.st_customer_id, existingOpp.rows[0].ghl_id);
          skippedOpps++;
          continue;
        }

        // Create opportunity in CONTACTED stage
        const oppData = {
          pipelineId: PIPELINE.id,
          pipelineStageId: PIPELINE.stages.CONTACTED,
          locationId,
          contactId: contact.ghl_id,
          name: `${contact.name} - New Customer Qualifying`,
          status: 'open',
          monetaryValue: 0
        };

        const oppRes = await ghlClient.post('/opportunities/', oppData);
        const createdOpp = oppRes.data.opportunity || oppRes.data;

        // Store in database
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
            ghl_id, ghl_contact_id, ghl_location_id, ghl_pipeline_id,
            pipeline_name, ghl_pipeline_stage_id, stage_name,
            name, monetary_value, status, st_customer_id,
            source, ghl_created_at, full_data, synced_to_st
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, true)
          ON CONFLICT (ghl_id) DO UPDATE SET
            ghl_pipeline_stage_id = EXCLUDED.ghl_pipeline_stage_id,
            stage_name = EXCLUDED.stage_name,
            local_updated_at = NOW()
        `, [
          createdOpp.id,
          contact.ghl_id,
          locationId,
          PIPELINE.id,
          PIPELINE.name,
          PIPELINE.stages.CONTACTED,
          'Contacted',
          oppData.name,
          0,
          'open',
          contact.st_customer_id,
          'st_customer_sync',
          JSON.stringify(createdOpp)
        ]);

        opportunityMap.set(contact.st_customer_id, createdOpp.id);
        console.log(`   ✅ ${contact.name} → Contacted stage (${createdOpp.id})`);
        createdOpps++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.log(`   ❌ ${contact.name} - ${error.response?.data?.message || error.message}`);
      }
    }

    console.log(`\n📊 Step 1 Results: ${createdOpps} created, ${skippedOpps} skipped\n`);

    // =========================================
    // STEP 2: Move to Appointment Scheduled if has appointments
    // =========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 2: Move to APPOINTMENT SCHEDULED stage');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get customers with scheduled appointments
    const customerIds = contactsResult.rows.map(c => c.st_customer_id);

    const jobsWithAppointments = await client.query(`
      SELECT
        j.customer_id,
        j.st_id as job_id,
        j.job_number,
        j.st_created_on,
        c.name as customer_name,
        (SELECT COUNT(*) FROM ${SCHEMA.st}.st_appointments a WHERE a.job_id = j.st_id) as appointment_count
      FROM ${SCHEMA.st}.st_jobs j
      JOIN ${SCHEMA.st}.st_customers c ON j.customer_id = c.st_id
      WHERE j.customer_id = ANY($1)
        AND EXISTS (SELECT 1 FROM ${SCHEMA.st}.st_appointments a WHERE a.job_id = j.st_id)
      ORDER BY j.st_created_on DESC
    `, [customerIds]);

    console.log(`Found ${jobsWithAppointments.rows.length} customers with scheduled appointments\n`);

    let movedToScheduled = 0;

    for (const job of jobsWithAppointments.rows) {
      try {
        // Get the opportunity for this customer
        const oppResult = await client.query(`
          SELECT ghl_id, ghl_pipeline_stage_id FROM ${SCHEMA.ghl}.ghl_opportunities
          WHERE st_customer_id = $1
          ORDER BY ghl_created_at DESC
          LIMIT 1
        `, [job.customer_id]);

        if (oppResult.rows.length === 0) {
          console.log(`   ⚠️  ${job.customer_name} - no opportunity found`);
          continue;
        }

        const opp = oppResult.rows[0];

        // Skip if already past this stage
        if (opp.ghl_pipeline_stage_id !== PIPELINE.stages.CONTACTED &&
            opp.ghl_pipeline_stage_id !== PIPELINE.stages.NEW_LEAD) {
          console.log(`   ⏭️  ${job.customer_name} - already in later stage`);
          continue;
        }

        // Update opportunity stage in GHL
        await ghlClient.put(`/opportunities/${opp.ghl_id}`, {
          pipelineStageId: PIPELINE.stages.APPOINTMENT_SCHEDULED
        });

        // Update local database
        await client.query(`
          UPDATE ${SCHEMA.ghl}.ghl_opportunities
          SET ghl_pipeline_stage_id = $2,
              stage_name = 'Appointment Scheduled',
              st_job_id = $3,
              local_updated_at = NOW()
          WHERE ghl_id = $1
        `, [opp.ghl_id, PIPELINE.stages.APPOINTMENT_SCHEDULED, job.job_id]);

        console.log(`   ✅ ${job.customer_name} (Job #${job.job_number}, ${job.appointment_count} appts) → Appointment Scheduled`);
        movedToScheduled++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.log(`   ❌ ${job.customer_name} - ${error.response?.data?.message || error.message}`);
      }
    }

    console.log(`\n📊 Step 2 Results: ${movedToScheduled} moved to Appointment Scheduled\n`);

    // =========================================
    // STEP 3: Move to Proposal Sent if estimate exists
    // =========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('STEP 3: Move to PROPOSAL SENT stage (with estimates)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get customers with estimates
    const estimatesResult = await client.query(`
      SELECT
        e.st_id as estimate_id,
        e.estimate_number,
        e.name as estimate_name,
        e.total,
        e.status as estimate_status,
        e.customer_id,
        e.job_id,
        c.name as customer_name,
        j.job_number
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_customers c ON e.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      WHERE e.customer_id = ANY($1)
      ORDER BY e.st_created_on DESC
    `, [customerIds]);

    console.log(`Found ${estimatesResult.rows.length} estimates for these customers\n`);

    let movedToProposalSent = 0;

    for (const estimate of estimatesResult.rows) {
      try {
        // Get the opportunity for this customer
        const oppResult = await client.query(`
          SELECT ghl_id, ghl_pipeline_id, ghl_pipeline_stage_id, name, monetary_value
          FROM ${SCHEMA.ghl}.ghl_opportunities
          WHERE st_customer_id = $1
          ORDER BY ghl_created_at DESC
          LIMIT 1
        `, [estimate.customer_id]);

        if (oppResult.rows.length === 0) {
          console.log(`   ⚠️  ${estimate.customer_name} - no opportunity found`);
          continue;
        }

        const opp = oppResult.rows[0];

        // Update opportunity with estimate value and move to Proposal Sent
        const newName = `${estimate.customer_name} - ${estimate.estimate_name || 'Estimate'} - $${Number(estimate.total || 0).toLocaleString()}`;

        // If opportunity is in wrong pipeline, move it first
        const updateData = {
          monetaryValue: Number(estimate.total) || 0,
          name: newName
        };

        if (opp.ghl_pipeline_id !== PIPELINE.id) {
          // Move to new pipeline first
          updateData.pipelineId = PIPELINE.id;
          updateData.pipelineStageId = PIPELINE.stages.PROPOSAL_SENT;
          console.log(`   🔄 ${estimate.customer_name} - moving to SALES PIPELINE...`);
        } else {
          updateData.pipelineStageId = PIPELINE.stages.PROPOSAL_SENT;
        }

        await ghlClient.put(`/opportunities/${opp.ghl_id}`, updateData);

        // Update local database
        await client.query(`
          UPDATE ${SCHEMA.ghl}.ghl_opportunities
          SET ghl_pipeline_id = $2,
              pipeline_name = $3,
              ghl_pipeline_stage_id = $4,
              stage_name = 'Appointment Completed - Proposal Sent',
              monetary_value = $5,
              name = $6,
              st_job_id = $7,
              custom_fields = jsonb_set(
                COALESCE(custom_fields, '{}'::jsonb),
                '{stEstimateId}',
                $8::jsonb
              ),
              local_updated_at = NOW()
          WHERE ghl_id = $1
        `, [
          opp.ghl_id,
          PIPELINE.id,
          PIPELINE.name,
          PIPELINE.stages.PROPOSAL_SENT,
          estimate.total || 0,
          newName,
          estimate.job_id,
          JSON.stringify(estimate.estimate_id)
        ]);

        console.log(`   ✅ ${estimate.customer_name} - $${Number(estimate.total).toLocaleString()} → Proposal Sent`);
        movedToProposalSent++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.log(`   ❌ ${estimate.customer_name} - ${error.response?.data?.message || error.message}`);
      }
    }

    console.log(`\n📊 Step 3 Results: ${movedToProposalSent} moved to Proposal Sent\n`);

    // =========================================
    // FINAL SUMMARY
    // =========================================
    console.log('═══════════════════════════════════════════════════════════');
    console.log('FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const summaryResult = await client.query(`
      SELECT
        stage_name,
        COUNT(*) as count,
        SUM(monetary_value) as total_value
      FROM ${SCHEMA.ghl}.ghl_opportunities
      WHERE ghl_pipeline_id = $1
        AND st_customer_id IS NOT NULL
      GROUP BY stage_name
      ORDER BY stage_name
    `, [PIPELINE.id]);

    console.log('Pipeline Stage Distribution:');
    for (const row of summaryResult.rows) {
      console.log(`   ${row.stage_name}: ${row.count} opportunities ($${Number(row.total_value || 0).toLocaleString()})`);
    }

    console.log('\n✅ Pipeline Stage Test Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main();
