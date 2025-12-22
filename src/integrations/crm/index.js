/**
 * CRM Integration Module
 * Exports all CRM integration functionality
 */

export { crmApi, default as crmApiClient } from './crm-api-client.js';
export {
  runCRMSync,
  startCRMSyncScheduler,
  stopCRMSyncScheduler,
} from '../../sync/crm/crm-sync.worker.js';
export {
  CRM_PIPELINES,
  ST_JOB_STATUS_TO_CRM_STAGE,
  PROTECTED_STAGES,
  getStageBySlug,
  getStageKeyBySlug,
  getPipelineBySlug,
  isProtectedStage,
  getNextStage,
  mapSTStatusToCRMStage,
  getStagesArray,
} from '../../config/crm-pipelines.js';
