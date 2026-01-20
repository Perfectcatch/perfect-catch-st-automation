/**
 * Job Stage Sync Worker
 * Automatically syncs GHL opportunity stages based on ServiceTitan job/estimate status
 *
 * Schedule: Every 5 minutes
 *
 * This worker:
 * 1. Monitors job_relationships for status changes
 * 2. Updates GHL opportunity stages based on ST job/estimate status
 * 3. Detects and links Sales → Service job relationships
 */

import { BaseWorker } from '../base.js';
import { getPool } from '../../services/sync/sync-base.js';
import { updateOpportunityStage } from '../../integrations/ghl/pipelines.js';
import {
  GHL_STAGES,
  ST_SALES_JOB_STATUS_TO_GHL_STAGE,
  ST_SERVICE_JOB_STATUS_TO_GHL_STAGE,
  ST_ESTIMATE_STATUS_TO_GHL_STAGE,
  shouldAllowStageTransition,
  isSalesJob,
  isServiceJob
} from '../../config/ghl-stages.js';

const SCHEMA = {
  workflow: 'workflow',
  st: 'public',
  ghl: 'public'
};

class JobStageSyncWorker extends BaseWorker {
  constructor() {
    super('job-stage-sync', {
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    const results = {
      processed: 0,
      stageUpdates: 0,
      relationshipsLinked: 0,
      skipped: 0,
      errors: 0
    };

    // Step 1: Process relationships that need stage updates
    await this.processJobStageUpdates(results);

    // Step 2: Detect and link Sales → Service job relationships
    await this.detectAndLinkServiceJobs(results);

    // Step 3: Refresh job/estimate statuses in relationships
    await this.refreshRelationshipStatuses(results);

    return results;
  }

  /**
   * Process job relationships and update GHL stages as needed
   */
  async processJobStageUpdates(results) {
    const client = await getPool().connect();

    try {
      // Get relationships with GHL opportunities that may need stage updates
      // Note: Using raw_st_jobs which has the freshest synced data
      const { rows: relationships } = await client.query(`
        SELECT
          jr.*,
          sj.status as current_sales_job_status,
          se.status as current_estimate_status,
          svj.status as current_service_job_status
        FROM ${SCHEMA.workflow}.job_relationships jr
        LEFT JOIN ${SCHEMA.st}.raw_st_jobs sj ON jr.sales_job_id = sj.st_id
        LEFT JOIN ${SCHEMA.st}.st_estimates se ON jr.sales_estimate_id = se.st_id
        LEFT JOIN ${SCHEMA.st}.raw_st_jobs svj ON jr.service_job_id = svj.st_id
        WHERE jr.ghl_opportunity_id IS NOT NULL
        ORDER BY jr.updated_at DESC
        LIMIT 100
      `);

      for (const rel of relationships) {
        try {
          results.processed++;

          // Determine target stage based on current ST statuses
          const targetStage = this.determineTargetStage(rel);

          if (!targetStage) {
            results.skipped++;
            continue;
          }

          // Check if stage changed
          if (targetStage === rel.current_ghl_stage_id) {
            results.skipped++;
            continue;
          }

          // Check if transition should be allowed (forward only, except to LOST)
          if (!shouldAllowStageTransition(rel.current_ghl_stage_id, targetStage)) {
            await this.log('debug', 'Stage transition not allowed (backward move)', {
              opportunityId: rel.ghl_opportunity_id,
              currentStage: rel.current_ghl_stage_id,
              targetStage
            });
            results.skipped++;
            continue;
          }

          // Update GHL opportunity
          await updateOpportunityStage(rel.ghl_opportunity_id, targetStage);

          // Get stage name for logging
          const stageName = this.getStageNameForId(targetStage);

          // Record stage history
          await client.query(`
            INSERT INTO ${SCHEMA.workflow}.job_stage_history (
              job_relationship_id,
              from_stage_id, from_stage_name,
              to_stage_id, to_stage_name,
              trigger_type,
              trigger_job_id, trigger_job_status,
              trigger_estimate_id, trigger_estimate_status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            rel.id,
            rel.current_ghl_stage_id,
            rel.current_ghl_stage_name,
            targetStage,
            stageName,
            'st_sync',
            rel.service_job_id || rel.sales_job_id,
            rel.current_service_job_status || rel.current_sales_job_status,
            rel.sales_estimate_id,
            rel.current_estimate_status
          ]);

          // Update relationship record
          await client.query(`
            UPDATE ${SCHEMA.workflow}.job_relationships
            SET
              previous_ghl_stage_id = current_ghl_stage_id,
              current_ghl_stage_id = $2,
              current_ghl_stage_name = $3,
              last_ghl_sync_at = NOW(),
              updated_at = NOW()
            WHERE id = $1
          `, [rel.id, targetStage, stageName]);

          await this.log('info', 'Updated opportunity stage', {
            opportunityId: rel.ghl_opportunity_id,
            fromStage: rel.current_ghl_stage_name,
            toStage: stageName,
            trigger: rel.current_service_job_status || rel.current_sales_job_status
          });

          results.stageUpdates++;
        } catch (error) {
          await this.log('error', 'Failed to process relationship', {
            relationshipId: rel.id,
            error: error.message
          });
          results.errors++;
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Determine the target GHL stage based on current ST statuses
   */
  determineTargetStage(rel) {
    // Priority: Service job status > Estimate status > Sales job status

    // 1. Service job takes priority (install workflow)
    if (rel.service_job_id && rel.current_service_job_status) {
      const serviceStage = ST_SERVICE_JOB_STATUS_TO_GHL_STAGE[rel.current_service_job_status];
      if (serviceStage) return serviceStage;
    }

    // 2. Estimate status (Sold/Lost take priority)
    if (rel.sales_estimate_id && rel.current_estimate_status) {
      const estStage = ST_ESTIMATE_STATUS_TO_GHL_STAGE[rel.current_estimate_status];
      if (estStage === GHL_STAGES.JOB_SOLD || estStage === GHL_STAGES.LOST) {
        return estStage;
      }
    }

    // 3. Sales job status
    if (rel.sales_job_id && rel.current_sales_job_status) {
      return ST_SALES_JOB_STATUS_TO_GHL_STAGE[rel.current_sales_job_status];
    }

    // 4. Fall back to estimate stage
    if (rel.sales_estimate_id && rel.current_estimate_status) {
      return ST_ESTIMATE_STATUS_TO_GHL_STAGE[rel.current_estimate_status];
    }

    return null;
  }

  /**
   * Detect service jobs that should be linked to existing sales job relationships
   */
  async detectAndLinkServiceJobs(results) {
    const client = await getPool().connect();

    try {
      // Find service jobs that match customer/location of relationships without service jobs
      const { rows: matches } = await client.query(`
        WITH unlinked_relationships AS (
          SELECT
            jr.id as relationship_id,
            jr.customer_id,
            jr.location_id,
            jr.sales_job_id,
            jr.ghl_opportunity_id
          FROM ${SCHEMA.workflow}.job_relationships jr
          WHERE jr.service_job_id IS NULL
            AND jr.ghl_opportunity_id IS NOT NULL
            AND jr.current_ghl_stage_id IN ($1, $2)  -- Job Sold or subsequent
        ),
        potential_service_jobs AS (
          SELECT
            j.st_id as service_job_id,
            j.job_number as service_job_number,
            j.job_status as service_job_status,
            j.customer_id,
            j.location_id,
            bu.st_id as service_bu_id,
            bu.name as service_bu_name
          FROM ${SCHEMA.st}.st_jobs j
          JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
          WHERE (bu.name ILIKE '%install%' OR bu.name ILIKE '%service%' OR bu.name ILIKE '%construction%')
            AND j.st_created_on >= NOW() - INTERVAL '30 days'
            AND NOT EXISTS (
              SELECT 1 FROM ${SCHEMA.workflow}.job_relationships jr2
              WHERE jr2.service_job_id = j.st_id
            )
        )
        SELECT
          ur.relationship_id,
          ur.ghl_opportunity_id,
          psj.service_job_id,
          psj.service_job_number,
          psj.service_job_status,
          psj.service_bu_id,
          psj.service_bu_name
        FROM unlinked_relationships ur
        JOIN potential_service_jobs psj
          ON ur.customer_id = psj.customer_id
          AND (ur.location_id = psj.location_id OR ur.location_id IS NULL OR psj.location_id IS NULL)
        ORDER BY ur.relationship_id
        LIMIT 50
      `, [GHL_STAGES.JOB_SOLD, GHL_STAGES.INSTALL_SCHEDULED]);

      for (const match of matches) {
        try {
          // Link the service job
          await client.query(`
            UPDATE ${SCHEMA.workflow}.job_relationships
            SET
              service_job_id = $2,
              service_job_number = $3,
              service_job_status = $4,
              service_business_unit_id = $5,
              service_business_unit_name = $6,
              updated_at = NOW()
            WHERE id = $1
          `, [
            match.relationship_id,
            match.service_job_id,
            match.service_job_number,
            match.service_job_status,
            match.service_bu_id,
            match.service_bu_name
          ]);

          await this.log('info', 'Linked service job to relationship', {
            relationshipId: match.relationship_id,
            serviceJobId: match.service_job_id,
            serviceJobNumber: match.service_job_number
          });

          results.relationshipsLinked++;
        } catch (error) {
          await this.log('error', 'Failed to link service job', {
            relationshipId: match.relationship_id,
            serviceJobId: match.service_job_id,
            error: error.message
          });
          results.errors++;
        }
      }
    } finally {
      client.release();
    }
  }

  /**
   * Refresh job/estimate statuses in relationship records
   */
  async refreshRelationshipStatuses(results) {
    const client = await getPool().connect();

    try {
      // Update sales job status (using raw_st_jobs for fresh data)
      await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          sales_job_status = sj.status,
          last_st_job_sync_at = NOW()
        FROM ${SCHEMA.st}.raw_st_jobs sj
        WHERE jr.sales_job_id = sj.st_id
          AND (jr.sales_job_status IS DISTINCT FROM sj.status)
      `);

      // Update service job status
      await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          service_job_status = sj.status,
          last_st_job_sync_at = NOW()
        FROM ${SCHEMA.st}.raw_st_jobs sj
        WHERE jr.service_job_id = sj.st_id
          AND (jr.service_job_status IS DISTINCT FROM sj.status)
      `);

      // Update estimate status
      await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          sales_estimate_status = se.status,
          estimate_total = se.total,
          last_st_estimate_sync_at = NOW()
        FROM ${SCHEMA.st}.st_estimates se
        WHERE jr.sales_estimate_id = se.st_id
          AND (jr.sales_estimate_status IS DISTINCT FROM se.status
               OR jr.estimate_total IS DISTINCT FROM se.total)
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Get stage name for a stage ID
   */
  getStageNameForId(stageId) {
    const stageNames = {
      // Sales Pipeline stages
      [GHL_STAGES.NEW_LEAD]: 'New Lead',
      [GHL_STAGES.CONTACTED]: 'Contacted',
      [GHL_STAGES.APPOINTMENT_SCHEDULED]: 'Appointment Scheduled',
      [GHL_STAGES.PROPOSAL_SENT]: 'Appointment Completed - Proposal Sent',
      [GHL_STAGES.ESTIMATE_FOLLOWUP]: 'Estimate Follow-Up',
      [GHL_STAGES.JOB_SOLD]: 'Job Sold',
      [GHL_STAGES.INSTALL_SCHEDULED]: 'Install Scheduled',
      [GHL_STAGES.INSTALL_IN_PROGRESS]: 'Install In Progress',
      [GHL_STAGES.INSTALL_COMPLETE]: 'Install Complete',
      [GHL_STAGES.CLOSED_WON]: 'Closed Won',
      [GHL_STAGES.LOST]: 'Estimate Lost / Not Approved',
      // Install Pipeline stages (hardcoded IDs from GHL)
      'acf34a4c-30c1-4511-85ed-d384f0dc8365': 'Install: Estimate Approved',
      'e8731690-0d3a-43a9-bed6-921c70027099': 'Install: Pre-Install Planning',
      '67fb706b-9213-475c-a74f-6ce2f787a2cb': 'Install: Scheduled / Ready',
      '56e0e29a-61a9-4ec9-9e86-2ce22a256fbe': 'Install: In Progress / On Site',
      '47780057-58fa-495f-80dc-e1f4cf8f4862': 'Install: On Hold',
      'da971a59-2496-4b7c-9e32-0c0ee82fde76': 'Install: Job Completed'
    };
    return stageNames[stageId] || 'Unknown';
  }
}

export default new JobStageSyncWorker();
