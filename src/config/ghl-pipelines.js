/**
 * GHL Pipeline Configuration
 * Updated: 2025-12-19
 *
 * All pipeline and stage IDs from GoHighLevel API
 */

export const GHL_PIPELINES = {
  // INSTALL PIPELINE - For jobs converted from sold estimates
  INSTALL_PIPELINE: {
    id: 'bbsMqYClVMDN26Lr6HdV',
    name: 'INSTALL PIPELINE',
    stages: {
      ESTIMATE_APPROVED_JOB_CREATED: 'acf34a4c-30c1-4511-85ed-d384f0dc8365',
      PRE_INSTALL_PLANNING_PERMITTING: 'e8731690-0d3a-43a9-bed6-921c70027099',
      SCHEDULED_READY_FOR_INSTALL: '67fb706b-9213-475c-a74f-6ce2f787a2cb',
      IN_PROGRESS_ON_SITE: '56e0e29a-61a9-4ec9-9e86-2ce22a256fbe',
      ON_HOLD_RETURN_VISIT_NEEDED: '47780057-58fa-495f-80dc-e1f4cf8f4862',
      JOB_COMPLETED: 'da971a59-2496-4b7c-9e32-0c0ee82fde76'
    }
  },

  // SALES PIPELINE - For sales opportunities with full lifecycle tracking
  // Updated stages (11 total):
  // 1. New Lead
  // 2. Contacted
  // 3. Appointment Scheduled
  // 4. Appointment Completed - Proposal Sent
  // 5. Estimate Follow-Up
  // 6. Job Sold
  // 7. Install Scheduled
  // 8. Install In Progress
  // 9. Install Complete
  // 10. Closed Won
  // 11. Estimate Lost / Not Approved
  SALES_PIPELINE: {
    id: 'fWJfnMsPzwOXgKdWxdjC',
    name: 'SALES PIPELINE',
    stages: {
      NEW_LEAD: '3dc14ef1-7883-40d4-9831-61a313a46e0a',
      CONTACTED: '56ab4d16-e629-4315-a755-7755677e03e1',
      APPOINTMENT_SCHEDULED: 'e439d832-d8af-47a6-b459-26ed1f210f96',
      APPOINTMENT_COMPLETED_PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
      ESTIMATE_FOLLOW_UP: 'de5601ac-5dbe-4980-a960-b1699b9f4a74',
      JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd',
      // New stages for install tracking within Sales Pipeline
      INSTALL_SCHEDULED: process.env.GHL_STAGE_INSTALL_SCHEDULED || '83ab7d1a-8ee2-4be9-9e99-5e619872f912',
      INSTALL_IN_PROGRESS: process.env.GHL_STAGE_INSTALL_IN_PROGRESS || '61c785fa-2f44-4f2c-a983-e7941c25595c',
      INSTALL_COMPLETE: process.env.GHL_STAGE_INSTALL_COMPLETE || 'da133e98-018f-4b7b-bfc4-efe1db9f981b',
      CLOSED_WON: process.env.GHL_STAGE_CLOSED_WON || '9256d160-ce77-4ee5-9bef-587ddf75c66d',
      ESTIMATE_LOST_NOT_APPROVED: 'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db'
    }
  },

  // Lead Nurture Pipeline
  LEAD_NURTURE: {
    id: 'wSZFCaTL4sD8WGVjjgbr',
    name: 'Lead Nurture',
    stages: {
      NEW_LEAD: '5453a8b5-a9e4-4170-ba3b-bd7ad6328954',
      CONTACTED: '262f08d0-b62b-44a9-8aa7-7ec9c6f2017d',
      PROPOSAL_SENT: 'f43df3c9-b7f9-4226-ae88-9e361d3360cb',
      CLOSED: '39d7d6cf-e0e3-4ff5-882c-6f28584b6b2b',
      CUSTOMER_NURTURE: '4165a059-dec3-4958-9acd-a10bd4fac4ce'
    }
  },

  // Reviews & Referrals Pipeline
  REVIEWS_REFERRALS: {
    id: 'ONnbxgt47h3zcd1wkM6M',
    name: 'Reviews & Referrals',
    stages: {
      COMPLETED_JOBS: '3f553efc-efad-4625-8ad3-911c23627323',
      REVIEW_REQUEST_SENT: '0bc08cb4-33cb-4f0c-b67d-9c46cd24dba3',
      REVIEW_LEFT: 'a030a525-1ac3-4763-97b1-cd01482ca0bf',
      REFERRAL_CAMPAIGN_SENT: '645fbc1c-07d3-4170-a954-130a100c7441',
      REFERRAL_RECEIVED_NEW_LEAD_CREATED: 'ecfad0fe-5e44-4afb-ac82-655ed5659e9a'
    }
  }
};

