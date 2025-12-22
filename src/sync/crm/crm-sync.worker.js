/**
 * CRM Sync Worker
 * Syncs ServiceTitan data to Perfect Catch CRM (Payload CMS)
 *
 * REPLICATES GHL SYNC LOGIC EXACTLY:
 *
 * Step 1: New ST customers → CRM contacts + opportunities (Contacted stage)
 * Step 2: Jobs with appointments → Appointment Scheduled stage
 * Step 3: Estimates created → Proposal Sent stage with $ value
 * Step 4: Estimates sold → Job Sold stage
 * Step 5: Install jobs → Move to Install Pipeline
 * Step 6: Technician assignments → Update technician field
 *
 * Business Unit → Pipeline Mapping:
 * - Pool/Electrical Sales & Service → SALES PIPELINE
 * - Pool/Electrical Install → INSTALL PIPELINE
 */

import pg from 'pg';
import cron from 'node-cron';
import { createLogger } from '../../lib/logger.js';
import {
  findContactBySTCustomerId,
  createContact,
  findOpportunityBySTJobId,
  findOpportunityBySTCustomerId,
  createOpportunity,
  updateOpportunity,
} from '../../integrations/crm/crm-api-client.js';
import { CRM_PIPELINES, getPipelineForBusinessUnit, PROTECTED_STAGES } from '../../config/crm-pipelines.js';

const { Pool } = pg;
const logger = createLogger('crm-sync-worker');

// Shorthand for pipelines
const SALES = CRM_PIPELINES.SALES_PIPELINE;
const INSTALL = CRM_PIPELINES.INSTALL_PIPELINE;

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
 * Convert business unit name to slug for CRM
 * "Pool - Sales" → "pool-sales"
 * "Electrical - Install" → "electrical-install"
 */
function businessUnitToSlug(buName) {
  if (!buName) return null;
  // Remove spaces around dashes and convert to lowercase
  return buName.toLowerCase().replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
}

/**
 * Step 1: Sync new customers to CRM as contacts + create opportunities in Contacted stage
 * Same as GHL Step 1: Creates contact and opportunity in CONTACTED stage
 */
