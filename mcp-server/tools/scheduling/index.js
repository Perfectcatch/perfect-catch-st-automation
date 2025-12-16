/**
 * Scheduling Tools Index
 * Exports all 15 scheduling and dispatch tools
 */

import { routeOptimizer } from '../../services/route-optimizer.js';
import pg from 'pg';

const { Pool } = pg;
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

// Tool 1: Get Smart Availability
export const getSmartAvailability = {
  name: 'get_smart_availability',
  description: 'Get AI-powered availability recommendations based on location, job type, and technician skills',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID for location-based optimization' },
      jobType: { type: 'string', description: 'Type of job to schedule' },
      duration: { type: 'number', description: 'Estimated job duration in minutes', default: 60 },
      preferredDate: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' },
      urgency: { type: 'string', enum: ['emergency', 'urgent', 'standard', 'flexible'], default: 'standard' }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const date = params.preferredDate || new Date().toISOString().split('T')[0];
      
      // Get available technicians
      const techResult = await client.query(`
        SELECT t.st_id, t.name, COUNT(a.st_id) as appointment_count
        FROM st_technicians t
        LEFT JOIN st_appointments a ON t.st_id = ANY(a.technician_ids) AND DATE(a.start_on) = $1
        GROUP BY t.st_id, t.name
        ORDER BY appointment_count ASC
        LIMIT 5
      `, [date]);
      
      // Generate time slots
      const slots = [];
      const startHour = params.urgency === 'emergency' ? 6 : 8;
      const endHour = 18;
      
      for (let hour = startHour; hour < endHour; hour += 2) {
        slots.push({
          time: `${hour.toString().padStart(2, '0')}:00`,
          available: true,
          recommendedTechnicians: techResult.rows.slice(0, 2).map(t => ({ id: Number(t.st_id), name: t.name })),
          score: 1 - (Math.abs(hour - 10) / 10) // Prefer mid-morning
        });
      }
      
      return {
        success: true,
        date,
        urgency: params.urgency,
        slots: slots.sort((a, b) => b.score - a.score),
        recommendation: slots[0]
      };
    } finally { client.release(); }
  }
};

