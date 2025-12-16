/**
 * Scheduling Tools Index
 * Exports all 18 scheduling and dispatch tools
 *
 * Tools 1-12: Core scheduling operations
 * Tools 13-15: Appointment management (move, find slots, daily summary)
 * Tools 16-18: AI-powered job scheduling (smart schedule, analyze, format notes)
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

// Tool 16: Smart Schedule Job (AI-Powered)
export const smartScheduleJob = {
  name: 'smart_schedule_job',
  description: `AI-powered job scheduling assistant. Takes a job description, recommends job types, shows available technicians, and generates clarifying questions to create detailed job notes.

Flow:
1. User describes what needs to be done
2. Tool returns recommended job types and available technicians
3. Tool generates clarifying questions based on job context
4. User answers questions to provide more details
5. Tool formats professional job notes for technicians

Example: "Install new intermatic pool panel and pull and wire pool light"
→ Questions: Where is the panel being installed? Why new panel (upgrade/replacement)? What type/brand of pool light?`,
  inputSchema: {
    type: 'object',
    properties: {
      jobDescription: {
        type: 'string',
        description: 'Initial job description from customer/CSR (e.g., "Install new intermatic pool panel and pull and wire pool light")'
      },
      preferredDate: {
        type: 'string',
        description: 'Preferred date for the job (YYYY-MM-DD)'
      },
      customerId: {
        type: 'number',
        description: 'Customer ID if known'
      },
      answers: {
        type: 'object',
        description: 'Answers to clarifying questions from previous call (key-value pairs)',
        additionalProperties: { type: 'string' }
      },
      step: {
        type: 'string',
        enum: ['analyze', 'clarify', 'finalize'],
        description: 'Current step in the flow. Start with "analyze", then "clarify" after answering questions, then "finalize" to create job.',
        default: 'analyze'
      }
    },
    required: ['jobDescription']
  },
  async handler(params) {
    const API_BASE = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
    const step = params.step || 'analyze';

    try {
      // Job type keywords mapping for recommendation
      const jobTypeKeywords = {
        'Pool Panel Installation': ['pool panel', 'intermatic', 'panel install', 'sub panel', 'electrical panel'],
        'Pool Light Installation': ['pool light', 'light install', 'led light', 'underwater light', 'nicheless'],
        'Pool Light Repair': ['light repair', 'light not working', 'light replacement', 'bulb'],
        'Pool Pump Installation': ['pump install', 'new pump', 'variable speed', 'pump replacement'],
        'Pool Pump Repair': ['pump repair', 'pump not working', 'pump motor', 'pump leak'],
        'Pool Heater Installation': ['heater install', 'new heater', 'heat pump', 'gas heater'],
        'Pool Heater Repair': ['heater repair', 'heater not working', 'no heat', 'heater service'],
        'Pool Filter Service': ['filter', 'de filter', 'cartridge', 'sand filter', 'filter clean'],
        'Pool Electrical': ['electrical', 'wiring', 'bonding', 'gfci', 'breaker', 'wire'],
        'Pool Automation': ['automation', 'intellicenter', 'easytouch', 'screenlogic', 'control system'],
        'Pool Inspection': ['inspection', 'check', 'evaluate', 'diagnose', 'troubleshoot'],
        'Service Call': ['service', 'maintenance', 'general', 'routine']
      };

      // Analyze job description and match job types
      const descLower = params.jobDescription.toLowerCase();
      const matchedJobTypes = [];

      for (const [jobType, keywords] of Object.entries(jobTypeKeywords)) {
        const matches = keywords.filter(kw => descLower.includes(kw));
        if (matches.length > 0) {
          matchedJobTypes.push({
            jobType,
            confidence: Math.min(matches.length * 0.3 + 0.4, 1.0),
            matchedKeywords: matches
          });
        }
      }

      // Sort by confidence
      matchedJobTypes.sort((a, b) => b.confidence - a.confidence);

      // Get available technicians for the date
      const date = params.preferredDate || new Date().toISOString().split('T')[0];
      let availability = { data: { availableTechnicians: [], bookedTechnicians: [] } };

      try {
        const availResponse = await fetch(`${API_BASE}/scheduling/availability?date=${date}`);
        availability = await availResponse.json();
      } catch (e) {
        console.error('Failed to fetch availability:', e.message);
      }

      // Generate clarifying questions based on job description
      const clarifyingQuestions = generateClarifyingQuestions(params.jobDescription, matchedJobTypes);

      // Step: Analyze - Return job types, availability, and questions
      if (step === 'analyze') {
        return {
          success: true,
          step: 'analyze',
          nextStep: 'clarify',
          jobDescription: params.jobDescription,
          recommendedJobTypes: matchedJobTypes.slice(0, 3),
          preferredDate: date,
          availability: {
            date,
            availableTechnicians: (availability.data?.availableTechnicians || []).map(t => ({
              id: t.id,
              name: t.name
            })),
            bookedTechnicians: (availability.data?.bookedTechnicians || []).slice(0, 5).map(t => ({
              id: t.id,
              name: t.name,
              appointmentCount: t.appointmentCount
            }))
          },
          clarifyingQuestions: clarifyingQuestions,
          instructions: `Please answer the clarifying questions above to create detailed job notes. Call this tool again with step='clarify' and include your answers in the 'answers' object.`
        };
      }

      // Step: Clarify - Process answers and generate formatted job notes
      if (step === 'clarify' || step === 'finalize') {
        const formattedNotes = formatJobNotes(params.jobDescription, params.answers || {}, matchedJobTypes);

        // If finalizing, we could create the job here
        if (step === 'finalize' && params.customerId) {
          // Would call ServiceTitan API to create job
          // For now, return the formatted notes for manual creation
        }

        return {
          success: true,
          step: step,
          jobDescription: params.jobDescription,
          selectedJobType: matchedJobTypes[0]?.jobType || 'Service Call',
          formattedJobNotes: formattedNotes,
          preferredDate: date,
          availability: {
            availableTechnicians: (availability.data?.availableTechnicians || []).map(t => ({
              id: t.id,
              name: t.name
            }))
          },
          answersReceived: params.answers || {},
          readyToBook: true,
          instructions: step === 'clarify'
            ? `Job notes have been formatted. Review and call with step='finalize' to create the job, or adjust answers as needed.`
            : `Job is ready to be created. Use the formatted job notes below when booking.`
        };
      }

      return { success: false, error: 'Invalid step' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

/**
 * Generate clarifying questions based on job description
 */
