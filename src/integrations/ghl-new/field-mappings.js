/**
 * GHL Field Mappings
 * Maps between ServiceTitan and GHL fields
 */

// ST Customer -> GHL Contact field mapping
export const ST_TO_GHL_CONTACT = {
  firstName: 'firstName',
  lastName: 'lastName',
  name: 'name',
  email: 'email',
  phone: 'phone',
  'address.street': 'address1',
  'address.city': 'city',
  'address.state': 'state',
  'address.zip': 'postalCode',
  'address.country': 'country'
};

// GHL Contact -> ST Customer field mapping
export const GHL_TO_ST_CONTACT = {
  firstName: 'first_name',
  lastName: 'last_name',
  name: 'name',
  email: 'email',
  phone: 'phone',
  address1: 'address_line1',
  city: 'city',
  state: 'state',
  postalCode: 'zip',
  country: 'country'
};

// ST Estimate -> GHL Opportunity field mapping
export const ST_TO_GHL_OPPORTUNITY = {
  number: 'name',
  total: 'monetaryValue',
  status: 'status' // Requires mapping function
};

// GHL Stage -> ST Status mapping
export const GHL_STAGE_TO_ST_STATUS = {
  NEW_LEAD: null,                    // No ST action
  CONTACTED: null,                   // No ST action
  APPOINTMENT_SCHEDULED: 'pending',  // Mark estimate as pending
  APPOINTMENT_COMPLETED: 'pending',  // Keep as pending
  ESTIMATE_SENT: 'pending',          // Keep as pending
  JOB_SOLD: 'sold',                  // Mark as sold
  ESTIMATE_LOST: 'dismissed'         // Mark as dismissed
};

// ST Estimate Status -> GHL Stage ID mapping (requires pipeline config)
export function getStageIdForEstimateStatus(status, pipelineConfig) {
  const mapping = {
    pending: pipelineConfig?.stages?.ESTIMATE_SENT,
    sold: pipelineConfig?.stages?.JOB_SOLD,
    dismissed: pipelineConfig?.stages?.ESTIMATE_LOST
  };
  return mapping[status?.toLowerCase()] || pipelineConfig?.stages?.NEW_LEAD;
}

// ST Job Status -> GHL Stage ID mapping for Install Pipeline
export function getStageIdForJobStatus(jobStatus, pipelineConfig) {
  const mapping = {
    Scheduled: pipelineConfig?.stages?.JOB_SCHEDULED,
    Dispatched: pipelineConfig?.stages?.JOB_IN_PROGRESS,
    'In Progress': pipelineConfig?.stages?.JOB_IN_PROGRESS,
    Completed: pipelineConfig?.stages?.JOB_COMPLETED,
    Canceled: pipelineConfig?.stages?.JOB_CANCELED
  };
  return mapping[jobStatus] || pipelineConfig?.stages?.JOB_SCHEDULED;
}

/**
 * Transform ST customer to GHL contact format
 */
export function transformSTCustomerToGHLContact(customer, locationId) {
  const firstName = customer.firstName || customer.first_name || customer.name?.split(' ')[0] || 'Unknown';
  const lastName = customer.lastName || customer.last_name || customer.name?.split(' ').slice(1).join(' ') || '';

  const contact = {
    locationId,
    firstName,
    lastName,
    name: customer.name || `${firstName} ${lastName}`.trim(),
    source: 'ServiceTitan'
  };

  if (customer.email) contact.email = customer.email;
  if (customer.phone) contact.phone = customer.phone;
  if (customer.address?.street || customer.address_line1) {
    contact.address1 = customer.address?.street || customer.address_line1;
  }
  if (customer.address?.city || customer.city) {
    contact.city = customer.address?.city || customer.city;
  }
  if (customer.address?.state || customer.state) {
    contact.state = customer.address?.state || customer.state;
  }
  if (customer.address?.zip || customer.zip) {
    contact.postalCode = customer.address?.zip || customer.zip;
  }

  // Add ST customer ID as custom field
  contact.customFields = [
    { key: 'st_customer_id', field_value: String(customer.id || customer.st_id) }
  ];

  return contact;
}

/**
 * Transform ST estimate to GHL opportunity format
 */
export function transformSTEstimateToGHLOpportunity(estimate, job, contactId, pipelineConfig) {
  const stageId = getStageIdForEstimateStatus(estimate.status, pipelineConfig);

  return {
    pipelineId: pipelineConfig.id,
    pipelineStageId: stageId,
    contactId,
    name: `Estimate #${estimate.number || estimate.estimate_number}`,
    monetaryValue: estimate.total || 0,
    source: 'ServiceTitan',
    customFields: [
      { key: 'st_estimate_id', field_value: String(estimate.id || estimate.st_id) },
      { key: 'st_job_id', field_value: String(job?.id || job?.st_id || estimate.job_id) },
      { key: 'st_customer_id', field_value: String(estimate.customer_id) }
    ]
  };
}

/**
 * Transform GHL contact to ST customer format (for display)
 */
export function transformGHLContactToSTFormat(contact) {
  return {
    name: contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
    first_name: contact.firstName,
    last_name: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    address_line1: contact.address1,
    city: contact.city,
    state: contact.state,
    zip: contact.postalCode,
    source: 'GHL'
  };
}

export default {
  ST_TO_GHL_CONTACT,
  GHL_TO_ST_CONTACT,
  ST_TO_GHL_OPPORTUNITY,
  GHL_STAGE_TO_ST_STATUS,
  getStageIdForEstimateStatus,
  getStageIdForJobStatus,
  transformSTCustomerToGHLContact,
  transformSTEstimateToGHLOpportunity,
  transformGHLContactToSTFormat
};
