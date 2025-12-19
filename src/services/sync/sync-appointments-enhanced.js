/**
 * Enhanced Appointments Sync Module
 * Syncs appointments with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class AppointmentSync extends SyncBase {
  constructor() {
    super('appointments');
  }
  
  async fetchList() {
    // Try multiple endpoint patterns
    const endpoints = [
      '/dispatch/v2/tenant/{tenant}/appointments',
      '/jpm/v2/tenant/{tenant}/appointments'
    ];
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const sixtyDaysForward = new Date();
    sixtyDaysForward.setDate(sixtyDaysForward.getDate() + 60);
    
    for (const endpoint of endpoints) {
      try {
        this.logger.info(`[appointments] Trying endpoint: ${endpoint}`);
        
        const result = await fetchAllPages(endpoint, {
          startsOnOrAfter: thirtyDaysAgo.toISOString(),
          startsOnOrBefore: sixtyDaysForward.toISOString()
        });
        
        if (result.length > 0) {
          this.logger.info(`[appointments] Found ${result.length} appointments`);
          return result;
        }
      } catch (error) {
        this.logger.warn(`[appointments] Endpoint ${endpoint} failed: ${error.message}`);
        continue;
      }
    }
    
    // Fallback: fetch from jobs
    this.logger.info('[appointments] Trying to fetch appointments via jobs...');
    return this.fetchAppointmentsViaJobs();
  }
  
  async fetchAppointmentsViaJobs() {
    const client = await getPool().connect();
    try {
      const jobs = await client.query(`
        SELECT st_id, full_data
        FROM st_jobs
        WHERE job_status IN ('Scheduled', 'Dispatched', 'InProgress')
      `);
      
      const appointments = [];
      
      for (const job of jobs.rows) {
        const jobData = job.full_data || {};
        if (jobData.appointments?.length > 0) {
          appointments.push(...jobData.appointments.map(apt => ({
            ...apt,
            jobId: Number(job.st_id)
          })));
        }
      }
      
      return appointments;
    } finally {
      client.release();
    }
  }
  
  async enrichOne(appointment) {
    try {
      const details = await fetchDetails('/dispatch/v2/tenant/{tenant}/appointments', appointment.id);
      return {
        ...(details || appointment),
        _enrichedAt: new Date()
      };
    } catch (e) {
      return {
        ...appointment,
        _enrichedAt: new Date()
      };
    }
  }
  
  async transformOne(appointment) {
    return {
      st_id: BigInt(appointment.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // References
      job_id: appointment.jobId ? BigInt(appointment.jobId) : null,
      customer_id: appointment.customerId ? BigInt(appointment.customerId) : null,
      location_id: appointment.locationId ? BigInt(appointment.locationId) : null,
      technician_id: appointment.technicianId ? BigInt(appointment.technicianId) : null,
      
      // Appointment info
      appointment_number: appointment.number || `APT${appointment.id}`,
      status: appointment.status || 'Scheduled',
      type: appointment.type || appointment.appointmentType || null,
      
      // Scheduling - handle multiple field names
      start_on: appointment.start ? new Date(appointment.start) : 
                appointment.scheduledStart ? new Date(appointment.scheduledStart) :
                appointment.startOn ? new Date(appointment.startOn) : null,
      end_on: appointment.end ? new Date(appointment.end) :
              appointment.scheduledEnd ? new Date(appointment.scheduledEnd) :
              appointment.endOn ? new Date(appointment.endOn) : null,
      start_time: appointment.start ? new Date(appointment.start) : 
                  appointment.scheduledStart ? new Date(appointment.scheduledStart) : null,
      end_time: appointment.end ? new Date(appointment.end) :
                appointment.scheduledEnd ? new Date(appointment.scheduledEnd) : null,
      duration_minutes: appointment.duration || 60,
      
      // Arrival
      arrival_window_start: appointment.arrivalWindowStart ? new Date(appointment.arrivalWindowStart) : null,
      arrival_window_end: appointment.arrivalWindowEnd ? new Date(appointment.arrivalWindowEnd) : null,
      actual_arrival: appointment.actualArrival ? new Date(appointment.actualArrival) : null,
      actual_departure: appointment.actualDeparture ? new Date(appointment.actualDeparture) : null,
      
      // Technician info
      technician_ids: appointment.technicianIds || (appointment.technicianId ? [appointment.technicianId] : []),
      technician_name: appointment.technicianName || null,
      
      // Notes
      notes: appointment.notes || appointment.specialInstructions || null,
      
      // Timestamps
      st_created_on: appointment.createdOn ? new Date(appointment.createdOn) : new Date(),
      st_modified_on: appointment.modifiedOn ? new Date(appointment.modifiedOn) : new Date(),
      
      // Raw data
      full_data: appointment,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(appointment) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_appointments WHERE st_id = $1',
        [appointment.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_appointments (
            st_id, tenant_id, job_id, customer_id, location_id, technician_id,
            appointment_number, status, type,
            start_on, end_on, start_time, end_time, duration_minutes,
            arrival_window_start, arrival_window_end, actual_arrival, actual_departure,
            technician_ids, technician_name, notes,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21,
            $22, $23, $24, $25
          )
        `, [
          appointment.st_id,
          appointment.tenant_id,
          appointment.job_id,
          appointment.customer_id,
          appointment.location_id,
          appointment.technician_id,
          appointment.appointment_number,
          appointment.status,
          appointment.type,
          appointment.start_on,
          appointment.end_on,
          appointment.start_time,
          appointment.end_time,
          appointment.duration_minutes,
          appointment.arrival_window_start,
          appointment.arrival_window_end,
          appointment.actual_arrival,
          appointment.actual_departure,
          appointment.technician_ids,
          appointment.technician_name,
          appointment.notes,
          appointment.st_created_on,
          appointment.st_modified_on,
          JSON.stringify(appointment.full_data),
          appointment.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_appointments SET
            job_id = $2, customer_id = $3, location_id = $4, technician_id = $5,
            appointment_number = $6, status = $7, type = $8,
            start_on = $9, end_on = $10, start_time = $11, end_time = $12, duration_minutes = $13,
            arrival_window_start = $14, arrival_window_end = $15, actual_arrival = $16, actual_departure = $17,
            technician_ids = $18, technician_name = $19, notes = $20,
            st_modified_on = $21, full_data = $22, last_synced_at = $23
          WHERE st_id = $1
        `, [
          appointment.st_id,
          appointment.job_id,
          appointment.customer_id,
          appointment.location_id,
          appointment.technician_id,
          appointment.appointment_number,
          appointment.status,
          appointment.type,
          appointment.start_on,
          appointment.end_on,
          appointment.start_time,
          appointment.end_time,
          appointment.duration_minutes,
          appointment.arrival_window_start,
          appointment.arrival_window_end,
          appointment.actual_arrival,
          appointment.actual_departure,
          appointment.technician_ids,
          appointment.technician_name,
          appointment.notes,
          appointment.st_modified_on,
          JSON.stringify(appointment.full_data),
          appointment.last_synced_at
        ]);
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
}

export const appointmentSync = new AppointmentSync();

export async function syncAppointments() {
  return appointmentSync.run();
}

export default { AppointmentSync, syncAppointments };
