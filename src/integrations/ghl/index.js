/**
 * GHL (GoHighLevel) Integration Module
 * Bi-directional sync between GHL and ServiceTitan
 *
 * Schema:
 *   - integrations.ghl_contacts - GHL contacts
 *   - integrations.ghl_opportunities - GHL opportunities
 *   - integrations.ghl_sync_log - Sync log
 *   - servicetitan.st_customers - ST customers
 *   - servicetitan.st_jobs - ST jobs
 *   - servicetitan.st_estimates - ST estimates
 *   - servicetitan.st_business_units - Business units
 */

// Schema prefixes for proper table references
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// Import FROM GHL
export { syncOpportunitiesFromGHL } from './sync-opportunities-from-ghl.js';
export { syncContactsFromGHL } from './sync-contacts-from-ghl.js';

// Export TO GHL
export { syncEstimateToGHL, syncCustomerToGHL, moveOpportunityToJobSold } from './sync-estimate-to-ghl.js';

// Pipeline movements
export { moveOpportunityToInstallPipeline, processInstallJobMoves } from './move-to-install-pipeline.js';
export { moveOpportunityToInProgress, processInProgressMoves } from './move-to-in-progress.js';

// Pipeline API utilities
export {
  getPipelines,
  getPipelineStages,
  updateOpportunityStage,
  getOpportunity,
  createOpportunity,
  searchContacts,
  createContact
} from './pipelines.js';

// Backfill utilities
export { backfillAllOpportunities, backfillOpportunity } from './backfill-opportunities.js';

/**
 * Run full GHL sync (contacts first, then opportunities)
 */
export async function syncAllFromGHL() {
  const { syncContactsFromGHL } = await import('./sync-contacts-from-ghl.js');
  const { syncOpportunitiesFromGHL } = await import('./sync-opportunities-from-ghl.js');

  const contactStats = await syncContactsFromGHL();
  const opportunityStats = await syncOpportunitiesFromGHL();

  return {
    contacts: contactStats,
    opportunities: opportunityStats
  };
}

/**
 * Sync all pending estimates to GHL
 */
export async function syncPendingEstimatesToGHL() {
  const { syncEstimateToGHL } = await import('./sync-estimate-to-ghl.js');
  const { getPool } = await import('../../services/sync/sync-base.js');

  const client = await getPool().connect();
  let synced = 0;
  let failed = 0;

  try {
    // Get estimates not yet synced to GHL (no matching opportunity)
    const result = await client.query(`
      SELECT e.st_id
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      LEFT JOIN ${SCHEMA.ghl}.ghl_opportunities o ON o.st_job_id = j.st_id
      WHERE bu.ghl_pipeline_id IS NOT NULL
        AND o.id IS NULL
        AND e.total > 0
      ORDER BY e.st_created_on DESC
      LIMIT 100
    `);

    for (const row of result.rows) {
      try {
        await syncEstimateToGHL(Number(row.st_id));
        synced++;
      } catch (error) {
        failed++;
      }
    }

    return { synced, failed, total: result.rows.length };
  } finally {
    client.release();
  }
}