async function syncNewCustomersToCRM(client, sinceDays = 14) {
  logger.info(`Step 1: Syncing new customers to CRM (Contacted stage)...`);

  const stats = { synced: 0, skipped: 0, failed: 0 };
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  try {
    // Get customers with jobs that don't have CRM contacts yet
    const customersResult = await client.query(`
      SELECT DISTINCT
        c.st_id, c.name, c.email, c.phone,
        c.address_line1, c.city, c.state, c.zip,
        c.first_name, c.last_name, c.st_created_on,
        j.st_id as first_job_id,
        j.job_number as first_job_number,
        bu.name as business_unit
      FROM public.st_customers c
      JOIN public.st_jobs j ON j.customer_id = c.st_id
      LEFT JOIN public.st_business_units bu ON j.business_unit_id = bu.st_id
      LEFT JOIN crm.crm_contacts cc ON cc.st_customer_id = c.st_id
      WHERE j.st_created_on >= $1
        AND cc.id IS NULL
      ORDER BY c.st_created_on DESC
      LIMIT 50
    `, [sinceDate]);

    logger.info(`Found ${customersResult.rows.length} new customers to sync`);

    for (const customer of customersResult.rows) {
      try {
        // Parse name
        let firstName = customer.first_name || customer.name?.split(' ')[0] || 'Unknown';
        let lastName = customer.last_name || customer.name?.split(' ').slice(1).join(' ') || '';
        if (!lastName.trim()) {
          if (customer.name && customer.name.includes(' ')) {
            const parts = customer.name.split(' ');
            firstName = parts[0];
            lastName = parts.slice(1).join(' ');
          } else {
            lastName = 'Customer';
          }
        }

        // Create contact in CRM
        const contactData = {
          firstName,
          lastName,
          type: 'customer',
          source: 'servicetitan',
          serviceTitanId: String(customer.st_id),
        };
        if (customer.email) contactData.email = customer.email;
        if (customer.phone) contactData.phone = customer.phone;
        if (customer.address_line1 || customer.city || customer.state || customer.zip) {
          contactData.address = {
            street: customer.address_line1 || '',
            city: customer.city || '',
            state: customer.state || '',
            zip: customer.zip || '',
          };
        }

        const contact = await createContact(contactData);
        logger.debug(`Created contact: ${customer.name}`);

        // Determine pipeline based on business unit
        const pipeline = getPipelineForBusinessUnit(customer.business_unit);

        // Create opportunity in CONTACTED stage (same as GHL)
        const oppData = {
          title: `${customer.name} - New Customer Qualifying`,
          contact: contact.id,
          pipeline: pipeline.id,
          stage: pipeline.id === INSTALL.id
            ? INSTALL.stages.ESTIMATE_APPROVED.id
            : SALES.stages.CONTACTED.id,
          value: 0,
          status: 'open',
          serviceTitanId: String(customer.first_job_id),
          serviceTitanJobNumber: String(customer.first_job_number),
          businessUnit: businessUnitToSlug(customer.business_unit),
        };

        const opportunity = await createOpportunity(oppData);
        logger.debug(`Created opportunity: ${oppData.title}`);

        // Track in crm schema
        await client.query(`
          INSERT INTO crm.crm_contacts (
            crm_id, st_customer_id, first_name, last_name, email, phone,
            sync_status, last_synced_at, full_data
          ) VALUES ($1, $2, $3, $4, $5, $6, 'synced', NOW(), $7)
          ON CONFLICT (st_customer_id) DO UPDATE SET
            crm_id = EXCLUDED.crm_id,
            sync_status = 'synced',
            last_synced_at = NOW()
        `, [
          contact.id,
          customer.st_id,
          firstName,
          lastName,
          customer.email,
          customer.phone,
          JSON.stringify(contact)
        ]);

        // Track opportunity
        await client.query(`
          INSERT INTO crm.crm_opportunities (
            crm_id, st_customer_id, st_job_id, crm_pipeline_slug, crm_stage_slug,
            monetary_value, status, sync_status, last_synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'synced', NOW())
          ON CONFLICT (st_job_id) DO UPDATE SET
            crm_id = EXCLUDED.crm_id,
            sync_status = 'synced',
            last_synced_at = NOW()
        `, [
          opportunity.id,
          customer.st_id,
          customer.first_job_id,
          pipeline.slug,
          pipeline.id === INSTALL.id ? 'estimate-approved' : 'contacted',
          0,
          'open'
        ]);

        stats.synced++;
        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to sync customer ${customer.name}: ${error.message}`);
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
 * Same as GHL Step 2: Jobs with appointments → Appointment Scheduled
 */
async function updateAppointmentScheduledStage(client) {
  logger.info('Step 2: Updating Appointment Scheduled stage...');

  const stats = { moved: 0, skipped: 0, failed: 0 };

  try {
    // Get opportunities in Contacted stage that have scheduled appointments
    const oppsResult = await client.query(`
      SELECT DISTINCT ON (co.st_customer_id)
        co.crm_id as opportunity_id,
        co.st_customer_id,
        co.crm_stage_slug,
        c.name as customer_name,
        j.st_id as job_id,
        j.job_number
      FROM crm.crm_opportunities co
      JOIN public.st_customers c ON co.st_customer_id = c.st_id
      JOIN public.st_jobs j ON j.customer_id = c.st_id
      WHERE co.crm_pipeline_slug = 'sales'
        AND co.crm_stage_slug = 'contacted'
        AND EXISTS (
          SELECT 1 FROM public.st_appointments a
          WHERE a.job_id = j.st_id
        )
      ORDER BY co.st_customer_id, j.st_created_on DESC
    `);

    logger.info(`Found ${oppsResult.rows.length} opportunities to move to Appointment Scheduled`);

    for (const opp of oppsResult.rows) {
      try {
        // Update opportunity in CRM
        await updateOpportunity(opp.opportunity_id, {
          stage: SALES.stages.APPOINTMENT_SCHEDULED.id,
          serviceTitanId: String(opp.job_id),
          serviceTitanJobNumber: String(opp.job_number),
        });

        // Update local tracking
        await client.query(`
          UPDATE crm.crm_opportunities
          SET crm_stage_slug = 'appointment-scheduled',
              st_job_id = $2,
              last_synced_at = NOW()
          WHERE crm_id = $1
        `, [opp.opportunity_id, opp.job_id]);

        logger.debug(`Moved to Appointment Scheduled: ${opp.customer_name}`);
        stats.moved++;
        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to update stage for ${opp.customer_name}: ${error.message}`);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 2 error:', error.message);
  }

  return stats;
}

/**
 * Step 3: Sync estimates to Proposal Sent stage
 * Same as GHL Step 3: Estimates with $ value → Proposal Sent
 * IMPORTANT: Never moves opportunities backward - respects protected stages
 */
async function syncEstimatesToProposalSent(client, sinceDays = 14) {
  logger.info(`Step 3: Syncing estimates to Proposal Sent stage...`);

  const stats = { synced: 0, updated: 0, skipped: 0, failed: 0 };
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - sinceDays);

  try {
    // Get estimates with their job and customer data
    // EXCLUDE opportunities already in Job Sold, Estimate Lost, or Install Pipeline
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
        j.job_number,
        bu.name as business_unit,
        cc.crm_id as crm_contact_id,
        co.crm_id as existing_opp_id,
        co.crm_pipeline_slug as existing_pipeline,
        co.crm_stage_slug as existing_stage
      FROM public.st_estimates e
      JOIN public.st_customers c ON e.customer_id = c.st_id
      JOIN public.st_jobs j ON e.job_id = j.st_id
      LEFT JOIN public.st_business_units bu ON j.business_unit_id = bu.st_id
      LEFT JOIN crm.crm_contacts cc ON cc.st_customer_id = c.st_id
      LEFT JOIN crm.crm_opportunities co ON co.st_customer_id = c.st_id
      WHERE e.st_created_on >= $1
        AND e.total > 0
      ORDER BY e.st_created_on DESC
      LIMIT 100
    `, [sinceDate]);

    logger.info(`Found ${estimatesResult.rows.length} estimates to process`);

    for (const estimate of estimatesResult.rows) {
      try {
        // Skip if no CRM contact
        if (!estimate.crm_contact_id) {
          stats.skipped++;
          continue;
        }

        const pipeline = getPipelineForBusinessUnit(estimate.business_unit);
        const isInstallPipeline = pipeline.id === INSTALL.id;

        // Format opportunity name like GHL
        const title = `${estimate.customer_name} - ${estimate.estimate_name || 'Estimate'} - $${Number(estimate.total || 0).toLocaleString()}`;

        if (estimate.existing_opp_id) {
          // IMPORTANT: Skip if opportunity is already in a protected stage
          const protectedStageSlugs = ['job-sold', 'estimate-lost'];
          if (protectedStageSlugs.includes(estimate.existing_stage)) {
            logger.debug(`Skipping ${estimate.customer_name} - already in ${estimate.existing_stage}`);
            stats.skipped++;
            continue;
          }

          // Skip if already in Install Pipeline
          if (estimate.existing_pipeline === 'install') {
            logger.debug(`Skipping ${estimate.customer_name} - already in Install Pipeline`);
            stats.skipped++;
            continue;
          }

          // Update existing opportunity - value and title only (like GHL)
          await updateOpportunity(estimate.existing_opp_id, {
            title,
            value: Number(estimate.total) || 0,
            serviceTitanEstimateId: String(estimate.estimate_id),
            serviceTitanJobNumber: String(estimate.job_number),
            estimateName: estimate.estimate_name,
            businessUnit: businessUnitToSlug(estimate.business_unit),
            // Only update stage if moving forward
            stage: SALES.stages.PROPOSAL_SENT.id,
          });

          // Update local tracking
          await client.query(`
            UPDATE crm.crm_opportunities
            SET st_estimate_id = $2,
                monetary_value = $3,
                crm_stage_slug = 'proposal-sent',
                last_synced_at = NOW()
            WHERE crm_id = $1
          `, [estimate.existing_opp_id, estimate.estimate_id, estimate.total || 0]);

          stats.updated++;
          logger.debug(`Updated estimate: ${title}`);

        } else {
          // Create new opportunity in Proposal Sent stage
          const oppData = {
            title,
            contact: parseInt(estimate.crm_contact_id, 10),
            pipeline: pipeline.id,
            stage: isInstallPipeline
              ? INSTALL.stages.ESTIMATE_APPROVED.id
              : SALES.stages.PROPOSAL_SENT.id,
            value: Number(estimate.total) || 0,
            status: 'open',
            serviceTitanId: String(estimate.job_id),
            serviceTitanEstimateId: String(estimate.estimate_id),
            serviceTitanJobNumber: String(estimate.job_number),
            estimateName: estimate.estimate_name,
            businessUnit: businessUnitToSlug(estimate.business_unit),
          };

          const opportunity = await createOpportunity(oppData);

          // Track in crm schema
          await client.query(`
            INSERT INTO crm.crm_opportunities (
              crm_id, st_customer_id, st_job_id, st_estimate_id,
              crm_pipeline_slug, crm_stage_slug, monetary_value,
              status, sync_status, last_synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'synced', NOW())
            ON CONFLICT (st_job_id) DO UPDATE SET
              crm_id = EXCLUDED.crm_id,
              st_estimate_id = EXCLUDED.st_estimate_id,
              monetary_value = EXCLUDED.monetary_value,
              crm_stage_slug = EXCLUDED.crm_stage_slug,
              sync_status = 'synced',
              last_synced_at = NOW()
          `, [
            opportunity.id,
            estimate.customer_id,
            estimate.job_id,
            estimate.estimate_id,
            pipeline.slug,
            isInstallPipeline ? 'estimate-approved' : 'proposal-sent',
            estimate.total || 0,
            'open'
          ]);

          stats.synced++;
          logger.debug(`Created: ${title}`);
        }

        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to sync estimate for ${estimate.customer_name}: ${error.message}`);
        stats.failed++;
      }
    }

  } catch (error) {
    logger.error('Step 3 error:', error.message);
  }

  return stats;
}

