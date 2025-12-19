/**
 * Create Job Tool
 * Create jobs in ServiceTitan
 */

import { callServiceTitanAPI } from './call-st-api.js';

/**
 * Create a new job in ServiceTitan
 */
export async function createJob(jobData) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  if (!tenantId) {
    throw new Error('SERVICE_TITAN_TENANT_ID not configured');
  }

  // Validate required fields
  if (!jobData.customerId) {
    throw new Error('customerId is required');
  }
  if (!jobData.locationId) {
    throw new Error('locationId is required');
  }
  if (!jobData.businessUnitId) {
    throw new Error('businessUnitId is required');
  }
  if (!jobData.jobTypeId) {
    throw new Error('jobTypeId is required');
  }

  const payload = {
    customerId: jobData.customerId,
    locationId: jobData.locationId,
    businessUnitId: jobData.businessUnitId,
    jobTypeId: jobData.jobTypeId,
    priority: jobData.priority || 'Normal',
    summary: jobData.summary || '',
    campaignId: jobData.campaignId || 1440, // Default to "Existing Customer" campaign
    tagTypeIds: jobData.tagTypeIds || [],
    customFields: jobData.customFields || [],
  };

  // Add appointments if provided
  if (jobData.appointments && jobData.appointments.length > 0) {
    payload.appointments = jobData.appointments;
  } else if (jobData.appointmentStart) {
    // Create appointment from simple start time
    const start = new Date(jobData.appointmentStart);
    const durationMs = (jobData.durationMinutes || 90) * 60000;
    const end = new Date(start.getTime() + durationMs);
    payload.appointments = [{
      start: start.toISOString(),
      end: end.toISOString(),
      arrivalWindowStart: start.toISOString(),
      arrivalWindowEnd: new Date(start.getTime() + 2 * 60 * 60000).toISOString(),
      technicianIds: jobData.technicianIds || [],
    }];
  }

  const endpoint = `/jpm/v2/tenant/${tenantId}/jobs`;
  
  return callServiceTitanAPI(endpoint, {
    method: 'POST',
    body: payload,
  });
}

/**
 * Create job with customer lookup
 * Finds customer by name/phone and creates job
 */
export async function createJobForCustomer(customerSearch, jobDetails) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  // Search for customer
  let customerEndpoint = `/crm/v2/tenant/${tenantId}/customers?`;
  
  if (customerSearch.phone) {
    customerEndpoint += `phone=${encodeURIComponent(customerSearch.phone)}`;
  } else if (customerSearch.name) {
    customerEndpoint += `name=${encodeURIComponent(customerSearch.name)}`;
  } else if (customerSearch.customerId) {
    // Direct ID provided
    return createJob({
      customerId: customerSearch.customerId,
      ...jobDetails,
    });
  } else {
    throw new Error('Must provide customer phone, name, or customerId');
  }

  const customerResult = await callServiceTitanAPI(customerEndpoint);
  
  if (!customerResult.success) {
    return {
      success: false,
      error: 'Failed to search for customer',
      details: customerResult.error,
    };
  }

  const customers = customerResult.data?.data || [];
  
  if (customers.length === 0) {
    return {
      success: false,
      error: 'No customer found matching search criteria',
      searchCriteria: customerSearch,
    };
  }

  if (customers.length > 1) {
    return {
      success: false,
      error: 'Multiple customers found, please be more specific',
      matchCount: customers.length,
      matches: customers.slice(0, 5).map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
      })),
    };
  }

  const customer = customers[0];
  
  // Get customer's primary location if not specified
  let locationId = jobDetails.locationId;
  if (!locationId) {
    const locationsEndpoint = `/crm/v2/tenant/${tenantId}/locations?customerId=${customer.id}&pageSize=1`;
    const locationsResult = await callServiceTitanAPI(locationsEndpoint);
    
    if (locationsResult.success && locationsResult.data?.data?.length > 0) {
      locationId = locationsResult.data.data[0].id;
    } else {
      return {
        success: false,
        error: 'Customer has no locations. Please create a location first.',
        customerId: customer.id,
      };
    }
  }

  return createJob({
    customerId: customer.id,
    locationId,
    ...jobDetails,
  });
}