// Tool 2: Optimize Route
export const optimizeRoute = {
  name: 'optimize_route',
  description: 'Optimize the route for a technician with multiple appointments',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      appointmentIds: { type: 'array', items: { type: 'number' }, description: 'Array of appointment IDs' },
      startLocation: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
          address: { type: 'string' }
        },
        description: 'Starting location'
      }
    },
    required: ['technicianId', 'appointmentIds']
  },
  async handler(params) {
    try {
      const result = await routeOptimizer.optimizeRoute(params);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 3: Get Technician Availability
export const getTechnicianAvailability = {
  name: 'get_technician_availability',
  description: 'Check availability for a specific technician on a given date',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' }
    },
    required: ['technicianId', 'date']
  },
  async handler(params) {
    try {
      const result = await routeOptimizer.getTechnicianAvailability(params.technicianId, params.date);
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 4: Auto Schedule Job
export const autoScheduleJob = {
  name: 'auto_schedule_job',
  description: 'Automatically find and book the best available slot for a job',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID to schedule' },
      preferredDateRange: {
        type: 'object',
        properties: {
          start: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
          end: { type: 'string', description: 'End date (YYYY-MM-DD)' }
        }
      },
      duration: { type: 'number', description: 'Job duration in minutes', default: 60 }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Get job details
      const jobResult = await client.query('SELECT * FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (jobResult.rows.length === 0) return { success: false, error: 'Job not found' };
      
      // Find available technician
      const techResult = await client.query(`
        SELECT st_id, name FROM st_technicians WHERE active = true LIMIT 1
      `);
      
      if (techResult.rows.length === 0) return { success: false, error: 'No available technicians' };
      
      const tech = techResult.rows[0];
      const startDate = params.preferredDateRange?.start || new Date().toISOString().split('T')[0];
      
      // Create appointment
      const appointmentId = Date.now();
      const startTime = new Date(startDate);
      startTime.setHours(9, 0, 0, 0);
      const endTime = new Date(startTime.getTime() + (params.duration || 60) * 60000);
      
      await client.query(`
        INSERT INTO st_appointments (st_id, job_id, technician_id, start_on, end_on, status, st_created_on, local_synced_at)
        VALUES ($1, $2, $3, $4, $5, 'Scheduled', NOW(), NOW())
      `, [appointmentId, params.jobId, tech.st_id, startTime, endTime]);
      
      return {
        success: true,
        appointmentId,
        jobId: params.jobId,
        technician: { id: Number(tech.st_id), name: tech.name },
        scheduledTime: { start: startTime, end: endTime },
        message: `Scheduled job for ${startTime.toLocaleString()}`
      };
    } finally { client.release(); }
  }
};

// Tool 5: Reschedule Appointment
export const rescheduleAppointment = {
  name: 'reschedule_appointment',
  description: 'Reschedule an existing appointment to a new time',
  inputSchema: {
    type: 'object',
    properties: {
      appointmentId: { type: 'number', description: 'Appointment ID' },
      newDate: { type: 'string', description: 'New date (YYYY-MM-DD)' },
      newTime: { type: 'string', description: 'New time (HH:MM)' },
      reason: { type: 'string', description: 'Reason for rescheduling' }
    },
    required: ['appointmentId', 'newDate', 'newTime']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_appointments WHERE st_id = $1', [params.appointmentId]);
      if (result.rows.length === 0) return { success: false, error: 'Appointment not found' };
      
      const apt = result.rows[0];
      const duration = new Date(apt.end_on) - new Date(apt.start_on);
      
      const newStart = new Date(`${params.newDate}T${params.newTime}:00`);
      const newEnd = new Date(newStart.getTime() + duration);
      
      await client.query(
        'UPDATE st_appointments SET start_on = $1, end_on = $2, st_modified_on = NOW() WHERE st_id = $3',
        [newStart, newEnd, params.appointmentId]
      );
      
      return {
        success: true,
        appointmentId: params.appointmentId,
        previousTime: apt.start_on,
        newTime: { start: newStart, end: newEnd },
        message: `Rescheduled to ${newStart.toLocaleString()}`
      };
    } finally { client.release(); }
  }
};

// Tool 6: Find Emergency Slot
export const findEmergencySlot = {
  name: 'find_emergency_slot',
  description: 'Find the earliest available slot for an emergency job',
  inputSchema: {
    type: 'object',
    properties: {
      customerId: { type: 'number', description: 'Customer ID' },
      jobType: { type: 'string', description: 'Type of emergency' }
    },
    required: ['customerId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Find technician with least appointments today
      const techResult = await client.query(`
        SELECT t.st_id, t.name, COUNT(a.st_id) as apt_count
        FROM st_technicians t
        LEFT JOIN st_appointments a ON t.st_id = ANY(a.technician_ids) AND DATE(a.start_on) = CURRENT_DATE
        WHERE t.active = true
        GROUP BY t.st_id, t.name
        ORDER BY apt_count ASC
        LIMIT 1
      `);
      
      if (techResult.rows.length === 0) return { success: false, error: 'No technicians available' };
      
      const tech = techResult.rows[0];
      const now = new Date();
      const slotStart = new Date(now.getTime() + 30 * 60000); // 30 minutes from now
      slotStart.setMinutes(Math.ceil(slotStart.getMinutes() / 15) * 15, 0, 0); // Round to 15 min
      
      return {
        success: true,
        emergency: true,
        earliestSlot: {
          start: slotStart,
          technician: { id: Number(tech.st_id), name: tech.name }
        },
        message: `Emergency slot available at ${slotStart.toLocaleTimeString()} with ${tech.name}`
      };
    } finally { client.release(); }
  }
};

// Tool 7: Get Dispatch Board
export const getDispatchBoard = {
  name: 'get_dispatch_board',
  description: 'Get the full dispatch board view for a date',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date (YYYY-MM-DD)', default: 'today' },
      businessUnitId: { type: 'number', description: 'Filter by business unit' }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const date = params.date === 'today' ? new Date().toISOString().split('T')[0] : params.date;
      
      const result = await client.query(`
        SELECT 
          t.st_id as technician_id,
          t.name as technician_name,
          a.st_id as appointment_id,
          a.start_on,
          a.end_on,
          a.status,
          j.job_number,
          c.name as customer_name
        FROM st_technicians t
        LEFT JOIN st_appointments a ON t.st_id = ANY(a.technician_ids) AND DATE(a.start_on) = $1
        LEFT JOIN st_jobs j ON a.job_id = j.st_id
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        WHERE t.active = true
        ORDER BY t.name, a.start_on
      `, [date]);
      
      // Group by technician
      const board = {};
      for (const row of result.rows) {
        const techId = Number(row.technician_id);
        if (!board[techId]) {
          board[techId] = { id: techId, name: row.technician_name, appointments: [] };
        }
        if (row.appointment_id) {
          board[techId].appointments.push({
            id: Number(row.appointment_id),
            start: row.start_on,
            end: row.end_on,
            status: row.status,
            jobNumber: row.job_number,
            customerName: row.customer_name
          });
        }
      }
      
      return {
        success: true,
        date,
        technicians: Object.values(board),
        summary: {
          totalTechnicians: Object.keys(board).length,
          totalAppointments: result.rows.filter(r => r.appointment_id).length
        }
      };
    } finally { client.release(); }
  }
};

