/**
 * GHL Sync Worker
 * Runs every 5 minutes to sync ST data to GHL
 *
 * Step 1: New ST customers → GHL contacts (Contacted stage)
 * Step 2: Jobs with appointments → Appointment Scheduled stage
 * Step 3: Estimates → Proposal Sent stage
 * Step 4: Technician assignments → Update techs custom field
 */

import pg from 'pg';
import axios from 'axios';
import cron from 'node-cron';
import { createLogger } from '../../lib/logger.js';
import { stRequest } from '../../services/stClient.js';
import { stEndpoints } from '../../lib/stEndpoints.js';

const { Pool } = pg;
const logger = createLogger('ghl-sync-worker');

// Schema prefixes
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// SALES PIPELINE configuration (verified from GHL API 2025-12-19)
const PIPELINE = {
  id: 'fWJfnMsPzwOXgKdWxdjC',
  name: 'SALES PIPELINE',
  stages: {
    NEW_LEAD: '3dc14ef1-7883-40d4-9831-61a313a46e0a',
    CONTACTED: '56ab4d16-e629-4315-a755-7755677e03e1',
    APPOINTMENT_SCHEDULED: 'e439d832-d8af-47a6-b459-26ed1f210f96',
    APPOINTMENT_COMPLETED_PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
    ESTIMATE_FOLLOWUP: 'de5601ac-5dbe-4980-a960-b1699b9f4a74',
    JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd',
    ESTIMATE_LOST: 'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db'
  }
};

// All pipelines for reference
const ALL_PIPELINES = {
  SALES_PIPELINE: 'fWJfnMsPzwOXgKdWxdjC',
  LEAD_NURTURE: 'wSZFCaTL4sD8WGVjjgbr',
  REVIEWS_REFERRALS: 'ONnbxgt47h3zcd1wkM6M',
  SERVICE: 'xcoyzWHzUxOwzzvEPkMD'
};

// GHL Techs custom field configuration (multiple select)
const GHL_TECHS_FIELD = {
  id: 'sJ3jmGpHGFUssEVZ9Npi',
  key: 'opportunity.techs',
  // Map ST technician IDs to GHL option values
  techMapping: {
    55810: 'Kurt',        // Kurt R
    60616473: 'Tyler',    // Tyler Giansante
    61607952: 'Jayden',   // Jayden Johnson
    58944518: 'Dylan',    // Dylan Adams
    55459334: 'Dan',      // Daniel Detomaso
    62354566: 'Kaine',    // Kaine Alvarez
    59011: 'Yanni',       // Yanni Ramos (Technician)
    26: 'Yanni'           // Yanni Ramos (Admin)
  }
};

// GHL API client
let ghlClient = null;

function getGHLClient() {
  if (!ghlClient) {
    ghlClient = axios.create({
      baseURL: 'https://services.leadconnectorhq.com',
      headers: {
        'Content-Type': 'application/json',
        'Version': '2021-07-28',
        'Authorization': `Bearer ${process.env.GHL_API_KEY}`
      }
    });
  }
  return ghlClient;
}

// Database pool
let pool = null;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5
    });
  }
  return pool;
}

/**
 * Step 1: Sync new customers to GHL as contacts
 */