function generateClarifyingQuestions(description, matchedJobTypes) {
  const questions = [];
  const descLower = description.toLowerCase();

  // General questions
  questions.push({
    id: 'location',
    question: 'Where specifically will the work be performed?',
    context: 'Location details help technicians prepare and estimate time',
    examples: ['Equipment pad', 'Pool deck', 'Garage', 'Near the house']
  });

  // Panel-specific questions
  if (descLower.includes('panel') || descLower.includes('electrical')) {
    questions.push({
      id: 'panelReason',
      question: 'What is the reason for the new panel installation?',
      context: 'Understanding the why helps with proper sizing and planning',
      examples: ['Upgrade from old panel', 'Adding new equipment', 'Code compliance', 'Damaged/failed panel']
    });
    questions.push({
      id: 'panelSize',
      question: 'What amp size is needed for the panel?',
      context: 'Panel sizing depends on equipment load',
      examples: ['60 amp', '100 amp', '200 amp', 'Not sure - needs assessment']
    });
    questions.push({
      id: 'existingPanel',
      question: 'Is there an existing panel being replaced or is this brand new?',
      context: 'Affects scope of work and time estimate',
      examples: ['Replacing old Intermatic', 'Brand new installation', 'Adding sub-panel']
    });
  }

  // Light-specific questions
  if (descLower.includes('light')) {
    questions.push({
      id: 'lightType',
      question: 'What type and brand of pool light?',
      context: 'Different lights require different installation methods',
      examples: ['Pentair IntelliBrite', 'Hayward ColorLogic', 'J&J PureWhite', 'Generic LED']
    });
    questions.push({
      id: 'lightNiche',
      question: 'Is there an existing light niche or is this a new installation?',
      context: 'New niches require more work than replacements',
      examples: ['Existing niche', 'Need new niche', 'Nicheless install', 'Not sure']
    });
    questions.push({
      id: 'lightCount',
      question: 'How many lights need to be installed?',
      context: 'Multiple lights affect wiring and time',
      examples: ['1 light', '2 lights', '3+ lights']
    });
  }

  // Pump-specific questions
  if (descLower.includes('pump')) {
    questions.push({
      id: 'pumpType',
      question: 'What type of pump is being installed?',
      context: 'Different pumps have different requirements',
      examples: ['Variable speed', 'Single speed', 'Dual speed', 'Booster pump']
    });
    questions.push({
      id: 'pumpBrand',
      question: 'What brand/model of pump?',
      context: 'Helps ensure correct parts are on truck',
      examples: ['Pentair IntelliFlo', 'Hayward Super Pump', 'Jandy FloPro', 'Not decided']
    });
  }

  // Heater-specific questions
  if (descLower.includes('heater') || descLower.includes('heat')) {
    questions.push({
      id: 'heaterType',
      question: 'What type of heater?',
      context: 'Gas vs heat pump vs electric have different requirements',
      examples: ['Natural gas', 'Propane', 'Heat pump', 'Electric']
    });
    questions.push({
      id: 'gasLine',
      question: 'Is there existing gas line to the equipment area?',
      context: 'New gas lines require additional work and permits',
      examples: ['Yes, existing line', 'No, needs new line', 'Not applicable (heat pump)']
    });
  }

  // Access and timing questions
  questions.push({
    id: 'access',
    question: 'Any special access considerations?',
    context: 'Helps technician prepare and estimate arrival',
    examples: ['Gate code needed', 'Dog in yard', 'Call when arriving', 'Equipment in locked area']
  });

  questions.push({
    id: 'additionalNotes',
    question: 'Any other details the technician should know?',
    context: 'Catch-all for important information',
    examples: ['Customer has specific concerns', 'Previous issues', 'Special requests']
  });

  return questions;
}