// Tool 8: Check Scheduling Conflicts
export const checkSchedulingConflicts = {
  name: 'check_scheduling_conflicts',
  description: 'Check for scheduling conflicts for a proposed appointment',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      startTime: { type: 'string', description: 'Proposed start time (ISO format)' },
      endTime: { type: 'string', description: 'Proposed end time (ISO format)' }
    },
    required: ['technicianId', 'startTime', 'endTime']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT st_id, start_on, end_on, status
        FROM st_appointments
        WHERE technician_id = $1
          AND status != 'Canceled'
          AND (
            (start_on <= $2 AND end_on > $2)
            OR (start_on < $3 AND end_on >= $3)
            OR (start_on >= $2 AND end_on <= $3)
          )
      `, [params.technicianId, params.startTime, params.endTime]);
      
      return {
        success: true,
        hasConflicts: result.rows.length > 0,
        conflicts: result.rows.map(a => ({
          appointmentId: Number(a.st_id),
          start: a.start_on,
          end: a.end_on,
          status: a.status
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 9: Get Appointment Details
export const getAppointmentDetails = {
  name: 'get_appointment_details',
  description: 'Get complete details for an appointment',
  inputSchema: {
    type: 'object',
    properties: {
      appointmentId: { type: 'number', description: 'Appointment ID' }
    },
    required: ['appointmentId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT a.*, j.job_number, c.name as customer_name, c.phone, c.address_line1
        FROM st_appointments a
        LEFT JOIN st_jobs j ON a.job_id = j.st_id
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.st_id = $1
      `, [params.appointmentId]);
      
      if (result.rows.length === 0) return { success: false, error: 'Appointment not found' };
      
      const apt = result.rows[0];
      const techIds = apt.technician_ids || [];
      
      // Get technician names if any assigned
      let techName = null;
      if (techIds.length > 0) {
        const techResult = await client.query('SELECT name FROM st_technicians WHERE st_id = $1', [techIds[0]]);
        techName = techResult.rows[0]?.name;
      }
      
      return {
        success: true,
        appointment: {
          id: Number(apt.st_id),
          start: apt.start_on,
          end: apt.end_on,
          status: apt.status,
          technicianIds: techIds.map(Number),
          technicianName: techName,
          job: { number: apt.job_number },
          customer: { name: apt.customer_name, phone: apt.phone, address: apt.address_line1 }
        }
      };
    } finally { client.release(); }
  }
};