async function syncNewCustomersToGHL(client, locationId, lastSyncTime) {
  logger.info('Step 1: Syncing new customers to GHL...');

  const stats = { synced: 0, skipped: 0, failed: 0 };

  try {
    // Get new customers since last sync
    const customersResult = await client.query(`
      SELECT
        c.st_id, c.name, c.email, c.phone,
        c.address_line1, c.city, c.state, c.zip, c.country,
        c.first_name, c.last_name, c.st_created_on
      FROM ${SCHEMA.st}.st_customers c
      LEFT JOIN ${SCHEMA.ghl}.ghl_contacts gc ON gc.st_customer_id = c.st_id
      WHERE c.st_created_on >= $1
        AND gc.id IS NULL
      ORDER BY c.st_created_on DESC
      LIMIT 50
    `, [lastSyncTime]);

    logger.info(`Found ${customersResult.rows.length} new customers to sync`);

    for (const customer of customersResult.rows) {
      try {
        const firstName = customer.first_name || customer.name?.split(' ')[0] || 'Unknown';
        const lastName = customer.last_name || customer.name?.split(' ').slice(1).join(' ') || '';

        // Create contact in GHL
        const contactData = {
          locationId,
          firstName,
          lastName,
          name: customer.name,
          source: 'ServiceTitan',
          customFields: [{ key: 'st_customer_id', field_value: String(customer.st_id) }]
        };

        if (customer.email) contactData.email = customer.email;
        if (customer.phone) contactData.phone = customer.phone;
        if (customer.address_line1) contactData.address1 = customer.address_line1;
        if (customer.city) contactData.city = customer.city;
        if (customer.state) contactData.state = customer.state;
        if (customer.zip) contactData.postalCode = customer.zip;

        const ghlRes = await getGHLClient().post('/contacts/', contactData);
        const createdContact = ghlRes.data.contact || ghlRes.data;

        // Store in database
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_contacts (
            ghl_id, ghl_location_id, st_customer_id,
            first_name, last_name, name, email, phone,
            address_line1, city, state, zip,
            source, synced_to_st, full_data, ghl_created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, NOW())
          ON CONFLICT (ghl_id) DO UPDATE SET
            st_customer_id = EXCLUDED.st_customer_id,
            synced_to_st = true,
            local_synced_at = NOW()
        `, [
          createdContact.id,
          locationId,
          customer.st_id,
          firstName,
          lastName,
          customer.name,
          customer.email,
          customer.phone,
          customer.address_line1,
          customer.city,
          customer.state,
          customer.zip,
          'servicetitan',
          JSON.stringify(createdContact)
        ]);

        // Create opportunity in CONTACTED stage
        const oppData = {
          pipelineId: PIPELINE.id,
          pipelineStageId: PIPELINE.stages.CONTACTED,
          locationId,
          contactId: createdContact.id,
          name: `${customer.name} - New Customer Qualifying`,
          status: 'open',
          monetaryValue: 0
        };

        const oppRes = await getGHLClient().post('/opportunities/', oppData);
        const createdOpp = oppRes.data.opportunity || oppRes.data;

        // Store opportunity in database
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
            ghl_id, ghl_contact_id, ghl_location_id, ghl_pipeline_id,
            pipeline_name, ghl_pipeline_stage_id, stage_name,
            name, monetary_value, status, st_customer_id,
            source, ghl_created_at, full_data, synced_to_st
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, true)
        `, [
          createdOpp.id,
          createdContact.id,
          locationId,
          PIPELINE.id,
          PIPELINE.name,
          PIPELINE.stages.CONTACTED,
          'Contacted',
          oppData.name,
          0,
          'open',
          customer.st_id,
          'st_customer_sync',
          JSON.stringify(createdOpp)
        ]);

        logger.debug(`Synced customer: ${customer.name}`);
        stats.synced++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        logger.error(`Failed to sync customer ${customer.name}:`, error.message);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 1 error:', error.message);
  }

  return stats;
}

/**
 * Step 2: Move opportunities to Appointment Scheduled stage
 */
async function updateAppointmentScheduledStage(client) {
  logger.info('Step 2: Updating Appointment Scheduled stage...');

  const stats = { moved: 0, skipped: 0, failed: 0 };

  try {
    // Get opportunities in Contacted stage that have scheduled appointments
    const oppsResult = await client.query(`
      SELECT DISTINCT ON (o.st_customer_id)
        o.ghl_id, o.st_customer_id, o.ghl_pipeline_stage_id,
        c.name as customer_name,
        j.st_id as job_id, j.job_number
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      JOIN ${SCHEMA.st}.st_customers c ON o.st_customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_jobs j ON j.customer_id = c.st_id
      WHERE o.ghl_pipeline_id = $1
        AND o.ghl_pipeline_stage_id = $2
        AND EXISTS (
          SELECT 1 FROM ${SCHEMA.st}.st_appointments a
          WHERE a.job_id = j.st_id
        )
      ORDER BY o.st_customer_id, j.st_created_on DESC
    `, [PIPELINE.id, PIPELINE.stages.CONTACTED]);

    logger.info(`Found ${oppsResult.rows.length} opportunities to move to Appointment Scheduled`);

    for (const opp of oppsResult.rows) {
      try {
        // Update stage in GHL
        await getGHLClient().put(`/opportunities/${opp.ghl_id}`, {
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
        `, [opp.ghl_id, PIPELINE.stages.APPOINTMENT_SCHEDULED, opp.job_id]);

        logger.debug(`Moved to Appointment Scheduled: ${opp.customer_name}`);
        stats.moved++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        logger.error(`Failed to update stage for ${opp.customer_name}:`, error.message);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 2 error:', error.message);
  }

  return stats;
}

/**
 * Step 3: Create/update opportunities for estimates (Proposal Sent stage)
 * IMPORTANT: Only moves opportunities FORWARD in pipeline, never backward
 * Skip opportunities already in: Job Sold, Estimate Lost, or Install Pipeline
 */
async function updateProposalSentStage(client, locationId) {
  logger.info('Step 3: Syncing estimates to Proposal Sent stage...');

  const stats = { synced: 0, skipped: 0, failed: 0 };

  // Stages that should NOT be overwritten (later stages in the pipeline)
  const PROTECTED_STAGES = [
    PIPELINE.stages.JOB_SOLD,           // Job Sold - don't move back
    PIPELINE.stages.ESTIMATE_LOST       // Estimate Lost - don't move back
  ];

  // Install Pipeline ID - opportunities here should never be moved back
  const INSTALL_PIPELINE_ID = 'bbsMqYClVMDN26Lr6HdV';

  try {
    // Get estimates that haven't been synced yet
    // EXCLUDE opportunities already in Job Sold, Estimate Lost, or Install Pipeline
    const estimatesResult = await client.query(`
      SELECT
        e.st_id as estimate_id,
        e.estimate_number,
        e.name as estimate_name,
        e.total,
        e.customer_id,
        e.job_id,
        c.name as customer_name,
        j.job_number,
        j.business_unit_id,
        gc.ghl_id as ghl_contact_id,
        go.ghl_id as existing_opp_id,
        go.ghl_pipeline_id as existing_pipeline_id,
        go.ghl_pipeline_stage_id as existing_stage_id
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_customers c ON e.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      LEFT JOIN ${SCHEMA.ghl}.ghl_contacts gc ON gc.st_customer_id = c.st_id
      LEFT JOIN ${SCHEMA.ghl}.ghl_opportunities go ON go.st_customer_id = c.st_id
      WHERE bu.ghl_pipeline_id IS NOT NULL
        AND e.total > 0
        AND e.st_created_on >= NOW() - INTERVAL '7 days'
        AND NOT EXISTS (
          SELECT 1 FROM ${SCHEMA.ghl}.ghl_opportunities o2
          WHERE o2.ghl_pipeline_stage_id = $1
            AND o2.st_customer_id = c.st_id
            AND (o2.custom_fields->>'stEstimateId')::bigint = e.st_id
        )
      ORDER BY e.st_created_on DESC
      LIMIT 50
    `, [PIPELINE.stages.APPOINTMENT_COMPLETED_PROPOSAL_SENT]);

    logger.info(`Found ${estimatesResult.rows.length} estimates to sync`);

    for (const estimate of estimatesResult.rows) {
      try {
        const newName = `${estimate.customer_name} - ${estimate.estimate_name || 'Estimate'} - $${Number(estimate.total || 0).toLocaleString()}`;

        if (estimate.existing_opp_id) {
          // IMPORTANT: Skip if opportunity is already in a protected stage or Install Pipeline
          if (PROTECTED_STAGES.includes(estimate.existing_stage_id)) {
            logger.debug(`Skipping ${estimate.customer_name} - already in Job Sold/Estimate Lost`);
            stats.skipped++;
            continue;
          }

          if (estimate.existing_pipeline_id === INSTALL_PIPELINE_ID) {
            logger.debug(`Skipping ${estimate.customer_name} - already in Install Pipeline`);
            stats.skipped++;
            continue;
          }

          // Update existing opportunity - ONLY update value and name, NEVER the stage
          // Stage management is handled by workflow events (estimate_approved, install_job_created)
          const updateData = {
            monetaryValue: Number(estimate.total) || 0,
            name: newName
            // DO NOT set pipelineStageId - this overwrites Job Sold/Install Pipeline stages!
          };

          await getGHLClient().put(`/opportunities/${estimate.existing_opp_id}`, updateData);

          // Update local database - ONLY update value, name, and job link
          // DO NOT update pipeline/stage - that's managed by workflow events
          await client.query(`
            UPDATE ${SCHEMA.ghl}.ghl_opportunities
            SET monetary_value = $2,
                name = $3,
                st_job_id = $4,
                custom_fields = jsonb_set(
                  COALESCE(custom_fields, '{}'::jsonb),
                  '{stEstimateId}',
                  $5::jsonb
                ),
                local_updated_at = NOW()
            WHERE ghl_id = $1
          `, [
            estimate.existing_opp_id,
            estimate.total || 0,
            newName,
            estimate.job_id,
            JSON.stringify(estimate.estimate_id)
          ]);

        } else if (estimate.ghl_contact_id) {
          // Create new opportunity
          const oppData = {
            pipelineId: PIPELINE.id,
            pipelineStageId: PIPELINE.stages.APPOINTMENT_COMPLETED_PROPOSAL_SENT,
            locationId,
            contactId: estimate.ghl_contact_id,
            name: newName,
            status: 'open',
            monetaryValue: Number(estimate.total) || 0
          };

          const oppRes = await getGHLClient().post('/opportunities/', oppData);
          const createdOpp = oppRes.data.opportunity || oppRes.data;

          // Store in database
          await client.query(`
            INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
              ghl_id, ghl_contact_id, ghl_location_id, ghl_pipeline_id,
              pipeline_name, ghl_pipeline_stage_id, stage_name,
              name, monetary_value, status, st_customer_id, st_job_id,
              source, custom_fields, ghl_created_at, full_data, synced_to_st
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15, true)
          `, [
            createdOpp.id,
            estimate.ghl_contact_id,
            locationId,
            PIPELINE.id,
            PIPELINE.name,
            PIPELINE.stages.APPOINTMENT_COMPLETED_PROPOSAL_SENT,
            'Appointment Completed - Proposal Sent',
            newName,
            estimate.total || 0,
            'open',
            estimate.customer_id,
            estimate.job_id,
            'st_estimate_sync',
            JSON.stringify({ stEstimateId: estimate.estimate_id }),
            JSON.stringify(createdOpp)
          ]);
        }

        logger.debug(`Synced estimate: ${estimate.customer_name} - $${estimate.total}`);
        stats.synced++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        logger.error(`Failed to sync estimate for ${estimate.customer_name}:`, error.message);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 3 error:', error.message);
  }

  return stats;
}

/**
 * Step 4: Sync PRIMARY technician to GHL opportunities
 * Uses the job_technicians table with lead/helper logic:
 * - Logic 1: Select lead over helper. If only helper, use helper.
 * - Logic 2: If multiple leads, prefer the one who sold the job.
 */
async function syncTechniciansToGHL(client) {
  logger.info('Step 4: Syncing primary technician to GHL opportunities...');

  const stats = { updated: 0, skipped: 0, failed: 0 };

  try {
    // Get open opportunities with their primary technician from job_technicians table
    const oppsResult = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.st_job_id,
        o.custom_fields->>'techs' as current_tech,
        jt.technician_id,
        jt.technician_name,
        jt.position
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      LEFT JOIN ${SCHEMA.st}.job_technicians jt
        ON jt.job_id = o.st_job_id AND jt.is_primary = TRUE
      WHERE o.status = 'open'
        AND o.st_job_id IS NOT NULL
    `);

    if (oppsResult.rows.length === 0) {
      logger.debug('No opportunities with job IDs to sync technicians');
      return stats;
    }

    logger.debug(`Found ${oppsResult.rows.length} opportunities with job IDs`);

    // Update opportunities with primary technician
    for (const opp of oppsResult.rows) {
      try {
        if (!opp.technician_id) {
          stats.skipped++;
          continue;
        }

        // Map to GHL option value (single technician)
        const ghlTech = GHL_TECHS_FIELD.techMapping[opp.technician_id];

        if (!ghlTech) {
          logger.debug(`Tech ID ${opp.technician_id} not mapped to GHL for: ${opp.name}`);
          stats.skipped++;
          continue;
        }

        // Check if already has same tech (single value comparison)
        // GHL stores as array for multi-select, so we compare first element or string
        const currentTech = Array.isArray(opp.current_tech)
          ? opp.current_tech[0]
          : opp.current_tech;

        if (currentTech === ghlTech) {
          stats.skipped++;
          continue;
        }

        // Update GHL opportunity with single technician
        // For multi-select field, still pass as array but with single value
        const customFields = [
          {
            id: GHL_TECHS_FIELD.id,
            value: [ghlTech]  // Single tech in array for multi-select field
          }
        ];

        await getGHLClient().put(`/opportunities/${opp.ghl_id}`, {
          customFields
        });

        // Update local database
        await client.query(`
          UPDATE ${SCHEMA.ghl}.ghl_opportunities
          SET custom_fields = jsonb_set(
            COALESCE(custom_fields, '{}'::jsonb),
            '{techs}',
            $2::jsonb
          ),
          local_updated_at = NOW()
          WHERE ghl_id = $1
        `, [opp.ghl_id, JSON.stringify(ghlTech)]);

        logger.debug(`Updated tech for: ${opp.name} → ${ghlTech} (${opp.position})`);
        stats.updated++;

        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        logger.error(`Failed to sync tech for ${opp.name}:`, error.message);
        stats.failed++;
      }
    }

  } catch (error) {
    logger.error('Step 4 error:', error.message);
  }

  return stats;
}

/**
 * Main sync function
 */
export async function runGHLSync() {
  const startTime = Date.now();
  logger.info('═'.repeat(60));
  logger.info('Starting GHL Sync...');
  logger.info('═'.repeat(60));

  const client = await getPool().connect();
  const locationId = process.env.GHL_LOCATION_ID;

  try {
    // Get last sync time (default to 24 hours ago)
    const lastSyncResult = await client.query(`
      SELECT MAX(completed_at) as last_sync
      FROM ${SCHEMA.ghl}.ghl_sync_log
      WHERE sync_type = 'incremental' AND status = 'completed'
    `);
    const lastSyncTime = lastSyncResult.rows[0]?.last_sync || new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Log sync start
    const syncLogResult = await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_sync_log (sync_type, direction, status, triggered_by, started_at)
      VALUES ('incremental', 'st_to_ghl', 'started', 'scheduled', NOW())
      RETURNING id
    `);
    const syncLogId = syncLogResult.rows[0].id;

    // Run all steps
    const step1Stats = await syncNewCustomersToGHL(client, locationId, lastSyncTime);
    const step2Stats = await updateAppointmentScheduledStage(client);
    const step3Stats = await updateProposalSentStage(client, locationId);
    const step4Stats = await syncTechniciansToGHL(client);

    // Log sync completion
    const totalRecords = step1Stats.synced + step2Stats.moved + step3Stats.synced + step4Stats.updated;
    const totalFailed = step1Stats.failed + step2Stats.failed + step3Stats.failed + step4Stats.failed;

    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_sync_log
      SET status = 'completed',
          records_created = $2,
          records_updated = $3,
          records_failed = $4,
          completed_at = NOW(),
          duration_ms = $5
      WHERE id = $1
    `, [syncLogId, step1Stats.synced, step2Stats.moved + step3Stats.synced + step4Stats.updated, totalFailed, Date.now() - startTime]);

    logger.info('═'.repeat(60));
    logger.info('GHL Sync Complete:');
    logger.info(`  Step 1 (New Customers): ${step1Stats.synced} synced, ${step1Stats.failed} failed`);
    logger.info(`  Step 2 (Appointments):  ${step2Stats.moved} moved, ${step2Stats.failed} failed`);
    logger.info(`  Step 3 (Estimates):     ${step3Stats.synced} synced, ${step3Stats.failed} failed`);
    logger.info(`  Step 4 (Technicians):   ${step4Stats.updated} updated, ${step4Stats.skipped} skipped`);
    logger.info(`  Duration: ${Date.now() - startTime}ms`);
    logger.info('═'.repeat(60));

    return { step1Stats, step2Stats, step3Stats, step4Stats, duration: Date.now() - startTime };

  } catch (error) {
    logger.error({
      err: error,
      errorMessage: error.message,
      errorCode: error.code,
      errorDetail: error.detail,
      errorStack: error.stack?.split('\n').slice(0, 5).join('\n')
    }, 'GHL Sync failed');
    throw error;
  } finally {
    client.release();
  }
}

// Scheduler
let syncJob = null;
let isRunning = false;

export function startGHLSyncScheduler() {
  if (isRunning) {
    logger.warn('GHL Sync scheduler already running');
    return;
  }

  isRunning = true;
  const cronSchedule = process.env.GHL_SYNC_CRON || '*/5 * * * *'; // Every 5 minutes

  logger.info(`Starting GHL Sync scheduler: ${cronSchedule}`);

  syncJob = cron.schedule(cronSchedule, async () => {
    try {
      await runGHLSync();
    } catch (error) {
      logger.error({
        err: error,
        errorMessage: error.message,
        errorCode: error.code,
        errorDetail: error.detail,
        errorHint: error.hint
      }, 'Scheduled GHL sync failed');
    }
  });

  // Run immediately on start
  runGHLSync().catch(err => logger.error({
    err: err,
    errorMessage: err.message,
    errorCode: err.code,
    errorDetail: err.detail,
    errorHint: err.hint
  }, 'Initial GHL sync failed'));
}

export function stopGHLSyncScheduler() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
  }
  isRunning = false;
  logger.info('GHL Sync scheduler stopped');
}

// If run directly
if (process.argv[1]?.endsWith('ghl-sync.worker.js')) {
  logger.info('Starting GHL Sync Worker...');
  startGHLSyncScheduler();

  process.on('SIGINT', () => {
    stopGHLSyncScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopGHLSyncScheduler();
    process.exit(0);
  });
}

export default {
  runGHLSync,
  startGHLSyncScheduler,
  stopGHLSyncScheduler
};
