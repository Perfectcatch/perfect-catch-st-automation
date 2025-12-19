#!/usr/bin/env node

/**
 * Sync PRIMARY Technician to GHL Opportunities
 * Uses job_technicians table with lead/helper selection logic:
 * - Logic 1: Select lead over helper. If only helper, use helper.
 * - Logic 2: If multiple leads, prefer the one who sold the job.
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import pg from 'pg';

const { Pool } = pg;

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// GHL Techs field configuration
const GHL_TECHS_FIELD = {
  id: 'sJ3jmGpHGFUssEVZ9Npi',
  key: 'opportunity.techs',
  // Map ST technician IDs to GHL option values
  techMapping: {
    55810: 'Kurt',        // Kurt R (lead)
    60616473: 'Tyler',    // Tyler Giansante (lead)
    61607952: 'Jayden',   // Jayden Johnson (lead)
    62354566: 'Kaine',    // Kaine Alvarez (lead)
    58944518: 'Dylan',    // Dylan Adams (helper)
    55459334: 'Dan',      // Daniel Detomaso (helper)
    59011: 'Yanni',       // Yanni Ramos (helper)
    26: 'Yanni'           // Yanni Ramos (Admin)
  }
};

const pool = new Pool({
  connectionString: process.env.MCP_DATABASE_URL || process.env.DATABASE_URL || process.env.SERVICETITAN_DATABASE_URL
});

const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

async function main() {
  const client = await pool.connect();

  console.log('');
  console.log('='.repeat(60));
  console.log('  SYNC PRIMARY TECHNICIAN TO GHL OPPORTUNITIES');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get GHL opportunities with their primary technician
    console.log('Fetching GHL opportunities with primary technician...');

    const oppsResult = await client.query(`
      SELECT
        o.ghl_id,
        o.name,
        o.st_job_id,
        o.custom_fields->>'techs' as current_tech,
        jt.technician_id,
        jt.technician_name,
        jt.position
      FROM ${SCHEMA.ghl}.ghl_opportunities o
      LEFT JOIN ${SCHEMA.st}.job_technicians jt
        ON jt.job_id = o.st_job_id AND jt.is_primary = TRUE
      WHERE o.status = 'open'
        AND o.st_job_id IS NOT NULL
      ORDER BY o.local_updated_at DESC
    `);

    console.log(`Found ${oppsResult.rows.length} open opportunities with job IDs\n`);

    if (oppsResult.rows.length === 0) {
      console.log('No opportunities to process.');
      return;
    }

    // Update opportunities
    console.log('Updating GHL opportunities with primary technician...');
    console.log('-'.repeat(60));
    console.log('');

    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const opp of oppsResult.rows) {
      if (!opp.technician_id) {
        console.log(`SKIP: ${opp.name} (no primary technician)`);
        skipped++;
        continue;
      }

      // Map to GHL option value (single technician)
      const ghlTech = GHL_TECHS_FIELD.techMapping[opp.technician_id];

      if (!ghlTech) {
        console.log(`SKIP: ${opp.name}`);
        console.log(`      Tech ID ${opp.technician_id} not mapped to GHL`);
        skipped++;
        continue;
      }

      // Check if already has same tech
      const currentTech = Array.isArray(opp.current_tech)
        ? opp.current_tech[0]
        : opp.current_tech;

      if (currentTech === ghlTech) {
        skipped++;
        continue;
      }

      console.log(`UPDATE: ${opp.name}`);
      console.log(`        Tech: ${ghlTech} (${opp.position})`);

      try {
        // Update GHL with single technician
        const customFields = [
          {
            id: GHL_TECHS_FIELD.id,
            value: [ghlTech]  // Single tech in array for multi-select field
          }
        ];

        await ghlClient.put(`/opportunities/${opp.ghl_id}`, {
          customFields
        });

        console.log(`        ✅ Success`);
        updated++;

        // Update local database
        await client.query(`
          UPDATE ${SCHEMA.ghl}.ghl_opportunities
          SET custom_fields = jsonb_set(
            COALESCE(custom_fields, '{}'::jsonb),
            '{techs}',
            $2::jsonb
          ),
          local_updated_at = NOW()
          WHERE ghl_id = $1
        `, [opp.ghl_id, JSON.stringify(ghlTech)]);

      } catch (err) {
        console.log(`        ❌ Failed: ${err.response?.data?.message || err.message}`);
        failed++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 300));
      console.log('');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  RESULTS');
    console.log('='.repeat(60));
    console.log(`  Updated:   ${updated}`);
    console.log(`  Skipped:   ${skipped}`);
    console.log(`  Failed:    ${failed}`);
    console.log(`  Total:     ${oppsResult.rows.length}`);
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

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