/**
 * Update an existing job
 */
export async function updateJob(jobId, updates) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/jobs/${jobId}`;
  
  return callServiceTitanAPI(endpoint, {
    method: 'PATCH',
    body: updates,
  });
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId, reason) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/jobs/${jobId}/cancel`;
  
  return callServiceTitanAPI(endpoint, {
    method: 'POST',
    body: { reason },
  });
}

/**
 * Get job types for reference
 */
export async function getJobTypes() {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/job-types`;
  
  return callServiceTitanAPI(endpoint);
}

/**
 * Get business units for reference
 */
export async function getBusinessUnits() {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/settings/v2/tenant/${tenantId}/business-units`;
  
  return callServiceTitanAPI(endpoint);
}

// Tool definition for MCP
export const toolDefinition = {
  name: 'create_job',
  description: 'Create a new job in ServiceTitan. Can search for customer by name/phone or use direct IDs.',
  inputSchema: {
    type: 'object',
    properties: {
      // Customer identification (one required)
      customerId: {
        type: 'number',
        description: 'ServiceTitan customer ID (if known)',
      },
      customerName: {
        type: 'string',
        description: 'Customer name to search for',
      },
      customerPhone: {
        type: 'string',
        description: 'Customer phone to search for',
      },
      // Job details
      locationId: {
        type: 'number',
        description: 'Location ID (optional, uses primary location if not specified)',
      },
      businessUnitId: {
        type: 'number',
        description: 'Business unit ID (required)',
      },
      jobTypeId: {
        type: 'number',
        description: 'Job type ID (required)',
      },
      summary: {
        type: 'string',
        description: 'Job summary/description',
      },
      priority: {
        type: 'string',
        enum: ['Low', 'Normal', 'High', 'Urgent'],
        description: 'Job priority (default: Normal)',
      },
      campaignId: {
        type: 'number',
        description: 'Marketing campaign ID (default: 1440 "Existing Customer")',
      },
      tagTypeIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Tag type IDs to apply (optional)',
      },
      appointmentStart: {
        type: 'string',
        description: 'Appointment start time (ISO 8601 format, e.g., "2025-12-17T10:00:00-05:00")',
      },
      durationMinutes: {
        type: 'number',
        description: 'Appointment duration in minutes (default: 90)',
      },
      technicianIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Technician IDs to assign to the appointment',
      },
    },
    required: ['businessUnitId', 'jobTypeId'],
  },
};

export const getJobTypesDefinition = {
  name: 'get_job_types',
  description: 'Get list of available job types in ServiceTitan',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const getBusinessUnitsDefinition = {
  name: 'get_business_units',
  description: 'Get list of business units in ServiceTitan',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Handle tool call
 */
export async function handleToolCall(args) {
  // Determine how to find customer
  const customerSearch = {};
  if (args.customerId) {
    customerSearch.customerId = args.customerId;
  } else if (args.customerPhone) {
    customerSearch.phone = args.customerPhone;
  } else if (args.customerName) {
    customerSearch.name = args.customerName;
  } else {
    return {
      success: false,
      error: 'Must provide customerId, customerName, or customerPhone',
    };
  }

  const jobDetails = {
    locationId: args.locationId,
    businessUnitId: args.businessUnitId,
    jobTypeId: args.jobTypeId,
    summary: args.summary,
    priority: args.priority,
    campaignId: args.campaignId,
    tagTypeIds: args.tagTypeIds,
    appointmentStart: args.appointmentStart,
    durationMinutes: args.durationMinutes,
    technicianIds: args.technicianIds,
  };

  return createJobForCustomer(customerSearch, jobDetails);
}

export default {
  createJob,
  createJobForCustomer,
  updateJob,
  cancelJob,
  getJobTypes,
  getBusinessUnits,
  handleToolCall,
  toolDefinition,
  getJobTypesDefinition,
  getBusinessUnitsDefinition,
};
