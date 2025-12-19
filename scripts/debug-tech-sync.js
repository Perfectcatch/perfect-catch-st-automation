#!/usr/bin/env node

/**
 * Debug Technician Sync - Find why opportunities aren't getting techs
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

async function debug() {
  const client = await pool.connect();

  try {
    // Get opportunities with job IDs
    const oppsResult = await client.query(`
      SELECT ghl_id, name, st_job_id
      FROM integrations.ghl_opportunities
      WHERE status = 'open' AND st_job_id IS NOT NULL
      LIMIT 5
    `);

    console.log('Open opportunities with job IDs:');
    for (const opp of oppsResult.rows) {
      console.log(`  Job ${opp.st_job_id}: ${opp.name}`);
    }

    const jobIds = oppsResult.rows.map(o => Number(o.st_job_id));
    console.log('\nJob IDs to search for:', jobIds);

    // Fetch some appointment assignments
    const response = await stRequest(stEndpoints.appointmentAssignments.list(), {
      query: {
        pageSize: 100,
        page: 1
      }
    });

    const assignments = response.data?.data || [];
    console.log(`\nTotal assignments fetched: ${assignments.length}`);

    // Check for matches
    console.log('\nChecking for job ID matches...');
    for (const jobId of jobIds) {
      const matches = assignments.filter(a => a.jobId === jobId);
      if (matches.length > 0) {
        console.log(`  Job ${jobId}: ${matches.length} assignment(s)`);
        matches.forEach(m => {
          console.log(`    - Tech ID: ${m.technicianId}, Name: ${m.technicianName}`);
        });
      } else {
        console.log(`  Job ${jobId}: NO MATCHES`);
      }
    }

    // Show sample of recent assignments
    console.log('\nSample recent assignments:');
    const recent = assignments.slice(0, 10);
    for (const a of recent) {
      console.log(`  Job ${a.jobId}: Tech ${a.technicianId} (${a.technicianName})`);
    }

    // Check if any assignment jobIds are in our DB
    console.log('\nFinding assignments for our opportunity jobs...');

    // Get ALL assignments with pagination
    let page = 1;
    let allAssignments = [];
    let hasMore = true;

    while (hasMore && page <= 20) {
      const resp = await stRequest(stEndpoints.appointmentAssignments.list(), {
        query: {
          pageSize: 500,
          page
        }
      });
      const data = resp.data?.data || [];
      allAssignments.push(...data);
      hasMore = data.length === 500;
      page++;
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`Fetched ${allAssignments.length} total assignments`);

    for (const jobId of jobIds) {
      const matches = allAssignments.filter(a => a.jobId === jobId);
      if (matches.length > 0) {
        console.log(`\nJob ${jobId}: ${matches.length} assignment(s)`);
        matches.forEach(m => {
          console.log(`  - Tech ID: ${m.technicianId}, Name: ${m.technicianName}`);
        });
      }
    }

    // Also check the highest job IDs in assignments
    const assignmentJobIds = allAssignments.map(a => a.jobId);
    const maxJobId = Math.max(...assignmentJobIds);
    const minJobId = Math.min(...assignmentJobIds);
    console.log(`\nAssignment job ID range: ${minJobId} - ${maxJobId}`);
    console.log(`Our job IDs range: ${Math.min(...jobIds)} - ${Math.max(...jobIds)}`);

  } finally {
    client.release();
    await pool.end();
  }
}

debug().catch(console.error);
