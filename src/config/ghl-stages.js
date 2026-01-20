/**
 * GHL Stage Mapping Configuration
 * Maps ServiceTitan job/estimate statuses to GHL Pipeline stages
 *
 * Updated: Sales Pipeline with full lifecycle tracking
 *
 * Pipeline Stages (in order):
 * 1. New Lead
 * 2. Contacted
 * 3. Appointment Scheduled
 * 4. Appointment Completed - Proposal Sent
 * 5. Estimate Follow-Up
 * 6. Job Sold
 * 7. Install Scheduled
 * 8. Install In Progress
 * 9. Install Complete
 * 10. Closed Won
 * 11. Estimate Lost / Not Approved
 */

// Stage IDs from environment with fallback defaults
// Run scripts/fetch-ghl-stages.js to get current IDs
export const GHL_STAGES = {
  // Sales lifecycle stages
  NEW_LEAD: process.env.GHL_STAGE_NEW_LEAD || '3dc14ef1-7883-40d4-9831-61a313a46e0a',
  CONTACTED: process.env.GHL_STAGE_CONTACTED || '56ab4d16-e629-4315-a755-7755677e03e1',
  APPOINTMENT_SCHEDULED: process.env.GHL_STAGE_APPOINTMENT_SCHEDULED || 'e439d832-d8af-47a6-b459-26ed1f210f96',
  PROPOSAL_SENT: process.env.GHL_STAGE_APPOINTMENT_COMPLETED_PROPOSAL_SENT || 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
  ESTIMATE_FOLLOWUP: process.env.GHL_STAGE_ESTIMATE_FOLLOW_UP || 'de5601ac-5dbe-4980-a960-b1699b9f4a74',
  JOB_SOLD: process.env.GHL_STAGE_JOB_SOLD || '97703c8d-1dc6-46f3-a537-601678cedebd',

  // Install lifecycle stages (tracked in Sales Pipeline)
  INSTALL_SCHEDULED: process.env.GHL_STAGE_INSTALL_SCHEDULED || '83ab7d1a-8ee2-4be9-9e99-5e619872f912',
  INSTALL_IN_PROGRESS: process.env.GHL_STAGE_INSTALL_IN_PROGRESS || '61c785fa-2f44-4f2c-a983-e7941c25595c',
  INSTALL_COMPLETE: process.env.GHL_STAGE_INSTALL_COMPLETE || 'da133e98-018f-4b7b-bfc4-efe1db9f981b',
  CLOSED_WON: process.env.GHL_STAGE_CLOSED_WON || '9256d160-ce77-4ee5-9bef-587ddf75c66d',

  // Closed/Lost stages
  LOST: process.env.GHL_STAGE_ESTIMATE_LOST_NOT_APPROVED || 'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db'
};

// Pipeline IDs
export const GHL_PIPELINE_IDS = {
  SALES: process.env.GHL_PIPELINE_SALES_ID,
  INSTALL: process.env.GHL_PIPELINE_INSTALL_ID
};

/**
 * ServiceTitan Sales Job Status -> GHL Stage mapping
 * For jobs in Sales/Residential Sales business units
 */
export const ST_SALES_JOB_STATUS_TO_GHL_STAGE = {
  // Pre-appointment
  'Pending': GHL_STAGES.CONTACTED,
  'Hold': GHL_STAGES.CONTACTED,

  // Appointment phase
  'Scheduled': GHL_STAGES.APPOINTMENT_SCHEDULED,
  'Confirmed': GHL_STAGES.APPOINTMENT_SCHEDULED,
  'Dispatched': GHL_STAGES.APPOINTMENT_SCHEDULED,
  'Working': GHL_STAGES.APPOINTMENT_SCHEDULED,
  'InProgress': GHL_STAGES.APPOINTMENT_SCHEDULED,  // ST API returns this

  // Post-appointment - estimate sent
  'Completed': GHL_STAGES.PROPOSAL_SENT,

  // Won
  'Sold': GHL_STAGES.JOB_SOLD,

  // Canceled/Lost
  'Canceled': GHL_STAGES.LOST
};

/**
 * ServiceTitan Service/Install Job Status -> GHL Stage mapping
 * For jobs in Service/Install/Construction business units
 */
export const ST_SERVICE_JOB_STATUS_TO_GHL_STAGE = {
  // Pre-work
  'Pending': GHL_STAGES.JOB_SOLD,
  'Hold': GHL_STAGES.JOB_SOLD,

  // Scheduled for install
  'Scheduled': GHL_STAGES.INSTALL_SCHEDULED,
  'Confirmed': GHL_STAGES.INSTALL_SCHEDULED,

  // In progress
  'Dispatched': GHL_STAGES.INSTALL_IN_PROGRESS,
  'Working': GHL_STAGES.INSTALL_IN_PROGRESS,
  'InProgress': GHL_STAGES.INSTALL_IN_PROGRESS,  // ST API returns this

  // Completed
  'Completed': GHL_STAGES.INSTALL_COMPLETE,

  // Canceled
  'Canceled': GHL_STAGES.LOST
};