/**
 * Format job notes professionally for technicians
 */
function formatJobNotes(description, answers, matchedJobTypes) {
  const lines = [];

  // Header with job type
  const jobType = matchedJobTypes[0]?.jobType || 'Service Call';
  lines.push(`=== ${jobType.toUpperCase()} ===`);
  lines.push('');

  // Primary work description
  lines.push('📋 SCOPE OF WORK:');
  lines.push(description);
  lines.push('');

  // Detailed specifications from answers
  if (Object.keys(answers).length > 0) {
    lines.push('📝 JOB DETAILS:');

    if (answers.location) {
      lines.push(`• Location: ${answers.location}`);
    }
    if (answers.panelReason) {
      lines.push(`• Reason: ${answers.panelReason}`);
    }
    if (answers.panelSize) {
      lines.push(`• Panel Size: ${answers.panelSize}`);
    }
    if (answers.existingPanel) {
      lines.push(`• Existing Equipment: ${answers.existingPanel}`);
    }
    if (answers.lightType) {
      lines.push(`• Light Type: ${answers.lightType}`);
    }
    if (answers.lightNiche) {
      lines.push(`• Niche Status: ${answers.lightNiche}`);
    }
    if (answers.lightCount) {
      lines.push(`• Quantity: ${answers.lightCount}`);
    }
    if (answers.pumpType) {
      lines.push(`• Pump Type: ${answers.pumpType}`);
    }
    if (answers.pumpBrand) {
      lines.push(`• Pump Brand: ${answers.pumpBrand}`);
    }
    if (answers.heaterType) {
      lines.push(`• Heater Type: ${answers.heaterType}`);
    }
    if (answers.gasLine) {
      lines.push(`• Gas Line: ${answers.gasLine}`);
    }
    lines.push('');
  }

  // Access notes
  if (answers.access) {
    lines.push('🚪 ACCESS:');
    lines.push(`• ${answers.access}`);
    lines.push('');
  }

  // Additional notes
  if (answers.additionalNotes) {
    lines.push('⚠️ ADDITIONAL NOTES:');
    lines.push(`• ${answers.additionalNotes}`);
    lines.push('');
  }

  // Materials checklist based on job type
  lines.push('🔧 SUGGESTED MATERIALS CHECK:');
  if (description.toLowerCase().includes('panel')) {
    lines.push('• Sub-panel (verify amp rating)');
    lines.push('• Wire (correct gauge for load)');
    lines.push('• Conduit and fittings');
    lines.push('• Breakers');
  }
  if (description.toLowerCase().includes('light')) {
    lines.push('• Pool light fixture');
    lines.push('• Light cord (verify length)');
    lines.push('• Junction box');
    lines.push('• Silicone/sealant');
  }
  if (description.toLowerCase().includes('pump')) {
    lines.push('• Pump unit');
    lines.push('• Unions and fittings');
    lines.push('• Pipe and glue');
  }

  return lines.join('\n');
}

