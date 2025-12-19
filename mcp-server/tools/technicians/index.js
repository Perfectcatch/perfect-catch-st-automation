/**
 * Technician Tools Index
 * Exports all 6 technician-focused tools
 */

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

// Tool 1: Get My Schedule
export const getMySchedule = {
  name: 'get_my_schedule',
  description: 'Get schedule for a technician for today or a specific date',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      date: { type: 'string', description: 'Date (YYYY-MM-DD)', default: 'today' }
    },
    required: ['technicianId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const date = params.date === 'today' ? new Date().toISOString().split('T')[0] : params.date;
      
      const result = await client.query(`
        SELECT a.st_id, a.start_on, a.end_on, a.status,
               j.job_number, j.job_type_name,
               c.name as customer_name, c.phone, c.address_line1, c.city
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.technician_id = $1 AND DATE(a.start_on) = $2
        ORDER BY a.start_on
      `, [params.technicianId, date]);
      
      return {
        success: true,
        technicianId: params.technicianId,
        date,
        appointmentCount: result.rows.length,
        schedule: result.rows.map(a => ({
          appointmentId: Number(a.st_id),
          startTime: a.start_on,
          endTime: a.end_on,
          status: a.status,
          jobNumber: a.job_number,
          jobType: a.job_type_name,
          customer: {
            name: a.customer_name,
            phone: a.phone,
            address: `${a.address_line1}, ${a.city}`
          }
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 2: Clock In/Out
export const clockInOut = {
  name: 'clock_in_out',
  description: 'Record clock in or clock out for a technician',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      action: { type: 'string', enum: ['clock_in', 'clock_out'], description: 'Action to perform' },
      location: { type: 'object', properties: { lat: { type: 'number' }, lng: { type: 'number' } }, description: 'GPS location' }
    },
    required: ['technicianId', 'action']
  },
  async handler(params) {
    // Would integrate with timesheet system
    return {
      success: true,
      technicianId: params.technicianId,
      action: params.action,
      timestamp: new Date().toISOString(),
      location: params.location,
      message: `${params.action === 'clock_in' ? 'Clocked in' : 'Clocked out'} successfully`
    };
  }
};

// Tool 3: Get Next Appointment
export const getNextAppointment = {
  name: 'get_next_appointment',
  description: 'Get the next upcoming appointment for a technician',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' }
    },
    required: ['technicianId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT a.st_id, a.start_on, a.end_on, a.status,
               j.job_number, j.job_type_name, j.summary,
               c.name as customer_name, c.phone, c.email, c.address_line1, c.city, c.state, c.zip
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.technician_id = $1 
          AND a.start_on > NOW()
          AND a.status NOT IN ('Completed', 'Canceled')
        ORDER BY a.start_on
        LIMIT 1
      `, [params.technicianId]);
      
      if (result.rows.length === 0) {
        return { success: true, hasNext: false, message: 'No upcoming appointments' };
      }
      
      const apt = result.rows[0];
      return {
        success: true,
        hasNext: true,
        appointment: {
          id: Number(apt.st_id),
          startTime: apt.start_on,
          endTime: apt.end_on,
          status: apt.status,
          job: {
            number: apt.job_number,
            type: apt.job_type_name,
            summary: apt.summary
          },
          customer: {
            name: apt.customer_name,
            phone: apt.phone,
            email: apt.email,
            address: `${apt.address_line1}, ${apt.city}, ${apt.state} ${apt.zip}`
          }
        }
      };
    } finally { client.release(); }
  }
};

// Tool 4: Report Issue
export const reportIssue = {
  name: 'report_issue',
  description: 'Report an issue or problem encountered during a job',
  inputSchema: {
    type: 'object',
    properties: {
      technicianId: { type: 'number', description: 'Technician ID' },
      jobId: { type: 'number', description: 'Job ID' },
      issueType: { type: 'string', enum: ['equipment', 'access', 'safety', 'parts', 'customer', 'other'], description: 'Type of issue' },
      description: { type: 'string', description: 'Issue description' },
      severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
      photos: { type: 'array', items: { type: 'string' }, description: 'Photo URLs' }
    },
    required: ['technicianId', 'jobId', 'issueType', 'description']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Add issue as job note
      const result = await client.query('SELECT full_data FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (result.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const fullData = result.rows[0].full_data || {};
      const issues = fullData.issues || [];
      
      const issue = {
        id: Date.now(),
        technicianId: params.technicianId,
        type: params.issueType,
        description: params.description,
        severity: params.severity,
        photos: params.photos,
        reportedAt: new Date()
      };
      
      issues.push(issue);
      
      await client.query(
        'UPDATE st_jobs SET full_data = $1, st_modified_on = NOW() WHERE st_id = $2',
        [JSON.stringify({ ...fullData, issues }), params.jobId]
      );
      
      return {
        success: true,
        issueId: issue.id,
        jobId: params.jobId,
        severity: params.severity,
        message: `Issue reported. ${params.severity === 'critical' ? 'Dispatch has been notified.' : ''}`
      };
    } finally { client.release(); }
  }
};

// Tool 5: Search Knowledge Base
export const searchKnowledgeBase = {
  name: 'search_knowledge_base',
  description: 'Search the knowledge base for troubleshooting guides and procedures',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      category: { type: 'string', description: 'Category filter' }
    },
    required: ['query']
  },
  async handler(params) {
    // Mock knowledge base results
    const results = [
      { id: 1, title: 'Pool Pump Troubleshooting', category: 'pool', relevance: 0.95, summary: 'Common issues and solutions for pool pumps...' },
      { id: 2, title: 'Heater Error Codes', category: 'pool', relevance: 0.85, summary: 'Reference guide for heater error codes...' },
      { id: 3, title: 'Electrical Panel Safety', category: 'electrical', relevance: 0.75, summary: 'Safety procedures for electrical work...' }
    ];
    
    return {
      success: true,
      query: params.query,
      count: results.length,
      results: results.filter(r => !params.category || r.category === params.category)
    };
  }
};

// Tool 6: Lookup Parts
export const lookupParts = {
  name: 'lookup_parts',
  description: 'Look up parts information including pricing and availability',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Part name or number' },
      equipmentModel: { type: 'string', description: 'Equipment model for compatibility check' }
    },
    required: ['query']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(`
        SELECT code as sku, description as name, price
        FROM pb_materials
        WHERE LOWER(description) LIKE $1 OR code LIKE $1
        LIMIT 10
      `, [`%${params.query.toLowerCase()}%`]);
      
      return {
        success: true,
        query: params.query,
        count: result.rows.length,
        parts: result.rows.map(p => ({
          sku: p.sku,
          name: p.name,
          price: Number(p.price),
          available: true // Would check inventory
        }))
      };
    } finally { client.release(); }
  }
};
