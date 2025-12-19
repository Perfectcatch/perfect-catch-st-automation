/**
 * Schedule Appointment Tool
 * Schedule and manage appointments in ServiceTitan
 */

import { callServiceTitanAPI } from './call-st-api.js';

/**
 * Schedule a new appointment for a job
 */
export async function scheduleAppointment(appointmentData) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  if (!tenantId) {
    throw new Error('SERVICE_TITAN_TENANT_ID not configured');
  }

  // Validate required fields
  if (!appointmentData.jobId) {
    throw new Error('jobId is required');
  }
  if (!appointmentData.start) {
    throw new Error('start time is required');
  }

  // Parse and format dates
  const startDate = new Date(appointmentData.start);
  const endDate = appointmentData.end 
    ? new Date(appointmentData.end)
    : new Date(startDate.getTime() + (appointmentData.durationMinutes || 120) * 60000);

  const payload = {
    jobId: appointmentData.jobId,
    start: startDate.toISOString(),
    end: endDate.toISOString(),
    arrivalWindowStart: appointmentData.arrivalWindowStart 
      ? new Date(appointmentData.arrivalWindowStart).toISOString()
      : startDate.toISOString(),
    arrivalWindowEnd: appointmentData.arrivalWindowEnd
      ? new Date(appointmentData.arrivalWindowEnd).toISOString()
      : new Date(startDate.getTime() + 2 * 60 * 60000).toISOString(), // 2 hour window default
    technicianIds: appointmentData.technicianIds || [],
    specialInstructions: appointmentData.specialInstructions || '',
  };

  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments`;

  return callServiceTitanAPI(endpoint, {
    method: 'POST',
    body: payload,
  });
}

/**
 * Get available appointment slots
 */
export async function getAvailability(params) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  const startDate = params.startDate || new Date().toISOString().split('T')[0];
  const endDate = params.endDate || new Date(Date.now() + 7 * 24 * 60 * 60000).toISOString().split('T')[0];
  
  const queryParams = new URLSearchParams({
    startsOnOrAfter: startDate,
    endsOnOrBefore: endDate,
    businessUnitId: params.businessUnitId,
  });

  if (params.technicianId) {
    queryParams.append('technicianId', params.technicianId);
  }

  const endpoint = `/jpm/v2/tenant/${tenantId}/capacity?${queryParams}`;
  
  return callServiceTitanAPI(endpoint);
}

/**
 * Reschedule an existing appointment
 */
export async function rescheduleAppointment(appointmentId, newTimes) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  const startDate = new Date(newTimes.start);
  const endDate = newTimes.end 
    ? new Date(newTimes.end)
    : new Date(startDate.getTime() + (newTimes.durationMinutes || 120) * 60000);

  const payload = {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };

  if (newTimes.arrivalWindowStart) {
    payload.arrivalWindowStart = new Date(newTimes.arrivalWindowStart).toISOString();
  }
  if (newTimes.arrivalWindowEnd) {
    payload.arrivalWindowEnd = new Date(newTimes.arrivalWindowEnd).toISOString();
  }
  if (newTimes.technicianIds) {
    payload.technicianIds = newTimes.technicianIds;
  }

  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments/${appointmentId}`;

  return callServiceTitanAPI(endpoint, {
    method: 'PATCH',
    body: payload,
  });
}

/**
 * Cancel an appointment
 */
export async function cancelAppointment(appointmentId, reason) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments/${appointmentId}/cancel`;
  
  return callServiceTitanAPI(endpoint, {
    method: 'POST',
    body: { reason: reason || 'Cancelled via API' },
  });
}

/**
 * Get appointment details
 */
export async function getAppointment(appointmentId) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments/${appointmentId}`;
  
  return callServiceTitanAPI(endpoint);
}

/**
 * Get appointments for a date range
 */