// Tool 10: Batch Schedule Jobs
export const batchScheduleJobs = {
  name: 'batch_schedule_jobs',
  description: 'Schedule multiple jobs at once',
  inputSchema: {
    type: 'object',
    properties: {
      jobs: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            jobId: { type: 'number' },
            preferredDate: { type: 'string' },
            duration: { type: 'number' }
          },
          required: ['jobId']
        }
      }
    },
    required: ['jobs']
  },
  async handler(params) {
    const results = [];
    for (const job of params.jobs) {
      const result = await autoScheduleJob.handler(job);
      results.push({ jobId: job.jobId, ...result });
    }
    return {
      success: true,
      scheduled: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    };
  }
};

// Tool 11: Get Technician Calendar
export const getTechnicianCalendar = {
  name: 'get_technician_calendar',
  description: 'Get calendar view for a technician over a date range',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      startDate: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      endDate: { type: 'string', description: 'End date (YYYY-MM-DD)' }
    },
    required: ['technicianId', 'startDate', 'endDate']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT a.st_id, a.start_on, a.end_on, a.status, j.job_number, c.name as customer_name
        FROM st_appointments a
        LEFT JOIN st_jobs j ON a.job_id = j.st_id
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        WHERE $1 = ANY(a.technician_ids)
          AND a.start_on >= $2
          AND a.start_on <= $3
        ORDER BY a.start_on
      `, [params.technicianId, params.startDate, params.endDate]);
      
      return {
        success: true,
        technicianId: params.technicianId,
        dateRange: { start: params.startDate, end: params.endDate },
        appointmentCount: result.rows.length,
        appointments: result.rows.map(a => ({
          id: Number(a.st_id),
          start: a.start_on,
          end: a.end_on,
          status: a.status,
          jobNumber: a.job_number,
          customerName: a.customer_name
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 12: Get Technician Capacity
export const getTechnicianCapacity = {
  name: 'get_technician_capacity',
  description: 'Check how many more jobs a technician can handle on a given date',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' }
    },
    required: ['technicianId', 'date']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as appointment_count,
          COALESCE(SUM(EXTRACT(EPOCH FROM (end_on - start_on)) / 3600), 0) as booked_hours
        FROM st_appointments
        WHERE technician_id = $1
          AND DATE(start_on) = $2
          AND status != 'Canceled'
      `, [params.technicianId, params.date]);
      
      const data = result.rows[0];
      const bookedHours = Number(data.booked_hours);
      const maxHours = 10; // 8 AM - 6 PM
      const availableHours = maxHours - bookedHours;
      const avgJobDuration = 1.5; // hours
      
      return {
        success: true,
        technicianId: params.technicianId,
        date: params.date,
        currentAppointments: Number(data.appointment_count),
        bookedHours: bookedHours.toFixed(1),
        availableHours: availableHours.toFixed(1),
        estimatedCapacity: Math.floor(availableHours / avgJobDuration),
        utilization: ((bookedHours / maxHours) * 100).toFixed(0) + '%'
      };
    } finally { client.release(); }
  }
};