// Helper to get stage name from ID
export function getStageName(pipelineKey, stageId) {
  const pipeline = GHL_PIPELINES[pipelineKey];
  if (!pipeline) return null;

  for (const [name, id] of Object.entries(pipeline.stages)) {
    if (id === stageId) return name;
  }
  return null;
}

// GHL Location ID
export const GHL_LOCATION_ID = 'kgnEweBlJ8Uq11kNc3Xs';

/**
 * GHL Custom Field IDs for Opportunities
 * These are used to store ServiceTitan data on GHL opportunities
 */
export const GHL_CUSTOM_FIELDS = {
  // ServiceTitan IDs
  ST_CUSTOMER_ID: process.env.GHL_CF_ST_CUSTOMER_ID || 'UmZtVMArKf1LcpAQYXB9',
  ST_JOB_ID: process.env.GHL_CF_ST_JOB_ID || 'jjF7MFNJuSh3FzNVWCz2',
  ST_ESTIMATE_ID: process.env.GHL_CF_ST_ESTIMATE_ID || 'mu28MflNiJ4tVuqeMeVE',

  // Address fields
  ST_STREET_ADDRESS: process.env.GHL_CF_ST_STREET_ADDRESS || '6ymQxIlXsWNkUMkqbz9C',
  ST_CITY: process.env.GHL_CF_ST_CITY || 'h9fGoisfSSjDJi3hh7Ql',
  ST_STATE: process.env.GHL_CF_ST_STATE || '7WT8DvJjpRx6pigxjbzf',
  ST_POSTAL_CODE: process.env.GHL_CF_ST_POSTAL_CODE || 'lpkRLhViMmeF7RLRwGMT',

  // Technician fields
  TECHS: process.env.GHL_CF_TECHS || 'sJ3jmGpHGFUssEVZ9Npi',
  TECHNICIAN: process.env.GHL_CF_TECHNICIAN || 'UtUjwSDe758kTey8ABqk',

  // Estimate data
  ST_ESTIMATES_DATA: process.env.GHL_CF_ST_ESTIMATES_DATA || 'xnlxjYOUDoNaNnrqQUEy'
};

/**
 * Build custom fields array for GHL API
 * @param {object} data - Data to convert to custom fields
 * @returns {Array} - Array of custom field objects for GHL API
 */
export function buildOpportunityCustomFields(data) {
  const customFields = [];

  if (data.stCustomerId) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_CUSTOMER_ID, value: String(data.stCustomerId) });
  }
  if (data.stJobId) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_JOB_ID, value: String(data.stJobId) });
  }
  if (data.stEstimateId) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_ESTIMATE_ID, value: String(data.stEstimateId) });
  }
  if (data.streetAddress) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_STREET_ADDRESS, value: data.streetAddress });
  }
  if (data.city) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_CITY, value: data.city });
  }
  if (data.state) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_STATE, value: data.state });
  }
  if (data.postalCode) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.ST_POSTAL_CODE, value: data.postalCode });
  }
  if (data.technician) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.TECHNICIAN, value: data.technician });
  }
  if (data.techs) {
    customFields.push({ id: GHL_CUSTOM_FIELDS.TECHS, value: data.techs });
  }

  return customFields;
}

export default GHL_PIPELINES;