export async function getAppointments(params = {}) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  
  const queryParams = new URLSearchParams();
  
  if (params.startDate) {
    queryParams.append('startsOnOrAfter', params.startDate);
  }
  if (params.endDate) {
    queryParams.append('endsOnOrBefore', params.endDate);
  }
  if (params.technicianId) {
    queryParams.append('technicianId', params.technicianId);
  }
  if (params.status) {
    queryParams.append('status', params.status);
  }
  if (params.jobId) {
    queryParams.append('jobId', params.jobId);
  }
  
  queryParams.append('pageSize', params.pageSize || 50);

  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments?${queryParams}`;

  return callServiceTitanAPI(endpoint);
}

/**
 * Get available technicians
 */
export async function getTechnicians(params = {}) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;

  const queryParams = new URLSearchParams();
  if (params.businessUnitId) {
    queryParams.append('businessUnitId', params.businessUnitId);
  }
  if (params.active !== undefined) {
    queryParams.append('active', params.active);
  }

  const endpoint = `/settings/v2/tenant/${tenantId}/technicians?${queryParams}`;
  
  return callServiceTitanAPI(endpoint);
}

/**
 * Assign technician to appointment
 */
export async function assignTechnician(appointmentId, technicianIds) {
  const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
  const endpoint = `/jpm/v2/tenant/${tenantId}/appointments/${appointmentId}`;
  
  return callServiceTitanAPI(endpoint, {
    method: 'PATCH',
    body: { technicianIds: Array.isArray(technicianIds) ? technicianIds : [technicianIds] },
  });
}

// Tool definition for MCP
export const toolDefinition = {
  name: 'schedule_appointment',
  description: 'Schedule a new appointment for a job in ServiceTitan. Specify job ID, date/time, and optionally assign technicians.',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: {
        type: 'number',
        description: 'ServiceTitan job ID to schedule appointment for',
      },
      start: {
        type: 'string',
        description: 'Appointment start time (ISO 8601 format or natural language like "tomorrow at 2pm")',
      },
      end: {
        type: 'string',
        description: 'Appointment end time (optional, defaults to start + duration)',
      },
      durationMinutes: {
        type: 'number',
        description: 'Appointment duration in minutes (default: 120)',
      },
      technicianIds: {
        type: 'array',
        items: { type: 'number' },
        description: 'Technician IDs to assign (optional)',
      },
      arrivalWindowStart: {
        type: 'string',
        description: 'Start of arrival window (optional)',
      },
      arrivalWindowEnd: {
        type: 'string',
        description: 'End of arrival window (optional)',
      },
      specialInstructions: {
        type: 'string',
        description: 'Special instructions for the appointment',
      },
    },
    required: ['jobId', 'start'],
  },
};

export const getAvailabilityDefinition = {
  name: 'get_availability',
  description: 'Get available appointment slots for scheduling',
  inputSchema: {
    type: 'object',
    properties: {
      businessUnitId: {
        type: 'number',
        description: 'Business unit ID to check availability for',
      },
      startDate: {
        type: 'string',
        description: 'Start date for availability check (YYYY-MM-DD)',
      },
      endDate: {
        type: 'string',
        description: 'End date for availability check (YYYY-MM-DD)',
      },
      technicianId: {
        type: 'number',
        description: 'Specific technician ID to check (optional)',
      },
    },
    required: ['businessUnitId'],
  },
};

export const getAppointmentsDefinition = {
  name: 'get_appointments',
  description: 'Get appointments for a date range or specific criteria',
  inputSchema: {
    type: 'object',
    properties: {
      startDate: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD)',
      },
      endDate: {
        type: 'string',
        description: 'End date (YYYY-MM-DD)',
      },
      technicianId: {
        type: 'number',
        description: 'Filter by technician ID',
      },
      status: {
        type: 'string',
        enum: ['Scheduled', 'Dispatched', 'Working', 'Done', 'Canceled'],
        description: 'Filter by status',
      },
      jobId: {
        type: 'number',
        description: 'Filter by job ID',
      },
    },
  },
};

export const rescheduleDefinition = {
  name: 'reschedule_appointment',
  description: 'Reschedule an existing appointment to a new time',
  inputSchema: {
    type: 'object',
    properties: {
      appointmentId: {
        type: 'number',
        description: 'Appointment ID to reschedule',
      },
      start: {
        type: 'string',
        description: 'New start time',
      },
      end: {
        type: 'string',
        description: 'New end time (optional)',
      },
      durationMinutes: {
        type: 'number',
        description: 'Duration in minutes if end not specified',
      },
    },
    required: ['appointmentId', 'start'],
  },
};

export const getTechniciansDefinition = {
  name: 'get_technicians',
  description: 'Get list of available technicians',
  inputSchema: {
    type: 'object',
    properties: {
      businessUnitId: {
        type: 'number',
        description: 'Filter by business unit',
      },
      active: {
        type: 'boolean',
        description: 'Filter by active status (default: true)',
      },
    },
  },
};

/**
 * Handle tool call
 */
export async function handleToolCall(args) {
  return scheduleAppointment(args);
}

export default {
  scheduleAppointment,
  getAvailability,
  rescheduleAppointment,
  cancelAppointment,
  getAppointment,
  getAppointments,
  getTechnicians,
  assignTechnician,
  handleToolCall,
  toolDefinition,
  getAvailabilityDefinition,
  getAppointmentsDefinition,
  rescheduleDefinition,
  getTechniciansDefinition,
};