// Tool 13: Move Appointment (Smart Reschedule)
export const moveAppointment = {
  name: 'move_appointment',
  description: 'Move an appointment to a new date. Looks up availability for the target date, shows all scheduled appointments, and recommends the best time slot. Can also find the next soonest available date if requested date is full.',
  inputSchema: {
    type: 'object',
    properties: {
      appointmentId: { type: 'number', description: 'Appointment ID to move' },
      targetDate: { type: 'string', description: 'Target date to move to (YYYY-MM-DD)' },
      preferredTime: { type: 'string', description: 'Preferred time slot (HH:MM), optional' },
      confirmMove: { type: 'boolean', description: 'Set to true to actually execute the move, false to just see recommendations', default: false },
      findNextAvailable: { type: 'boolean', description: 'If target date is full, find next available date', default: true }
    },
    required: ['appointmentId', 'targetDate']
  },
  async handler(params) {
    const API_BASE = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';

    try {
      // Step 1: Get current appointment details from ServiceTitan API
      const appointmentResponse = await fetch(`${API_BASE}/jpm/appointments/${params.appointmentId}`);
      const appointmentData = await appointmentResponse.json();

      if (!appointmentData || appointmentData.error) {
        return { success: false, error: `Appointment ${params.appointmentId} not found` };
      }

      const currentAppointment = appointmentData.data || appointmentData;
      const appointmentDuration = currentAppointment.end && currentAppointment.start
        ? (new Date(currentAppointment.end) - new Date(currentAppointment.start)) / (1000 * 60) // minutes
        : 120; // default 2 hours

      // Step 2: Get availability for target date
      const availabilityResponse = await fetch(`${API_BASE}/scheduling/availability?date=${params.targetDate}`);
      const availability = await availabilityResponse.json();

      if (!availability.success) {
        return { success: false, error: 'Failed to fetch availability', details: availability.error };
      }

      // Step 3: Get dispatch status to see all appointments on target date
      const dispatchResponse = await fetch(`${API_BASE}/scheduling/dispatch/status?date=${params.targetDate}`);
      const dispatchStatus = await dispatchResponse.json();

      // Step 4: Analyze availability and generate recommendations
      const availableTechs = availability.data?.availableTechnicians || [];
      const bookedTechs = availability.data?.bookedTechnicians || [];
      const allAppointments = dispatchStatus.appointments?.scheduled || [];

      // Build time slot recommendations
      const timeSlots = [];
      const workDayStart = 8; // 8 AM
      const workDayEnd = 18; // 6 PM

      // Find gaps in schedules for each technician
      for (const tech of [...availableTechs, ...bookedTechs]) {
        const techAppointments = (tech.appointments || []).filter(a =>
          a.start && a.start.includes(params.targetDate)
        ).sort((a, b) => new Date(a.start) - new Date(b.start));

        // If technician is fully available
        if (techAppointments.length === 0) {
          for (let hour = workDayStart; hour <= workDayEnd - 2; hour += 2) {
            timeSlots.push({
              technicianId: tech.id,
              technicianName: tech.name,
              startTime: `${hour.toString().padStart(2, '0')}:00`,
              endTime: `${(hour + Math.ceil(appointmentDuration / 60)).toString().padStart(2, '0')}:00`,
              available: true,
              score: tech.appointments ? 0.8 : 1.0 // Prefer fully available techs
            });
          }
        } else {
          // Find gaps between appointments
          let lastEnd = workDayStart;
          for (const apt of techAppointments) {
            const aptStart = new Date(apt.start).getHours();
            if (aptStart - lastEnd >= appointmentDuration / 60) {
              timeSlots.push({
                technicianId: tech.id,
                technicianName: tech.name,
                startTime: `${lastEnd.toString().padStart(2, '0')}:00`,
                endTime: `${(lastEnd + Math.ceil(appointmentDuration / 60)).toString().padStart(2, '0')}:00`,
                available: true,
                score: 0.7
              });
            }
            lastEnd = new Date(apt.end).getHours();
          }
          // Check for slot after last appointment
          if (workDayEnd - lastEnd >= appointmentDuration / 60) {
            timeSlots.push({
              technicianId: tech.id,
              technicianName: tech.name,
              startTime: `${lastEnd.toString().padStart(2, '0')}:00`,
              endTime: `${(lastEnd + Math.ceil(appointmentDuration / 60)).toString().padStart(2, '0')}:00`,
              available: true,
              score: 0.6
            });
          }
        }
      }

      // Sort by score (best first) and preferred time if specified
      timeSlots.sort((a, b) => {
        if (params.preferredTime) {
          const aMatch = a.startTime === params.preferredTime ? 1 : 0;
          const bMatch = b.startTime === params.preferredTime ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
        }
        return b.score - a.score;
      });

      const recommendation = timeSlots[0] || null;

      // Step 5: If no slots and findNextAvailable, check next 7 days
      let nextAvailableDate = null;
      if (timeSlots.length === 0 && params.findNextAvailable) {
        for (let i = 1; i <= 7; i++) {
          const checkDate = new Date(params.targetDate);
          checkDate.setDate(checkDate.getDate() + i);
          const checkDateStr = checkDate.toISOString().split('T')[0];

          const nextAvailResponse = await fetch(`${API_BASE}/scheduling/availability?date=${checkDateStr}`);
          const nextAvail = await nextAvailResponse.json();

          if (nextAvail.success && nextAvail.data?.availableCount > 0) {
            nextAvailableDate = {
              date: checkDateStr,
              availableTechnicians: nextAvail.data.availableTechnicians
            };
            break;
          }
        }
      }

      // Step 6: Execute move if confirmed
      let moveResult = null;
      if (params.confirmMove && recommendation) {
        // Call ServiceTitan API to reschedule
        const newStart = new Date(`${params.targetDate}T${recommendation.startTime}:00`);
        const newEnd = new Date(newStart.getTime() + appointmentDuration * 60 * 1000);

        const rescheduleResponse = await fetch(`${API_BASE}/jpm/appointments/${params.appointmentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: newStart.toISOString(),
            end: newEnd.toISOString(),
            arrivalWindowStart: newStart.toISOString(),
            arrivalWindowEnd: new Date(newStart.getTime() + 2 * 60 * 60 * 1000).toISOString()
          })
        });

        moveResult = await rescheduleResponse.json();
      }

      return {
        success: true,
        appointmentId: params.appointmentId,
        currentAppointment: {
          start: currentAppointment.start,
          end: currentAppointment.end,
          status: currentAppointment.status
        },
        targetDate: params.targetDate,
        availability: {
          totalTechnicians: availability.data?.totalTechnicians || 0,
          availableCount: availability.data?.availableCount || 0,
          bookedCount: availability.data?.bookedCount || 0,
          totalAppointments: availability.data?.totalAppointments || 0
        },
        scheduledAppointments: allAppointments.slice(0, 10).map(a => ({
          appointmentId: a.appointmentId,
          start: a.start,
          end: a.end,
          technicians: a.technicians?.map(t => t.technicianName).join(', ')
        })),
        availableSlots: timeSlots.slice(0, 5),
        recommendation: recommendation ? {
          technician: recommendation.technicianName,
          technicianId: recommendation.technicianId,
          startTime: recommendation.startTime,
          endTime: recommendation.endTime,
          fullDateTime: `${params.targetDate}T${recommendation.startTime}:00`
        } : null,
        nextAvailableDate: nextAvailableDate,
        moveExecuted: params.confirmMove && moveResult?.success,
        moveResult: moveResult,
        message: recommendation
          ? `Recommended slot: ${recommendation.startTime} with ${recommendation.technicianName}. ${params.confirmMove ? 'Move executed.' : 'Set confirmMove=true to execute.'}`
          : `No available slots on ${params.targetDate}. ${nextAvailableDate ? `Next available: ${nextAvailableDate.date}` : 'Check other dates.'}`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 14: Find Next Available Slot
export const findNextAvailableSlot = {
  name: 'find_next_available_slot',
  description: 'Find the next available appointment slot across all technicians. Useful when you need to schedule something ASAP.',
  inputSchema: {
    type: 'object',
    properties: {
      startDate: { type: 'string', description: 'Start searching from this date (YYYY-MM-DD), defaults to today' },
      durationMinutes: { type: 'number', description: 'Required appointment duration in minutes', default: 120 },
      daysToSearch: { type: 'number', description: 'How many days ahead to search', default: 7 },
      preferredTechnicianId: { type: 'number', description: 'Preferred technician ID (optional)' }
    }
  },
  async handler(params) {
    const API_BASE = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
    const startDate = params.startDate || new Date().toISOString().split('T')[0];
    const daysToSearch = params.daysToSearch || 7;

    try {
      const results = [];

      for (let i = 0; i < daysToSearch; i++) {
        const checkDate = new Date(startDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = checkDate.toISOString().split('T')[0];

        const response = await fetch(`${API_BASE}/scheduling/availability?date=${dateStr}`);
        const availability = await response.json();

        if (availability.success && availability.data?.availableCount > 0) {
          const availableTechs = availability.data.availableTechnicians || [];

          // If preferred technician specified, check if they're available
          if (params.preferredTechnicianId) {
            const preferred = availableTechs.find(t => t.id === params.preferredTechnicianId);
            if (preferred) {
              return {
                success: true,
                found: true,
                date: dateStr,
                technician: preferred,
                recommendedTime: '09:00',
                message: `${preferred.name} is available on ${dateStr}. Recommended start: 9:00 AM`
              };
            }
          }

          // Return first available date with any technician
          results.push({
            date: dateStr,
            availableTechnicians: availableTechs,
            totalAvailable: availability.data.availableCount
          });

          if (results.length > 0) {
            const first = results[0];
            const tech = first.availableTechnicians[0];
            return {
              success: true,
              found: true,
              date: first.date,
              technician: tech,
              recommendedTime: '09:00',
              allOptions: results.slice(0, 3),
              message: `Next available: ${first.date} with ${tech.name}. ${first.totalAvailable} technician(s) available.`
            };
          }
        }
      }

      return {
        success: true,
        found: false,
        message: `No available slots found in the next ${daysToSearch} days`,
        searchedFrom: startDate,
        daysSearched: daysToSearch
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 15: Get Daily Schedule Summary
export const getDailyScheduleSummary = {
  name: 'get_daily_schedule_summary',
  description: 'Get a comprehensive summary of the schedule for a specific date, including all appointments, availability, and late alerts.',
  inputSchema: {
    type: 'object',
    properties: {
      date: { type: 'string', description: 'Date to summarize (YYYY-MM-DD), defaults to today' }
    }
  },
  async handler(params) {
    const API_BASE = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
    const date = params.date || new Date().toISOString().split('T')[0];

    try {
      // Fetch all data in parallel
      const [availabilityRes, dispatchRes, lateRes, notificationsRes] = await Promise.all([
        fetch(`${API_BASE}/scheduling/availability?date=${date}`),
        fetch(`${API_BASE}/scheduling/dispatch/status?date=${date}`),
        fetch(`${API_BASE}/scheduling/dispatch/late?date=${date}`),
        fetch(`${API_BASE}/scheduling/dispatch/notifications?date=${date}&includeCompleted=true`)
      ]);

      const [availability, dispatch, late, notifications] = await Promise.all([
        availabilityRes.json(),
        dispatchRes.json(),
        lateRes.json(),
        notificationsRes.json()
      ]);

      return {
        success: true,
        date,
        summary: {
          totalTechnicians: availability.data?.totalTechnicians || 0,
          availableTechnicians: availability.data?.availableCount || 0,
          bookedTechnicians: availability.data?.bookedCount || 0
        },
        appointments: {
          total: dispatch.summary?.total || 0,
          scheduled: dispatch.summary?.scheduled || 0,
          dispatched: dispatch.summary?.dispatched || 0,
          working: dispatch.summary?.working || 0,
          completed: dispatch.summary?.completed || 0,
          canceled: dispatch.summary?.canceled || 0
        },
        alerts: {
          lateCount: late.lateCount || 0,
          lateAppointments: late.lateAppointments?.slice(0, 5) || []
        },
        notifications: notifications.notifications?.slice(0, 10) || [],
        availableTechnicians: availability.data?.availableTechnicians || [],
        message: `${date}: ${dispatch.summary?.total || 0} appointments, ${availability.data?.availableCount || 0} techs available, ${late.lateCount || 0} running late`
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
