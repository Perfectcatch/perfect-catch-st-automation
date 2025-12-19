#!/usr/bin/env node

/**
 * Sync Job Technicians from ServiceTitan
 * Populates the job_technicians table with assignment data
 */

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { stRequest } from '../src/services/stClient.js';
import { stEndpoints } from '../src/lib/stEndpoints.js';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.MCP_DATABASE_URL || process.env.DATABASE_URL
});

// Technician position mapping
const TECH_POSITIONS = {
  55810: 'lead',      // Kurt R
  60616473: 'lead',   // Tyler Giansante
  61607952: 'lead',   // Jayden Johnson
  62354566: 'lead',   // Kaine Alvarez
  58944518: 'helper', // Dylan Adams
  55459334: 'helper', // Daniel Detomaso
  59011: 'helper',    // Yanni Ramos
  26: 'helper'        // Yanni Ramos (Admin)
};

async function syncJobTechnicians() {
  const client = await pool.connect();

  console.log('');
  console.log('='.repeat(60));
  console.log('  SYNC JOB TECHNICIANS FROM SERVICETITAN');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Fetch all appointment assignments from ServiceTitan
    console.log('Fetching appointment assignments from ServiceTitan...');
    const allAssignments = [];
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 25) {
      const response = await stRequest(stEndpoints.appointmentAssignments.list(), {
        query: {
          pageSize: 500,
          page
        }
      });

      const data = response.data?.data || [];
      allAssignments.push(...data);
      hasMore = data.length === 500;
      page++;

      process.stdout.write(`\r  Fetched ${allAssignments.length} assignments (page ${page - 1})...`);
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`\nTotal assignments fetched: ${allAssignments.length}`);

    // Clear existing data and insert fresh
    console.log('\nClearing existing job_technicians data...');
    await client.query('TRUNCATE servicetitan.job_technicians');

    // Insert assignments
    console.log('Inserting technician assignments...');
    let inserted = 0;
    let skipped = 0;

    for (const assignment of allAssignments) {
      if (!assignment.jobId || !assignment.technicianId) {
        skipped++;
        continue;
      }

      const position = TECH_POSITIONS[assignment.technicianId] || 'helper';

      try {
        await client.query(`
          INSERT INTO servicetitan.job_technicians (
            job_id, appointment_id, technician_id, technician_name,
            position, assigned_on, st_assignment_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (job_id, technician_id, appointment_id) DO UPDATE SET
            technician_name = EXCLUDED.technician_name,
            position = EXCLUDED.position,
            assigned_on = EXCLUDED.assigned_on,
            updated_at = NOW()
        `, [
          assignment.jobId,
          assignment.appointmentId,
          assignment.technicianId,
          assignment.technicianName,
          position,
          assignment.assignedOn,
          assignment.id
        ]);
        inserted++;
      } catch (err) {
        // Skip duplicates silently
        if (!err.message.includes('duplicate')) {
          console.error(`Error inserting: ${err.message}`);
        }
        skipped++;
      }
    }

    // Mark primary technicians based on logic
    console.log('\nMarking primary technicians...');

    // Reset all is_primary
    await client.query('UPDATE servicetitan.job_technicians SET is_primary = FALSE');

    // For each job, determine the primary technician
    const jobsResult = await client.query(`
      SELECT DISTINCT job_id FROM servicetitan.job_technicians
    `);

    let primarySet = 0;
    for (const { job_id } of jobsResult.rows) {
      // Get all techs for this job
      const techsResult = await client.query(`
        SELECT jt.technician_id, jt.position, jt.technician_name,
               e.sold_by as estimate_sold_by
        FROM servicetitan.job_technicians jt
        LEFT JOIN servicetitan.st_jobs j ON j.st_id = jt.job_id
        LEFT JOIN servicetitan.st_estimates e ON e.job_id = j.st_id AND e.status = 'Sold'
        WHERE jt.job_id = $1
        ORDER BY
          CASE WHEN jt.position = 'lead' THEN 0 ELSE 1 END,
          jt.assigned_on ASC
      `, [job_id]);

      if (techsResult.rows.length === 0) continue;

      const techs = techsResult.rows;
      const leads = techs.filter(t => t.position === 'lead');
      const helpers = techs.filter(t => t.position === 'helper');
      const soldBy = techs[0]?.estimate_sold_by;

      let primaryTechId = null;

      if (leads.length > 0) {
        // Logic 2: If multiple leads, prefer the one who sold the job
        if (soldBy && leads.some(l => l.technician_id === Number(soldBy))) {
          primaryTechId = Number(soldBy);
        } else {
          // Default to first lead
          primaryTechId = leads[0].technician_id;
        }
      } else if (helpers.length > 0) {
        // Logic 1: If only helpers, select the helper
        primaryTechId = helpers[0].technician_id;
      }

      if (primaryTechId) {
        await client.query(`
          UPDATE servicetitan.job_technicians
          SET is_primary = TRUE
          WHERE job_id = $1 AND technician_id = $2
        `, [job_id, primaryTechId]);
        primarySet++;
      }
    }

    console.log(`\nPrimary technicians set for ${primarySet} jobs`);

    // Summary
    const statsResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(DISTINCT job_id) as unique_jobs,
        SUM(CASE WHEN is_primary THEN 1 ELSE 0 END) as primary_count,
        SUM(CASE WHEN position = 'lead' THEN 1 ELSE 0 END) as lead_assignments,
        SUM(CASE WHEN position = 'helper' THEN 1 ELSE 0 END) as helper_assignments
      FROM servicetitan.job_technicians
    `);

    const stats = statsResult.rows[0];

    console.log('');
    console.log('='.repeat(60));
    console.log('  RESULTS');
    console.log('='.repeat(60));
    console.log(`  Total assignments:    ${stats.total}`);
    console.log(`  Unique jobs:          ${stats.unique_jobs}`);
    console.log(`  Primary techs set:    ${stats.primary_count}`);
    console.log(`  Lead assignments:     ${stats.lead_assignments}`);
    console.log(`  Helper assignments:   ${stats.helper_assignments}`);
    console.log('='.repeat(60));
    console.log('');

  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

syncJobTechnicians()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