/**
 * Step 4: Move sold estimates to Job Sold stage
 * Same as GHL: estimate_approved event → Job Sold stage
 */
async function syncSoldEstimates(client) {
  logger.info('Step 4: Syncing sold estimates to Job Sold stage...');

  const stats = { moved: 0, skipped: 0, failed: 0 };

  try {
    // Get estimates with status 'Sold' that aren't in Job Sold stage yet
    const soldEstimatesResult = await client.query(`
      SELECT
        e.st_id as estimate_id,
        e.name as estimate_name,
        e.total,
        e.customer_id,
        e.job_id,
        c.name as customer_name,
        j.job_number,
        bu.name as business_unit,
        co.crm_id as opportunity_id,
        co.crm_stage_slug as current_stage
      FROM public.st_estimates e
      JOIN public.st_customers c ON e.customer_id = c.st_id
      JOIN public.st_jobs j ON e.job_id = j.st_id
      LEFT JOIN public.st_business_units bu ON j.business_unit_id = bu.st_id
      JOIN crm.crm_opportunities co ON co.st_customer_id = c.st_id
      WHERE e.status = 'Sold'
        AND co.crm_pipeline_slug = 'sales'
        AND co.crm_stage_slug != 'job-sold'
        AND co.crm_stage_slug != 'estimate-lost'
      ORDER BY e.st_modified_on DESC
      LIMIT 50
    `);

    logger.info(`Found ${soldEstimatesResult.rows.length} sold estimates to move to Job Sold`);

    for (const estimate of soldEstimatesResult.rows) {
      try {
        const title = `${estimate.customer_name} - ${estimate.estimate_name || 'Job Sold'} - $${Number(estimate.total || 0).toLocaleString()}`;

        // Update opportunity to Job Sold stage
        await updateOpportunity(estimate.opportunity_id, {
          title,
          stage: SALES.stages.JOB_SOLD.id,
          value: Number(estimate.total) || 0,
          status: 'won',
        });

        // Update local tracking
        await client.query(`
          UPDATE crm.crm_opportunities
          SET crm_stage_slug = 'job-sold',
              status = 'won',
              monetary_value = $2,
              last_synced_at = NOW()
          WHERE crm_id = $1
        `, [estimate.opportunity_id, estimate.total || 0]);

        logger.debug(`Moved to Job Sold: ${estimate.customer_name}`);
        stats.moved++;
        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to move to Job Sold for ${estimate.customer_name}: ${error.message}`);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 4 error:', error.message);
  }

  return stats;
}

/**
 * Step 5: Move opportunities from Sales Pipeline to Install Pipeline
 * Same as GHL: When install job is created, move from Job Sold to Install Pipeline
 */
async function moveToInstallPipeline(client) {
  logger.info('Step 5: Moving opportunities to Install Pipeline...');

  const stats = { moved: 0, skipped: 0, failed: 0 };

  try {
    // Find customers with:
    // 1. An opportunity in Job Sold stage (Sales Pipeline)
    // 2. A new Install business unit job
    const installJobsResult = await client.query(`
      SELECT
        ij.st_id as install_job_id,
        ij.job_number as install_job_number,
        ij.customer_id,
        c.name as customer_name,
        bu.name as business_unit,
        co.crm_id as opportunity_id,
        co.monetary_value
      FROM public.st_jobs ij
      JOIN public.st_business_units bu ON ij.business_unit_id = bu.st_id
      JOIN public.st_customers c ON ij.customer_id = c.st_id
      JOIN crm.crm_opportunities co ON co.st_customer_id = c.st_id
      WHERE bu.name LIKE '%Install%'
        AND co.crm_pipeline_slug = 'sales'
        AND co.crm_stage_slug = 'job-sold'
        AND ij.st_created_on >= NOW() - INTERVAL '14 days'
      ORDER BY ij.st_created_on DESC
    `);

    logger.info(`Found ${installJobsResult.rows.length} opportunities to move to Install Pipeline`);

    for (const job of installJobsResult.rows) {
      try {
        const title = `${job.customer_name} - Install Job #${job.install_job_number} - $${Number(job.monetary_value || 0).toLocaleString()}`;

        // Update opportunity - move to Install Pipeline
        await updateOpportunity(job.opportunity_id, {
          title,
          pipeline: INSTALL.id,
          stage: INSTALL.stages.ESTIMATE_APPROVED.id,
          serviceTitanId: String(job.install_job_id),
          serviceTitanJobNumber: String(job.install_job_number),
          businessUnit: businessUnitToSlug(job.business_unit),
        });

        // Update local tracking
        await client.query(`
          UPDATE crm.crm_opportunities
          SET crm_pipeline_slug = 'install',
              crm_stage_slug = 'estimate-approved',
              st_job_id = $2,
              last_synced_at = NOW()
          WHERE crm_id = $1
        `, [job.opportunity_id, job.install_job_id]);

        logger.info(`Moved to Install Pipeline: ${job.customer_name}`);
        stats.moved++;
        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to move to Install Pipeline for ${job.customer_name}: ${error.message}`);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 5 error:', error.message);
  }

  return stats;
}

/**
 * Step 6: Update Install Pipeline stages based on job status
 * Same as GHL: Track job progress through Install Pipeline stages
 */
async function updateInstallPipelineStages(client) {
  logger.info('Step 6: Updating Install Pipeline stages...');

  const stats = { updated: 0, skipped: 0, failed: 0 };

  try {
    // Get install opportunities and their current job status
    const installOppsResult = await client.query(`
      SELECT
        co.crm_id as opportunity_id,
        co.st_job_id,
        co.crm_stage_slug as current_stage,
        j.job_status,
        c.name as customer_name
      FROM crm.crm_opportunities co
      JOIN public.st_jobs j ON j.st_id = co.st_job_id
      JOIN public.st_customers c ON c.st_id = co.st_customer_id
      WHERE co.crm_pipeline_slug = 'install'
        AND co.crm_stage_slug != 'job-completed'
    `);

    logger.info(`Found ${installOppsResult.rows.length} install opportunities to check`);

    for (const opp of installOppsResult.rows) {
      try {
        let newStage = null;
        let newStageSlug = null;
        const status = opp.job_status?.toLowerCase() || '';

        // Map job status to Install Pipeline stage
        if (status.includes('completed')) {
          newStage = INSTALL.stages.JOB_COMPLETED;
          newStageSlug = 'job-completed';
        } else if (status.includes('in progress') || status.includes('working')) {
          newStage = INSTALL.stages.IN_PROGRESS;
          newStageSlug = 'in-progress';
        } else if (status.includes('scheduled')) {
          newStage = INSTALL.stages.SCHEDULED;
          newStageSlug = 'scheduled';
        } else if (status.includes('hold')) {
          newStage = INSTALL.stages.ON_HOLD;
          newStageSlug = 'on-hold';
        }

        // Skip if no stage change needed
        if (!newStage || newStageSlug === opp.current_stage) {
          stats.skipped++;
          continue;
        }

        // Update opportunity
        await updateOpportunity(opp.opportunity_id, {
          stage: newStage.id,
          status: newStageSlug === 'job-completed' ? 'won' : 'open',
        });

        // Update local tracking
        await client.query(`
          UPDATE crm.crm_opportunities
          SET crm_stage_slug = $2,
              status = $3,
              last_synced_at = NOW()
          WHERE crm_id = $1
        `, [opp.opportunity_id, newStageSlug, newStageSlug === 'job-completed' ? 'won' : 'open']);

        logger.debug(`Updated Install stage: ${opp.customer_name} → ${newStageSlug}`);
        stats.updated++;
        await new Promise(r => setTimeout(r, 150));

      } catch (error) {
        logger.error(`Failed to update Install stage for ${opp.customer_name}: ${error.message}`);
        stats.failed++;
      }
    }
  } catch (error) {
    logger.error('Step 6 error:', error.message);
  }

  return stats;
}

/**
 * Main sync function
 */
export async function runCRMSync(options = {}) {
  const sinceDays = options.sinceDays || 14;
  const startTime = Date.now();

  logger.info('═'.repeat(60));
  logger.info(`Starting CRM Sync (last ${sinceDays} days)...`);
  logger.info('Replicating GHL sync logic exactly');
  logger.info('═'.repeat(60));

  const client = await getPool().connect();

  try {
    // Log sync start
    await client.query(`
      INSERT INTO crm.crm_sync_log (sync_type, direction, status, triggered_by, started_at)
      VALUES ('incremental', 'st_to_crm', 'started', $1, NOW())
    `, [options.triggeredBy || 'scheduled']);

    // Run all sync steps (same as GHL)
    const step1Stats = await syncNewCustomersToCRM(client, sinceDays);
    const step2Stats = await updateAppointmentScheduledStage(client);
    const step3Stats = await syncEstimatesToProposalSent(client, sinceDays);
    const step4Stats = await syncSoldEstimates(client);
    const step5Stats = await moveToInstallPipeline(client);
    const step6Stats = await updateInstallPipelineStages(client);

    const duration = Date.now() - startTime;

    // Calculate totals
    const totalCreated = step1Stats.synced + step3Stats.synced;
    const totalUpdated = step2Stats.moved + step3Stats.updated + step4Stats.moved + step5Stats.moved + step6Stats.updated;
    const totalFailed = step1Stats.failed + step2Stats.failed + step3Stats.failed + step4Stats.failed + step5Stats.failed + step6Stats.failed;

    // Log completion
    await client.query(`
      INSERT INTO crm.crm_sync_log (sync_type, direction, status, triggered_by, started_at, completed_at, duration_ms, records_created, records_updated, records_failed)
      VALUES ('incremental', 'st_to_crm', 'completed', $1, NOW() - interval '${duration} milliseconds', NOW(), $2, $3, $4, $5)
    `, [
      options.triggeredBy || 'scheduled',
      duration,
      totalCreated,
      totalUpdated,
      totalFailed
    ]);

    logger.info('═'.repeat(60));
    logger.info('CRM Sync Complete:');
    logger.info(`  Step 1 (New Customers → Contacted): ${step1Stats.synced} synced, ${step1Stats.failed} failed`);
    logger.info(`  Step 2 (Appointments → Scheduled):  ${step2Stats.moved} moved, ${step2Stats.failed} failed`);
    logger.info(`  Step 3 (Estimates → Proposal Sent): ${step3Stats.synced} created, ${step3Stats.updated} updated, ${step3Stats.failed} failed`);
    logger.info(`  Step 4 (Sold → Job Sold):           ${step4Stats.moved} moved, ${step4Stats.failed} failed`);
    logger.info(`  Step 5 (→ Install Pipeline):        ${step5Stats.moved} moved, ${step5Stats.failed} failed`);
    logger.info(`  Step 6 (Install Stage Updates):     ${step6Stats.updated} updated, ${step6Stats.failed} failed`);
    logger.info(`  Duration: ${duration}ms`);
    logger.info('═'.repeat(60));

    return {
      step1Stats, step2Stats, step3Stats, step4Stats, step5Stats, step6Stats,
      duration, totalCreated, totalUpdated, totalFailed
    };

  } catch (error) {
    logger.error({
      err: error,
      errorMessage: error.message,
      errorStack: error.stack?.split('\n').slice(0, 5).join('\n')
    }, 'CRM Sync failed');
    throw error;
  } finally {
    client.release();
  }
}

// Scheduler
let syncJob = null;
let isRunning = false;

export function startCRMSyncScheduler() {
  if (isRunning) {
    logger.warn('CRM Sync scheduler already running');
    return;
  }

  if (process.env.CRM_SYNC_ENABLED !== 'true') {
    logger.info('CRM Sync disabled (CRM_SYNC_ENABLED != true)');
    return;
  }

  isRunning = true;
  const cronSchedule = process.env.CRM_SYNC_CRON || '*/5 * * * *';

  logger.info(`Starting CRM Sync scheduler: ${cronSchedule}`);

  syncJob = cron.schedule(cronSchedule, async () => {
    try {
      await runCRMSync({ triggeredBy: 'scheduled' });
    } catch (error) {
      logger.error('Scheduled CRM sync failed:', error.message);
    }
  });

  // Run immediately on start
  runCRMSync({ triggeredBy: 'startup' }).catch(err =>
    logger.error('Initial CRM sync failed:', err.message)
  );
}

export function stopCRMSyncScheduler() {
  if (syncJob) {
    syncJob.stop();
    syncJob = null;
  }
  isRunning = false;
  logger.info('CRM Sync scheduler stopped');
}

// If run directly
if (process.argv[1]?.endsWith('crm-sync.worker.js')) {
  logger.info('Starting CRM Sync Worker...');
  startCRMSyncScheduler();

  process.on('SIGINT', () => {
    stopCRMSyncScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopCRMSyncScheduler();
    process.exit(0);
  });
}

export default {
  runCRMSync,
  startCRMSyncScheduler,
  stopCRMSyncScheduler
};