/**
 * ServiceTitan Estimate Status -> GHL Stage mapping
 */
export const ST_ESTIMATE_STATUS_TO_GHL_STAGE = {
  'Open': GHL_STAGES.PROPOSAL_SENT,
  'Pending': GHL_STAGES.ESTIMATE_FOLLOWUP,
  'Sold': GHL_STAGES.JOB_SOLD,
  'Dismissed': GHL_STAGES.LOST
};

/**
 * Business Unit Classification
 * Used to determine which status mapping to use
 */
export const SALES_BUSINESS_UNITS = [
  'Sales',
  'Residential Sales',
  'Commercial Sales'
];

export const SERVICE_BUSINESS_UNITS = [
  'Service',
  'Install',
  'Installation',
  'Construction',
  'Residential Service',
  'Commercial Service'
];

/**
 * Check if job belongs to a Sales business unit
 * @param {object} job - Job object with businessUnit data
 * @returns {boolean}
 */
export function isSalesJob(job) {
  const buName = job.businessUnit?.name || job.businessUnitName || '';
  return SALES_BUSINESS_UNITS.some(bu =>
    buName.toLowerCase().includes(bu.toLowerCase())
  );
}

/**
 * Check if job belongs to a Service/Install business unit
 * @param {object} job - Job object with businessUnit data
 * @returns {boolean}
 */
export function isServiceJob(job) {
  const buName = job.businessUnit?.name || job.businessUnitName || '';
  return SERVICE_BUSINESS_UNITS.some(bu =>
    buName.toLowerCase().includes(bu.toLowerCase())
  );
}

/**
 * Get the appropriate GHL stage for a job based on its status and business unit
 * @param {object} job - ServiceTitan job object
 * @returns {string|null} - GHL stage ID or null
 */
export function getGHLStageForJob(job) {
  const status = job.status || job.jobStatus;

  if (isSalesJob(job)) {
    return ST_SALES_JOB_STATUS_TO_GHL_STAGE[status] || null;
  }

  if (isServiceJob(job)) {
    return ST_SERVICE_JOB_STATUS_TO_GHL_STAGE[status] || null;
  }

  // Default to service mapping for unknown BUs
  return ST_SERVICE_JOB_STATUS_TO_GHL_STAGE[status] || null;
}

/**
 * Get the appropriate GHL stage for an estimate
 * @param {object} estimate - ServiceTitan estimate object
 * @returns {string|null} - GHL stage ID or null
 */
export function getGHLStageForEstimate(estimate) {
  const status = estimate.status;
  return ST_ESTIMATE_STATUS_TO_GHL_STAGE[status] || null;
}

/**
 * Stage priority for determining which stage to use when multiple apply
 * Higher number = higher priority
 */
export const STAGE_PRIORITY = {
  [GHL_STAGES.NEW_LEAD]: 1,
  [GHL_STAGES.CONTACTED]: 2,
  [GHL_STAGES.APPOINTMENT_SCHEDULED]: 3,
  [GHL_STAGES.PROPOSAL_SENT]: 4,
  [GHL_STAGES.ESTIMATE_FOLLOWUP]: 5,
  [GHL_STAGES.JOB_SOLD]: 6,
  [GHL_STAGES.INSTALL_SCHEDULED]: 7,
  [GHL_STAGES.INSTALL_IN_PROGRESS]: 8,
  [GHL_STAGES.INSTALL_COMPLETE]: 9,
  [GHL_STAGES.CLOSED_WON]: 10,
  [GHL_STAGES.LOST]: 0 // Lost can happen at any stage
};

/**
 * Determine if a stage transition should be allowed
 * Generally stages should only move forward unless going to LOST
 * @param {string} currentStageId - Current GHL stage ID
 * @param {string} newStageId - Proposed new stage ID
 * @returns {boolean}
 */
export function shouldAllowStageTransition(currentStageId, newStageId) {
  // Always allow transition to LOST
  if (newStageId === GHL_STAGES.LOST) {
    return true;
  }

  const currentPriority = STAGE_PRIORITY[currentStageId] || 0;
  const newPriority = STAGE_PRIORITY[newStageId] || 0;

  // Only allow forward progression
  return newPriority > currentPriority;
}

export default {
  GHL_STAGES,
  GHL_PIPELINE_IDS,
  ST_SALES_JOB_STATUS_TO_GHL_STAGE,
  ST_SERVICE_JOB_STATUS_TO_GHL_STAGE,
  ST_ESTIMATE_STATUS_TO_GHL_STAGE,
  isSalesJob,
  isServiceJob,
  getGHLStageForJob,
  getGHLStageForEstimate,
  shouldAllowStageTransition
};
