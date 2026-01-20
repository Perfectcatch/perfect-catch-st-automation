/**
 * Relationship Tracker Worker
 * Creates and maintains job_relationships records for GHL opportunity tracking
 *
 * Schedule: Every 3 minutes
 *
 * This worker:
 * 1. Creates job_relationships for new GHL opportunities
 * 2. Updates relationship records with customer/job/estimate data
 * 3. Ensures all opportunities are tracked for stage sync
 */

import { BaseWorker } from '../base.js';
import { getPool } from '../../services/sync/sync-base.js';
import { GHL_STAGES, GHL_PIPELINE_IDS } from '../../config/ghl-stages.js';

const SCHEMA = {
  workflow: 'workflow',
  st: 'public',
  ghl: 'public'
};

class RelationshipTrackerWorker extends BaseWorker {
  constructor() {
    super('relationship-tracker', {
      schedule: '*/3 * * * *', // Every 3 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    const results = {
      newRelationships: 0,
      updatedRelationships: 0,
      processed: 0,
      errors: 0
    };

    // Step 1: Create relationships for opportunities without one
    await this.createMissingRelationships(results);

    // Step 2: Update relationships with latest job/estimate data
    await this.enrichRelationships(results);

    return results;
  }

  /**
   * Create job_relationships records for GHL opportunities that don't have one
   */
  async createMissingRelationships(results) {
    const client = await getPool().connect();

    try {
      // Find GHL opportunities without a job_relationships record
      const { rows: untracked } = await client.query(`
        SELECT
          o.ghl_id,
          o.contact_id,
          o.pipeline_id,
          o.pipeline_stage_id,
          o.name,
          o.monetary_value,
          o.st_job_id,
          o.st_estimate_id,
          j.job_number as sales_job_number,
          j.status as sales_job_status,
          j.customer_id,
          j.location_id,
          j.business_unit_id as sales_bu_id,
          bu.name as sales_bu_name,
          c.name as customer_name,
          CONCAT_WS(', ', l.street, l.city, l.state, l.zip) as location_address,
          e.st_id as estimate_id,
          e.status as estimate_status,
          e.total as estimate_total
        FROM ${SCHEMA.ghl}.ghl_opportunities o
        LEFT JOIN raw_st_jobs j ON o.st_job_id = j.st_id
        LEFT JOIN raw_st_customers c ON j.customer_id = c.st_id
        LEFT JOIN st_locations l ON j.location_id = l.st_id
        LEFT JOIN raw_st_business_units bu ON j.business_unit_id = bu.st_id
        LEFT JOIN st_estimates e ON (o.st_estimate_id = e.st_id OR e.job_id = j.st_id)
        WHERE NOT EXISTS (
          SELECT 1 FROM ${SCHEMA.workflow}.job_relationships jr
          WHERE jr.ghl_opportunity_id = o.ghl_id
        )
        ORDER BY o.created_at DESC
        LIMIT 100
      `);

      for (const opp of untracked) {
        try {
          results.processed++;

          const customerId = opp.customer_id || opp.st_customer_id;

          if (!customerId) {
            await this.log('warn', 'Opportunity has no customer link, skipping', {
              opportunityId: opp.ghl_id
            });
            continue;
          }

          // Determine current stage name
          const stageName = this.getStageNameForId(opp.pipeline_stage_id);

          // Create relationship record
          await client.query(`
            INSERT INTO ${SCHEMA.workflow}.job_relationships (
              ghl_opportunity_id,
              ghl_contact_id,
              ghl_pipeline_id,
              sales_job_id,
              sales_job_number,
              sales_job_status,
              sales_estimate_id,
              sales_estimate_status,
              sales_business_unit_id,
              sales_business_unit_name,
              customer_id,
              customer_name,
              location_id,
              location_address,
              estimate_total,
              current_ghl_stage_id,
              current_ghl_stage_name,
              last_ghl_sync_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
            ON CONFLICT (ghl_opportunity_id) DO NOTHING
          `, [
            opp.ghl_id,
            opp.contact_id,
            opp.pipeline_id,
            opp.st_job_id,
            opp.sales_job_number,
            opp.sales_job_status,
            opp.estimate_id || opp.st_estimate_id,
            opp.estimate_status,
            opp.sales_bu_id,
            opp.sales_bu_name,
            customerId,
            opp.customer_name,
            opp.location_id,
            opp.location_address,
            opp.estimate_total || opp.monetary_value,
            opp.pipeline_stage_id,
            stageName
          ]);

          await this.log('info', 'Created job relationship', {
            opportunityId: opp.ghl_id,
            customerId,
            salesJobId: opp.st_job_id
          });

          results.newRelationships++;
        } catch (error) {
          await this.log('error', 'Failed to create relationship', {
            opportunityId: opp.ghl_id,
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
   * Enrich existing relationships with missing data
   */
  async enrichRelationships(results) {
    const client = await getPool().connect();

    try {
      // Update relationships missing customer data
      const { rowCount: customerUpdates } = await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          customer_name = c.name,
          updated_at = NOW()
        FROM ${SCHEMA.st}.st_customers c
        WHERE jr.customer_id = c.st_id
          AND jr.customer_name IS NULL
      `);

      // Update relationships missing location data
      const { rowCount: locationUpdates } = await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          location_address = CONCAT_WS(', ', l.street, l.city, l.state, l.zip),
          updated_at = NOW()
        FROM ${SCHEMA.st}.st_locations l
        JOIN ${SCHEMA.st}.st_jobs j ON j.location_id = l.st_id
        WHERE jr.sales_job_id = j.st_id
          AND jr.location_address IS NULL
          AND l.street IS NOT NULL
      `);

      // Update relationships missing business unit data
      const { rowCount: buUpdates } = await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          sales_business_unit_id = bu.st_id,
          sales_business_unit_name = bu.name,
          updated_at = NOW()
        FROM ${SCHEMA.st}.st_jobs j
        JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
        WHERE jr.sales_job_id = j.st_id
          AND jr.sales_business_unit_name IS NULL
      `);

      // Update estimate data
      const { rowCount: estimateUpdates } = await client.query(`
        UPDATE ${SCHEMA.workflow}.job_relationships jr
        SET
          sales_estimate_id = COALESCE(jr.sales_estimate_id, e.st_id),
          sales_estimate_status = e.status,
          estimate_total = e.total,
          updated_at = NOW()
        FROM ${SCHEMA.st}.st_estimates e
        WHERE e.job_id = jr.sales_job_id
          AND (jr.sales_estimate_id IS NULL OR jr.sales_estimate_status IS DISTINCT FROM e.status)
      `);

      results.updatedRelationships = customerUpdates + locationUpdates + buUpdates + estimateUpdates;

      if (results.updatedRelationships > 0) {
        await this.log('info', 'Enriched relationships', {
          customers: customerUpdates,
          locations: locationUpdates,
          businessUnits: buUpdates,
          estimates: estimateUpdates
        });
      }
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

export default new RelationshipTrackerWorker();
