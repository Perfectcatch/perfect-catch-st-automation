#!/usr/bin/env node

/**
 * Test ServiceTitan Appointment Assignments API
 * Fetches technician assignments for appointments
 */

import dotenv from 'dotenv';
dotenv.config();

import { stRequest } from '../src/services/stClient.js';
import { stEndpoints } from '../src/lib/stEndpoints.js';

async function testAppointmentAssignments() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  SERVICETITAN APPOINTMENT ASSIGNMENTS');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get recent appointment assignments
    console.log('Fetching appointment assignments...\n');

    const url = stEndpoints.appointmentAssignments.list();
    console.log('URL:', url);

    const response = await stRequest(url, {
      query: {
        pageSize: 50,
        // Get recent appointments
        startsOnOrAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // Last 30 days
      }
    });

    const assignments = response.data?.data || [];
    console.log(`Found ${assignments.length} appointment assignments\n`);

    if (assignments.length > 0) {
      console.log('Sample assignments:');
      console.log('-'.repeat(40));

      for (const assignment of assignments.slice(0, 10)) {
        console.log(`\nAppointment ID: ${assignment.appointmentId}`);
        console.log(`  Technician IDs: ${JSON.stringify(assignment.technicianIds)}`);
        console.log(`  Status: ${assignment.status}`);
        if (assignment.jobId) console.log(`  Job ID: ${assignment.jobId}`);
      }
    }

    // Get full assignment data for one
    if (assignments.length > 0) {
      console.log('\n\nFull assignment data example:');
      console.log(JSON.stringify(assignments[0], null, 2));
    }

  } catch (err) {
    console.error('Error:', err.message || err);
    if (err.statusCode === 404) {
      console.log('\nThe appointment-assignments endpoint might require different parameters.');
    }
  }
}

testAppointmentAssignments();
