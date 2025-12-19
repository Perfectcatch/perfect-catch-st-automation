#!/usr/bin/env node

/**
 * Fix GHL Opportunities - Move to correct pipeline stages
 * This script properly updates GHL via their API
 */

import axios from 'axios';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

const PIPELINES = {
  SALES: {
    id: 'fWJfnMsPzwOXgKdWxdjC',
    stages: {
      PROPOSAL_SENT: 'a75d3c82-8e40-4624-a401-ccf1cc52cca7',
      JOB_SOLD: '97703c8d-1dc6-46f3-a537-601678cedebd'
    }
  },
  INSTALL: {
    id: 'bbsMqYClVMDN26Lr6HdV',
    stages: {
      ESTIMATE_APPROVED: 'acf34a4c-30c1-4511-85ed-d384f0dc8365'
    }
  }
};

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SERVICETITAN_DATABASE_URL
});

const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

async function getOpportunitiesFromGHL() {
  const resp = await ghlClient.get('/opportunities/search', {
    params: {
      location_id: 'kgnEweBlJ8Uq11kNc3Xs',
      pipeline_id: PIPELINES.SALES.id
    }
  });
  return resp.data.opportunities || [];
}

async function updateOpportunityInGHL(oppId, updateData) {
  try {
    const resp = await ghlClient.put(`/opportunities/${oppId}`, updateData);
    return { success: true, data: resp.data };
  } catch (err) {
    return { success: false, error: err.response?.data || err.message };
  }
}

async function main() {
  const client = await pool.connect();

  console.log('');
  console.log('='.repeat(60));
  console.log('  FIXING GHL OPPORTUNITIES');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get opportunities from GHL
    console.log('Fetching opportunities from GHL...');
    const ghlOpps = await getOpportunitiesFromGHL();
    console.log(`Found ${ghlOpps.length} opportunities in Sales Pipeline`);
    console.log('');

    // Filter to only Proposal Sent stage
    const proposalSentOpps = ghlOpps.filter(o =>
      o.pipelineStageId === PIPELINES.SALES.stages.PROPOSAL_SENT
    );
    console.log(`${proposalSentOpps.length} in Proposal Sent stage`);

    // Get customers with sold estimates from DB
    const soldEstimatesResult = await client.query(`
      SELECT DISTINCT ON (c.st_id)
        c.st_id as customer_id,
        c.name as customer_name,
        e.st_id as estimate_id,
        e.total as estimate_total,
        e.sold_on
      FROM ${SCHEMA.st}.st_customers c
      JOIN ${SCHEMA.st}.st_estimates e ON e.customer_id = c.st_id
      WHERE e.status = 'Sold'
        AND e.sold_on >= NOW() - INTERVAL '30 days'
      ORDER BY c.st_id, e.sold_on DESC
    `);

    const customersWithSoldEstimates = new Map();
    soldEstimatesResult.rows.forEach(r => {
      customersWithSoldEstimates.set(r.customer_name.toLowerCase().trim(), r);
    });

    console.log(`Found ${customersWithSoldEstimates.size} customers with sold estimates`);

    // Get customers with install jobs
    const installJobsResult = await client.query(`
      SELECT DISTINCT ON (c.st_id)
        c.st_id as customer_id,
        c.name as customer_name,
        j.st_id as install_job_id,
        j.job_number
      FROM ${SCHEMA.st}.st_customers c
      JOIN ${SCHEMA.st}.st_jobs j ON j.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE bu.name LIKE '%Install%'
        AND j.st_created_on >= NOW() - INTERVAL '30 days'
      ORDER BY c.st_id, j.st_created_on DESC
    `);

    const customersWithInstallJobs = new Map();
    installJobsResult.rows.forEach(r => {
      customersWithInstallJobs.set(r.customer_name.toLowerCase().trim(), r);
    });

    console.log(`Found ${customersWithInstallJobs.size} customers with install jobs`);
    console.log('');
    console.log('-'.repeat(60));
    console.log('');

    let movedToJobSold = 0;
    let movedToInstall = 0;
    let skipped = 0;
    let failed = 0;

    for (const opp of proposalSentOpps) {
      // Extract customer name from opportunity name (format: "Customer Name - ...")
      const customerName = opp.name.split(' - ')[0].toLowerCase().trim();

      const soldEstimate = customersWithSoldEstimates.get(customerName);
      const installJob = customersWithInstallJobs.get(customerName);

      if (!soldEstimate) {
        console.log(`SKIP: ${opp.name} (no sold estimate found)`);
        skipped++;
        continue;
      }

      if (installJob) {
        // Move to Install Pipeline
        console.log(`INSTALL: ${opp.name}`);
        console.log(`         → Install Pipeline (Job #${installJob.job_number})`);

        const newName = `${opp.name.split(' - ')[0]} - Install Job #${installJob.job_number} - $${Number(soldEstimate.estimate_total).toLocaleString()}`;

        const result = await updateOpportunityInGHL(opp.id, {
          pipelineId: PIPELINES.INSTALL.id,
          pipelineStageId: PIPELINES.INSTALL.stages.ESTIMATE_APPROVED,
          name: newName
        });

        if (result.success) {
          console.log(`         ✅ Success`);
          movedToInstall++;
        } else {
          console.log(`         ❌ Failed: ${JSON.stringify(result.error)}`);
          failed++;
        }

      } else {
        // Move to Job Sold stage
        console.log(`JOB SOLD: ${opp.name}`);
        console.log(`          → Job Sold ($${Number(soldEstimate.estimate_total).toLocaleString()})`);

        const result = await updateOpportunityInGHL(opp.id, {
          pipelineStageId: PIPELINES.SALES.stages.JOB_SOLD,
          monetaryValue: Number(soldEstimate.estimate_total) || 0
        });

        if (result.success) {
          console.log(`          ✅ Success`);
          movedToJobSold++;
        } else {
          console.log(`          ❌ Failed: ${JSON.stringify(result.error)}`);
          failed++;
        }
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
      console.log('');
    }

    console.log('');
    console.log('='.repeat(60));
    console.log('  RESULTS');
    console.log('='.repeat(60));
    console.log(`  Moved to Job Sold:     ${movedToJobSold}`);
    console.log(`  Moved to Install:      ${movedToInstall}`);
    console.log(`  Skipped (no estimate): ${skipped}`);
    console.log(`  Failed:                ${failed}`);
    console.log('='.repeat(60));
    console.log('');

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
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
