/**
 * JPM (Job Planning & Management) Module Fetchers
 *
 * Fetchers for:
 * - raw_st_jobs
 * - raw_st_appointments
 * - raw_st_job_types
 */

import { BaseFetcher } from './base-fetcher.js';

// ============================================================================
// JOBS FETCHER
// ============================================================================

export class JobsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_jobs',
      endpoint: '/jpm/v2/tenant/{tenant}/jobs',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_number',
      'project_id',
      'customer_id',
      'location_id',
      'job_status',
      'completed_on',
      'business_unit_id',
      'job_type_id',
      'priority',
      'campaign_id',
      'appointment_count',
      'first_appointment_id',
      'last_appointment_id',
      'recall_for_id',
      'warranty_id',
      'job_generated_lead_source',
      'no_charge',
      'notifications_enabled',
      'created_by_id',
      'tag_type_ids',
      'lead_call_id',
      'partner_lead_call_id',
      'booking_id',
      'sold_by_id',
      'customer_po',
      'invoice_id',
      'membership_id',
      'total',
      'created_from_estimate_id',
      'estimate_ids',
      'summary',
      'custom_fields',
      'external_data',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['tag_type_ids', 'estimate_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      job_number: record.jobNumber,
      project_id: record.projectId,
      customer_id: record.customerId,
      location_id: record.locationId,
      job_status: record.jobStatus,
      completed_on: record.completedOn,
      business_unit_id: record.businessUnitId,
      job_type_id: record.jobTypeId,
      priority: record.priority || 'Normal',
      campaign_id: record.campaignId,
      appointment_count: record.appointmentCount || 0,
      first_appointment_id: record.firstAppointmentId,
      last_appointment_id: record.lastAppointmentId,
      recall_for_id: record.recallForId,
      warranty_id: record.warrantyId,
      job_generated_lead_source: record.jobGeneratedLeadSource,
      no_charge: record.noCharge ?? false,
      notifications_enabled: record.notificationsEnabled ?? true,
      created_by_id: record.createdById,
      tag_type_ids: record.tagTypeIds || [],
      lead_call_id: record.leadCallId,
      partner_lead_call_id: record.partnerLeadCallId,
      booking_id: record.bookingId,
      sold_by_id: record.soldById,
      customer_po: record.customerPo,
      invoice_id: record.invoiceId,
      membership_id: record.membershipId,
      total: record.total || 0,
      created_from_estimate_id: record.createdFromEstimateId,
      estimate_ids: record.estimateIds || [],
      summary: record.summary,
      custom_fields: record.customFields || [],
      external_data: record.externalData,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// APPOINTMENTS FETCHER
// ============================================================================

export class AppointmentsFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_appointments',
      endpoint: '/jpm/v2/tenant/{tenant}/appointments',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'job_id',
      'appointment_number',
      'start_time',
      'end_time',
      'arrival_window_start',
      'arrival_window_end',
      'status',
      'special_instructions',
      'customer_id',
      'unused',
      'created_by_id',
      'is_confirmed',
      'active',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      job_id: record.jobId,
      appointment_number: record.appointmentNumber,
      start_time: record.start,
      end_time: record.end,
      arrival_window_start: record.arrivalWindowStart,
      arrival_window_end: record.arrivalWindowEnd,
      status: record.status,
      special_instructions: record.specialInstructions,
      customer_id: record.customerId,
      unused: record.unused ?? false,
      created_by_id: record.createdById,
      is_confirmed: record.isConfirmed ?? false,
      active: record.active ?? true,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// JOB TYPES FETCHER
// ============================================================================

export class JobTypesFetcher extends BaseFetcher {
  constructor() {
    super({
      tableName: 'raw_st_job_types',
      endpoint: '/jpm/v2/tenant/{tenant}/job-types',
    });
  }

  getColumns() {
    return [
      'st_id',
      'tenant_id',
      'name',
      'business_unit_ids',
      'skills',
      'tag_type_ids',
      'priority',
      'duration',
      'sold_threshold',
      'class',
      'summary',
      'no_charge',
      'active',
      'external_data',
      'st_created_on',
      'st_modified_on',
      'fetched_at',
      'full_data',
    ];
  }

  getPgArrayColumns() {
    return ['business_unit_ids', 'tag_type_ids'];
  }

  transformRecord(record) {
    return {
      st_id: record.id,
      tenant_id: this.tenantId,
      name: record.name,
      business_unit_ids: record.businessUnitIds || [],
      skills: record.skills || [],
      tag_type_ids: record.tagTypeIds || [],
      priority: record.priority,
      duration: record.duration,
      sold_threshold: record.soldThreshold,
      class: record.class,
      summary: record.summary,
      no_charge: record.noCharge ?? false,
      active: record.active ?? true,
      external_data: record.externalData,
      st_created_on: record.createdOn,
      st_modified_on: record.modifiedOn,
      fetched_at: new Date(),
      full_data: record,
    };
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function syncAllJPM() {
  const results = {};

  const fetchers = [
    { name: 'jobs', fetcher: new JobsFetcher() },
    { name: 'appointments', fetcher: new AppointmentsFetcher() },
    { name: 'job_types', fetcher: new JobTypesFetcher() },
  ];

  for (const { name, fetcher } of fetchers) {
    try {
      results[name] = await fetcher.fullSync();
    } catch (error) {
      results[name] = { success: false, error: error.message };
    } finally {
      await fetcher.close();
    }
  }

  return results;
}

export default {
  JobsFetcher,
  AppointmentsFetcher,
  JobTypesFetcher,
  syncAllJPM,
};
