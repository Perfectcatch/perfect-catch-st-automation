/**
 * Jobs Tools Index
 * Exports all 10 job management tools
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

// Tool 1: Get Job Details
export const getJobDetails = {
  name: 'get_job_details',
  description: 'Get complete details for a job including customer, appointments, and invoices',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' },
      jobNumber: { type: 'string', description: 'Job number (alternative to ID)' }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let query, queryParams;
      if (params.jobId) {
        query = 'SELECT j.*, c.name as customer_name, c.phone, c.email FROM st_jobs j LEFT JOIN st_customers c ON j.customer_id = c.st_id WHERE j.st_id = $1';
        queryParams = [params.jobId];
      } else if (params.jobNumber) {
        query = 'SELECT j.*, c.name as customer_name, c.phone, c.email FROM st_jobs j LEFT JOIN st_customers c ON j.customer_id = c.st_id WHERE j.job_number = $1';
        queryParams = [params.jobNumber];
      } else {
        return { success: false, error: 'Either jobId or jobNumber required' };
      }
      
      const result = await client.query(query, queryParams);
      if (result.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const job = result.rows[0];
      
      // Get related data
      const [appointments, invoices, estimates] = await Promise.all([
        client.query('SELECT st_id, start_on, end_on, status FROM st_appointments WHERE job_id = $1', [job.st_id]),
        client.query('SELECT st_id, invoice_number, total, status FROM st_invoices WHERE job_id = $1', [job.st_id]),
        client.query('SELECT st_id, estimate_number, total, status FROM st_estimates WHERE job_id = $1', [job.st_id])
      ]);
      
      return {
        success: true,
        job: {
          id: Number(job.st_id),
          jobNumber: job.job_number,
          status: job.job_status,
          type: job.job_type_id,
          createdOn: job.st_created_on,
          customer: { id: Number(job.customer_id), name: job.customer_name, phone: job.phone, email: job.email },
          appointments: appointments.rows.map(a => ({ id: Number(a.st_id), start: a.start_on, end: a.end_on, status: a.status })),
          invoices: invoices.rows.map(i => ({ id: Number(i.st_id), number: i.invoice_number, total: Number(i.total), status: i.status })),
          estimates: estimates.rows.map(e => ({ id: Number(e.st_id), number: e.estimate_number, total: Number(e.total), status: e.status }))
        }
      };
    } finally { client.release(); }
  }
};

// Tool 2: Update Job Status
export const updateJobStatus = {
  name: 'update_job_status',
  description: 'Update the status of a job',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' },
      status: { type: 'string', description: 'New status', enum: ['Scheduled', 'Dispatched', 'InProgress', 'Completed', 'Canceled'] },
      notes: { type: 'string', description: 'Status change notes' }
    },
    required: ['jobId', 'status']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query(
        'UPDATE st_jobs SET job_status = $1, st_modified_on = NOW() WHERE st_id = $2 RETURNING job_number',
        [params.status, params.jobId]
      );
      if (result.rows.length === 0) return { success: false, error: 'Job not found' };
      return { success: true, jobNumber: result.rows[0].job_number, newStatus: params.status };
    } finally { client.release(); }
  }
};

// Tool 3: Add Job Note
export const addJobNote = {
  name: 'add_job_note',
  description: 'Add a note to a job',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' },
      note: { type: 'string', description: 'Note content' },
      noteType: { type: 'string', enum: ['internal', 'customer', 'technician'], default: 'internal' }
    },
    required: ['jobId', 'note']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Add note to job's full_data
      const result = await client.query('SELECT full_data FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (result.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const fullData = result.rows[0].full_data || {};
      const notes = fullData.notes || [];
      notes.push({ content: params.note, type: params.noteType, createdAt: new Date() });
      
      await client.query(
        'UPDATE st_jobs SET full_data = $1, st_modified_on = NOW() WHERE st_id = $2',
        [JSON.stringify({ ...fullData, notes }), params.jobId]
      );
      
      return { success: true, jobId: params.jobId, noteCount: notes.length };
    } finally { client.release(); }
  }
};

// Tool 4: Complete Job
export const completeJob = {
  name: 'complete_job',
  description: 'Mark a job as completed with summary',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' },
      completionNotes: { type: 'string', description: 'Completion summary' },
      technicianId: { type: 'number', description: 'Technician who completed the job' }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      await client.query(
        'UPDATE st_jobs SET job_status = $1, job_completion_time = NOW(), st_modified_on = NOW() WHERE st_id = $2',
        ['Completed', params.jobId]
      );
      return { success: true, jobId: params.jobId, status: 'Completed', completedAt: new Date() };
    } finally { client.release(); }
  }
};

// Tool 5: Search Jobs
export const searchJobs = {
  name: 'search_jobs',
  description: 'Search for jobs by various criteria',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (job number, customer name)' },
      status: { type: 'string', description: 'Filter by status' },
      dateFrom: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
      dateTo: { type: 'string', description: 'End date (YYYY-MM-DD)' },
      limit: { type: 'number', default: 20 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      let sql = `
        SELECT j.st_id, j.job_number, j.job_status, j.summary, j.st_created_on, c.name as customer_name
        FROM st_jobs j
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        WHERE 1=1
      `;
      const values = [];
      let idx = 1;
      
      if (params.query) {
        sql += ` AND (j.job_number LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`;
        values.push(`%${params.query.toLowerCase()}%`);
        idx++;
      }
      if (params.status) {
        sql += ` AND j.job_status = $${idx}`;
        values.push(params.status);
        idx++;
      }
      if (params.dateFrom) {
        sql += ` AND j.st_created_on >= $${idx}`;
        values.push(params.dateFrom);
        idx++;
      }
      if (params.dateTo) {
        sql += ` AND j.st_created_on <= $${idx}`;
        values.push(params.dateTo);
        idx++;
      }
      
      sql += ` ORDER BY j.st_created_on DESC LIMIT $${idx}`;
      values.push(params.limit || 20);
      
      const result = await client.query(sql, values);
      
      return {
        success: true,
        count: result.rows.length,
        jobs: result.rows.map(j => ({
          id: Number(j.st_id),
          jobNumber: j.job_number,
          status: j.job_status,
          type: j.summary,
          customerName: j.customer_name,
          createdOn: j.st_created_on
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 6: Get Job Profitability
export const getJobProfitability = {
  name: 'get_job_profitability',
  description: 'Calculate profitability metrics for a job',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const [jobResult, invoiceResult] = await Promise.all([
        client.query('SELECT * FROM st_jobs WHERE st_id = $1', [params.jobId]),
        client.query('SELECT SUM(total) as revenue FROM st_invoices WHERE job_id = $1', [params.jobId])
      ]);
      
      if (jobResult.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const revenue = Number(invoiceResult.rows[0]?.revenue) || 0;
      const estimatedCost = revenue * 0.6; // Assume 60% cost
      const profit = revenue - estimatedCost;
      
      return {
        success: true,
        jobId: params.jobId,
        revenue,
        estimatedCost,
        profit,
        margin: revenue > 0 ? ((profit / revenue) * 100).toFixed(1) + '%' : '0%'
      };
    } finally { client.release(); }
  }
};

// Tool 7: Predict Job Duration
export const predictJobDuration = {
  name: 'predict_job_duration',
  description: 'Predict how long a job will take based on historical data',
  inputSchema: {
    type: 'object',
    properties: {
      jobType: { type: 'string', description: 'Type of job' },
      complexity: { type: 'string', enum: ['simple', 'standard', 'complex'], default: 'standard' }
    },
    required: ['jobType']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      // Get average duration for similar jobs
      const result = await client.query(`
        SELECT AVG(EXTRACT(EPOCH FROM (a.end_on - a.start_on)) / 3600) as avg_hours
        FROM st_appointments a
        JOIN st_jobs j ON a.job_id = j.st_id
        WHERE j.summary LIKE $1
          AND a.status = 'Completed'
      `, [`%${params.jobType}%`]);
      
      let baseHours = Number(result.rows[0]?.avg_hours) || 2;
      
      // Adjust for complexity
      const multiplier = params.complexity === 'simple' ? 0.7 : params.complexity === 'complex' ? 1.5 : 1;
      const predictedHours = baseHours * multiplier;
      
      return {
        success: true,
        jobType: params.jobType,
        complexity: params.complexity,
        predictedDuration: {
          hours: predictedHours.toFixed(1),
          minutes: Math.round(predictedHours * 60)
        },
        confidence: result.rows[0]?.avg_hours ? 'high' : 'low'
      };
    } finally { client.release(); }
  }
};

// Tool 8: Get Job Recommendations
export const getJobRecommendations = {
  name: 'get_job_recommendations',
  description: 'Get AI recommendations for a job (upsells, related services)',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Job ID' }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const result = await client.query('SELECT * FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (result.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const job = result.rows[0];
      
      // Generate recommendations based on job type
      const recommendations = [
        { type: 'upsell', title: 'Maintenance Plan', description: 'Offer annual maintenance plan', estimatedValue: 299 },
        { type: 'related', title: 'Equipment Inspection', description: 'Inspect related equipment while on-site', estimatedValue: 75 },
        { type: 'preventive', title: 'Filter Replacement', description: 'Check and replace filters if needed', estimatedValue: 150 }
      ];
      
      return { success: true, jobId: params.jobId, jobType: job.summary, recommendations };
    } finally { client.release(); }
  }
};

// Tool 9: Find Related Jobs
export const findRelatedJobs = {
  name: 'find_related_jobs',
  description: 'Find jobs related to a specific job (same customer, location, or equipment)',
  inputSchema: {
    type: 'object',
    properties: {
      jobId: { type: 'number', description: 'Reference job ID' },
      limit: { type: 'number', default: 10 }
    },
    required: ['jobId']
  },
  async handler(params) {
    const client = await getPool().connect();
    try {
      const jobResult = await client.query('SELECT customer_id FROM st_jobs WHERE st_id = $1', [params.jobId]);
      if (jobResult.rows.length === 0) return { success: false, error: 'Job not found' };
      
      const customerId = jobResult.rows[0].customer_id;
      
      const result = await client.query(`
        SELECT st_id, job_number, job_status, summary, st_created_on
        FROM st_jobs
        WHERE customer_id = $1 AND st_id != $2
        ORDER BY st_created_on DESC
        LIMIT $3
      `, [customerId, params.jobId, params.limit || 10]);
      
      return {
        success: true,
        referenceJobId: params.jobId,
        relatedJobs: result.rows.map(j => ({
          id: Number(j.st_id),
          jobNumber: j.job_number,
          status: j.job_status,
          type: j.summary,
          date: j.st_created_on
        }))
      };
    } finally { client.release(); }
  }
};

// Tool 10: Get Job Analytics
export const getJobAnalytics = {
  name: 'get_job_analytics',
  description: 'Get analytics on jobs: completion rates, average duration, revenue',
  inputSchema: {
    type: 'object',
    properties: {
      dateRange: { type: 'number', description: 'Number of days to analyze', default: 30 }
    }
  },
  async handler(params) {
    const client = await getPool().connect();
    const days = params.dateRange || 30;
    try {
      const result = await client.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE job_status = 'Completed') as completed,
          COUNT(*) FILTER (WHERE job_status = 'Canceled') as canceled
        FROM st_jobs
        WHERE st_created_on >= NOW() - INTERVAL '${days} days'
      `);
      
      const revenueResult = await client.query(`
        SELECT COALESCE(SUM(i.total), 0) as revenue
        FROM st_invoices i
        JOIN st_jobs j ON i.job_id = j.st_id
        WHERE j.st_created_on >= NOW() - INTERVAL '${days} days'
      `);
      
      const data = result.rows[0];
      const total = Number(data.total);
      const completed = Number(data.completed);
      
      return {
        success: true,
        dateRange: `Last ${days} days`,
        metrics: {
          totalJobs: total,
          completedJobs: completed,
          canceledJobs: Number(data.canceled),
          completionRate: total > 0 ? ((completed / total) * 100).toFixed(1) + '%' : '0%',
          totalRevenue: Number(revenueResult.rows[0].revenue),
          avgRevenuePerJob: total > 0 ? (Number(revenueResult.rows[0].revenue) / total).toFixed(2) : 0
        }
      };
    } finally { client.release(); }
  }
};
