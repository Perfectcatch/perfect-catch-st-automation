/**
 * CRM Pipeline Configuration
 * Defines pipelines and stages for Perfect Catch CRM
 * Matches the seeded data in Payload CMS
 *
 * Replicates GHL pipeline sync logic exactly
 */

export const CRM_PIPELINES = {
  SALES_PIPELINE: {
    key: 'SALES_PIPELINE',
    slug: 'sales',
    name: 'Sales Pipeline',
    type: 'sales',
    id: 1,
    stages: {
      NEW_LEAD: { slug: 'new-lead', name: 'New Lead', id: 1, order: 1 },
      CONTACTED: { slug: 'contacted', name: 'Contacted', id: 2, order: 2 },
      APPOINTMENT_SCHEDULED: { slug: 'appointment-scheduled', name: 'Appointment Scheduled', id: 3, order: 3 },
      PROPOSAL_SENT: { slug: 'proposal-sent', name: 'Proposal Sent', id: 4, order: 4 },
      ESTIMATE_FOLLOWUP: { slug: 'estimate-followup', name: 'Estimate Follow-up', id: 5, order: 5 },
      JOB_SOLD: { slug: 'job-sold', name: 'Job Sold', id: 6, order: 6, isWon: true },
      ESTIMATE_LOST: { slug: 'estimate-lost', name: 'Estimate Lost', id: 7, order: 7, isLost: true },
    }
  },
  INSTALL_PIPELINE: {
    key: 'INSTALL_PIPELINE',
    slug: 'install',
    name: 'Install Pipeline',
    type: 'pool_construction',
    id: 2,
    stages: {
      ESTIMATE_APPROVED: { slug: 'estimate-approved', name: 'Estimate Approved / Job Created', id: 8, order: 1 },
      PRE_INSTALL_PLANNING: { slug: 'pre-install-planning', name: 'Pre-Install Planning / Permitting', id: 9, order: 2 },
      SCHEDULED: { slug: 'scheduled', name: 'Scheduled / Ready for Install', id: 10, order: 3 },
      IN_PROGRESS: { slug: 'in-progress', name: 'In Progress / On Site', id: 11, order: 4 },
      ON_HOLD: { slug: 'on-hold', name: 'On Hold / Return Visit Needed', id: 12, order: 5 },
      JOB_COMPLETED: { slug: 'job-completed', name: 'Job Completed', id: 13, order: 6, isWon: true },
    }
  }
};

/**
 * Business Unit → Pipeline Mapping
 * Same logic as GHL sync:
 * - Sales and Service business units → SALES PIPELINE
 * - Install business units → INSTALL PIPELINE
 */
export const BUSINESS_UNIT_PIPELINE_MAP = {
  // Pool business units
  'Pool - Sales': 'SALES_PIPELINE',
  'Pool - Service': 'SALES_PIPELINE',
  'Pool - Install': 'INSTALL_PIPELINE',
  // Electrical business units
  'Electrical - Sales': 'SALES_PIPELINE',
  'Electrical - Service': 'SALES_PIPELINE',
  'Electrical - Install': 'INSTALL_PIPELINE',
};

/**
 * Get pipeline for a business unit name
 * Falls back to SALES_PIPELINE if not found
 */
export function getPipelineForBusinessUnit(businessUnitName) {
  if (!businessUnitName) return CRM_PIPELINES.SALES_PIPELINE;

  // Check for Install business units
  if (businessUnitName.toLowerCase().includes('install')) {
    return CRM_PIPELINES.INSTALL_PIPELINE;
  }

  // Sales and Service go to Sales Pipeline
  return CRM_PIPELINES.SALES_PIPELINE;
}

/**
 * Protected stages that should never be moved backward
 * Same as GHL logic
 */
export const PROTECTED_STAGES = [
  CRM_PIPELINES.SALES_PIPELINE.stages.JOB_SOLD.id,
  CRM_PIPELINES.SALES_PIPELINE.stages.ESTIMATE_LOST.id,
];

/**
 * Get stages as an array for a given pipeline
 */
export function getStagesArray(pipelineKey) {
  const pipeline = CRM_PIPELINES[pipelineKey];
  if (!pipeline) return [];
  
  return Object.values(pipeline.stages).sort((a, b) => a.order - b.order);
}

/**
 * Get pipeline by slug
 */
export function getPipelineBySlug(slug) {
  return Object.values(CRM_PIPELINES).find(p => p.slug === slug);
}

/**
 * Get stage by ID
 */
export function getStageById(stageId) {
  for (const pipeline of Object.values(CRM_PIPELINES)) {
    for (const stage of Object.values(pipeline.stages)) {
      if (stage.id === stageId) {
        return { ...stage, pipeline };
      }
    }
  }
  return null;
}

/**
 * Map ST job status to CRM stage
 */
export function mapSTStatusToCRMStage(stJobStatus, stEstimateStatus, hasAppointment) {
  // Install pipeline stages
  if (stJobStatus?.toLowerCase().includes('completed')) {
    return CRM_PIPELINES.INSTALL_PIPELINE.stages.JOB_COMPLETED;
  }
  if (stJobStatus?.toLowerCase().includes('in progress')) {
    return CRM_PIPELINES.INSTALL_PIPELINE.stages.IN_PROGRESS;
  }
  if (stJobStatus?.toLowerCase().includes('scheduled')) {
    return CRM_PIPELINES.INSTALL_PIPELINE.stages.SCHEDULED;
  }
  
  // Sales pipeline stages
  if (stEstimateStatus === 'Sold') {
    return CRM_PIPELINES.SALES_PIPELINE.stages.JOB_SOLD;
  }
  if (stEstimateStatus === 'Dismissed') {
    return CRM_PIPELINES.SALES_PIPELINE.stages.ESTIMATE_LOST;
  }
  if (stEstimateStatus) {
    return CRM_PIPELINES.SALES_PIPELINE.stages.PROPOSAL_SENT;
  }
  if (hasAppointment) {
    return CRM_PIPELINES.SALES_PIPELINE.stages.APPOINTMENT_SCHEDULED;
  }
  
  return CRM_PIPELINES.SALES_PIPELINE.stages.NEW_LEAD;
}

export default CRM_PIPELINES;
