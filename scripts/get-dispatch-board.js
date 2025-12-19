#!/usr/bin/env node
/**
 * Get comprehensive dispatch board with full job details
 * Usage: node scripts/get-dispatch-board.js [date]
 * Date format: YYYY-MM-DD (defaults to today)
 */

import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getFullDispatchBoard(date) {
  // Fetch appointments from API
  const API_BASE = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
  const response = await fetch(`${API_BASE}/scheduling/dispatch/status?date=${date}`);
  const dispatchData = await response.json();

  // Filter to just the requested date
  const todayAppts = [
    ...(dispatchData.appointments?.scheduled || []),
    ...(dispatchData.appointments?.dispatched || []),
    ...(dispatchData.appointments?.working || []),
    ...(dispatchData.appointments?.completed || []),
    ...(dispatchData.appointments?.canceled || [])
  ].filter(a => a.start && a.start.startsWith(date));

  // Get job IDs
  const jobIds = [...new Set(todayAppts.map(a => a.jobId).filter(Boolean))];

  if (jobIds.length === 0) {
    console.log(JSON.stringify({
      date,
      summary: dispatchData.summary,
      technicians: {},
      message: 'No appointments found for this date'
    }, null, 2));
    return;
  }

  // Fetch job details from database
  const client = await pool.connect();
  try {
    const jobResult = await client.query(`
      SELECT
        j.st_id as job_id,
        j.job_number,
        j.summary as job_notes,
        jt.name as job_type_name,
        c.name as customer_name
      FROM st_jobs j
      LEFT JOIN st_job_types jt ON j.job_type_id = jt.st_id
      LEFT JOIN st_customers c ON j.customer_id = c.st_id
      WHERE j.st_id = ANY($1)
    `, [jobIds]);

    // Create job lookup
    const jobLookup = {};
    for (const job of jobResult.rows) {
      jobLookup[job.job_id] = job;
    }

    // Group by technician
    const byTech = {};
    for (const apt of todayAppts) {
      const job = jobLookup[apt.jobId] || {};
      const duration = Math.round((new Date(apt.end) - new Date(apt.start)) / (1000 * 60));
      const hours = Math.floor(duration / 60);
      const mins = duration % 60;

      // Strip HTML and truncate notes
      const cleanNotes = (job.job_notes || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      const techs = apt.technicians || [];
      if (techs.length === 0) {
        // Unassigned appointment
        if (!byTech['UNASSIGNED']) {
          byTech['UNASSIGNED'] = [];
        }
        byTech['UNASSIGNED'].push({
          start: apt.start.substring(11, 16),
          end: apt.end.substring(11, 16),
          duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
          status: apt.status,
          jobId: apt.jobId,
          jobType: job.job_type_name || 'Unknown',
          customer: job.customer_name || 'Unknown',
          notes: cleanNotes.substring(0, 300)
        });
      } else {
        for (const tech of techs) {
          if (!byTech[tech.technicianName]) {
            byTech[tech.technicianName] = [];
          }
          byTech[tech.technicianName].push({
            start: apt.start.substring(11, 16),
            end: apt.end.substring(11, 16),
            duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
            status: apt.status,
            jobId: apt.jobId,
            jobType: job.job_type_name || 'Unknown',
            customer: job.customer_name || 'Unknown',
            notes: cleanNotes.substring(0, 300)
          });
        }
      }
    }

    // Sort each tech's appointments by start time
    for (const tech in byTech) {
      byTech[tech].sort((a, b) => a.start.localeCompare(b.start));
    }

    console.log(JSON.stringify({
      date,
      summary: dispatchData.summary,
      technicians: byTech
    }, null, 2));
  } finally {
    client.release();
    pool.end();
  }
}

const date = process.argv[2] || new Date().toISOString().split('T')[0];
getFullDispatchBoard(date).catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