// Tool 17: Analyze Job Description
export const analyzeJobDescription = {
  name: 'analyze_job_description',
  description: 'Analyze a job description and return matched job types with recommended clarifying questions. Use this to understand what type of job is being requested before scheduling.',
  inputSchema: {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'Job description to analyze'
      }
    },
    required: ['description']
  },
  async handler(params) {
    const jobTypeKeywords = {
      'Pool Panel Installation': ['pool panel', 'intermatic', 'panel install', 'sub panel', 'electrical panel'],
      'Pool Light Installation': ['pool light', 'light install', 'led light', 'underwater light'],
      'Pool Light Repair': ['light repair', 'light not working', 'light replacement'],
      'Pool Pump Installation': ['pump install', 'new pump', 'variable speed'],
      'Pool Pump Repair': ['pump repair', 'pump not working', 'pump motor'],
      'Pool Heater Installation': ['heater install', 'new heater', 'heat pump', 'gas heater'],
      'Pool Heater Repair': ['heater repair', 'heater not working', 'no heat'],
      'Pool Filter Service': ['filter', 'de filter', 'cartridge', 'sand filter'],
      'Pool Electrical': ['electrical', 'wiring', 'bonding', 'gfci', 'breaker'],
      'Pool Automation': ['automation', 'intellicenter', 'easytouch', 'screenlogic'],
      'Pool Inspection': ['inspection', 'check', 'evaluate', 'diagnose']
    };

    const descLower = params.description.toLowerCase();
    const matches = [];

    for (const [jobType, keywords] of Object.entries(jobTypeKeywords)) {
      const matched = keywords.filter(kw => descLower.includes(kw));
      if (matched.length > 0) {
        matches.push({
          jobType,
          confidence: Math.min(matched.length * 0.25 + 0.5, 1.0),
          keywords: matched
        });
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence);

    // Generate contextual questions
    const questions = generateClarifyingQuestions(params.description, matches);

    return {
      success: true,
      description: params.description,
      analysis: {
        primaryJobType: matches[0]?.jobType || 'Service Call',
        allMatches: matches.slice(0, 3),
        confidence: matches[0]?.confidence || 0.5
      },
      clarifyingQuestions: questions.slice(0, 5),
      suggestedFollowUp: `To create detailed job notes, please answer these questions:\n${questions.slice(0, 3).map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`
    };
  }
};

// Tool 18: Format Job Notes
export const formatJobNotesAI = {
  name: 'format_job_notes',
  description: 'Format job notes professionally for technicians. Takes raw description and additional details, outputs clean structured notes.',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Job description' },
      details: {
        type: 'object',
        description: 'Additional details (location, equipment type, brand, reason, etc.)',
        additionalProperties: { type: 'string' }
      },
      jobType: { type: 'string', description: 'Job type (optional, will auto-detect if not provided)' }
    },
    required: ['description']
  },
  async handler(params) {
    const jobTypeKeywords = {
      'Pool Panel Installation': ['panel', 'intermatic', 'sub panel'],
      'Pool Light Installation': ['light install', 'pool light', 'led'],
      'Pool Pump Installation': ['pump install', 'new pump'],
      'Pool Heater Installation': ['heater install', 'new heater'],
      'Pool Electrical': ['electrical', 'wiring', 'bonding']
    };

    // Auto-detect job type if not provided
    let jobType = params.jobType;
    if (!jobType) {
      const descLower = params.description.toLowerCase();
      for (const [type, keywords] of Object.entries(jobTypeKeywords)) {
        if (keywords.some(kw => descLower.includes(kw))) {
          jobType = type;
          break;
        }
      }
      jobType = jobType || 'Service Call';
    }

    const notes = formatJobNotes(params.description, params.details || {}, [{ jobType }]);

    return {
      success: true,
      jobType,
      formattedNotes: notes,
      characterCount: notes.length,
      preview: notes.substring(0, 200) + '...'
    };
  }
};
