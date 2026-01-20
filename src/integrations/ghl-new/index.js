/**
 * GHL Integration Module - Production Ready
 * Complete bidirectional sync between GHL and ServiceTitan
 */

// API Client
export { ghlClient, contacts, opportunities, pipelines, customFields } from './client.js';

// Field Mappings
export {
  ST_TO_GHL_CONTACT,
  GHL_TO_ST_CONTACT,
  ST_TO_GHL_OPPORTUNITY,
  GHL_STAGE_TO_ST_STATUS,
  getStageIdForEstimateStatus,
  getStageIdForJobStatus,
  transformSTCustomerToGHLContact,
  transformSTEstimateToGHLOpportunity,
  transformGHLContactToSTFormat
} from './field-mappings.js';

// Re-export from existing integration for backwards compatibility
export { syncOpportunitiesFromGHL } from '../ghl/sync-opportunities-from-ghl.js';
export { syncContactsFromGHL } from '../ghl/sync-contacts-from-ghl.js';
export { syncEstimateToGHL, syncCustomerToGHL, moveOpportunityToJobSold } from '../ghl/sync-estimate-to-ghl.js';
export { moveOpportunityToInstallPipeline, processInstallJobMoves } from '../ghl/move-to-install-pipeline.js';
