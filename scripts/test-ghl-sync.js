#!/usr/bin/env node
/**
 * Test GHL Sync
 * Fetches new customers from ServiceTitan (last 5 days)
 * Creates GHL contacts and syncs estimates as opportunities
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';
import { stRequest } from '../src/services/stClient.js';
import { stEndpoints } from '../src/lib/stEndpoints.js';

const { Pool } = pg;

// Schema prefixes
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5
});

async function main() {
  console.log('🔗 GHL Sync Test Script');
  console.log('========================\n');

  const client = await pool.connect();

  try {
    // Step 1: Check GHL connection
    console.log('1️⃣  Testing GHL API connection...');
    const locationId = process.env.GHL_LOCATION_ID;

    const locationRes = await ghlClient.get(`/locations/${locationId}`);
    console.log(`   ✅ Connected to: ${locationRes.data.location.name}\n`);

    // Step 2: Get recent customers from ST database
    console.log('2️⃣  Fetching recent customers from ServiceTitan (last 5 days)...');

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const customersResult = await client.query(`
      SELECT
        st_id, name, email, phone,
        address_line1, city, state, zip, country,
        first_name, last_name, st_created_on
      FROM ${SCHEMA.st}.st_customers
      WHERE st_created_on >= $1
      ORDER BY st_created_on DESC
      LIMIT 10
    `, [fiveDaysAgo.toISOString()]);

    console.log(`   Found ${customersResult.rows.length} customers in last 5 days\n`);

    if (customersResult.rows.length === 0) {
      console.log('   ⚠️  No recent customers found. Fetching from ServiceTitan API...\n');

      // Fetch from ST API
      const stCustomersRes = await stRequest(stEndpoints.customers.list(), {
        method: 'GET',
        query: {
          createdOnOrAfter: fiveDaysAgo.toISOString(),
          pageSize: 10
        }
      });

      if (stCustomersRes.data?.data?.length > 0) {
        console.log(`   Found ${stCustomersRes.data.data.length} customers from ST API\n`);

        // Store them in local DB first
        for (const cust of stCustomersRes.data.data) {
          await client.query(`
            INSERT INTO ${SCHEMA.st}.st_customers (
              st_id, tenant_id, name, type, email, phone,
              address_line1, city, state, zip, country,
              first_name, last_name,
              full_data, st_created_on, st_modified_on
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (st_id) DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              phone = EXCLUDED.phone,
              local_synced_at = NOW()
          `, [
            cust.id,
            cust.tenantId || 0,
            cust.name,
            cust.type || 'Residential',
            cust.email,
            cust.phoneSettings?.phoneNumber || cust.phone,
            cust.address?.street,
            cust.address?.city,
            cust.address?.state,
            cust.address?.zip,
            cust.address?.country || 'US',
            cust.name?.split(' ')[0],
            cust.name?.split(' ').slice(1).join(' '),
            JSON.stringify(cust),
            cust.createdOn ? new Date(cust.createdOn) : new Date(),
            cust.modifiedOn ? new Date(cust.modifiedOn) : new Date()
          ]);
        }

        // Re-fetch from local DB
        const refreshedCustomers = await client.query(`
          SELECT st_id, name, email, phone,
                 address_line1, city, state, zip, country,
                 first_name, last_name, st_created_on
          FROM ${SCHEMA.st}.st_customers
          WHERE st_created_on >= $1
          ORDER BY st_created_on DESC
          LIMIT 10
        `, [fiveDaysAgo.toISOString()]);

        customersResult.rows = refreshedCustomers.rows;
      }
    }

    // Step 3: Sync customers to GHL
    console.log('3️⃣  Syncing customers to GHL as contacts...');

    let syncedContacts = 0;
    let skippedContacts = 0;
    let failedContacts = 0;

    for (const customer of customersResult.rows) {
      try {
        // Check if already synced
        const existingContact = await client.query(`
          SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE st_customer_id = $1
        `, [customer.st_id]);

        if (existingContact.rows.length > 0) {
          console.log(`   ⏭️  Skip: ${customer.name} (already synced: ${existingContact.rows[0].ghl_id})`);
          skippedContacts++;
          continue;
        }

        // Parse name
        const firstName = customer.first_name || customer.name?.split(' ')[0] || 'Unknown';
        const lastName = customer.last_name || customer.name?.split(' ').slice(1).join(' ') || '';

        // Create contact in GHL
        const contactData = {
          locationId,
          firstName,
          lastName,
          name: customer.name,
          source: 'ServiceTitan',
          customFields: [{ key: 'st_customer_id', field_value: String(customer.st_id) }]
        };

        if (customer.email) contactData.email = customer.email;
        if (customer.phone) contactData.phone = customer.phone;
        if (customer.address_line1) contactData.address1 = customer.address_line1;
        if (customer.city) contactData.city = customer.city;
        if (customer.state) contactData.state = customer.state;
        if (customer.zip) contactData.postalCode = customer.zip;

        const ghlRes = await ghlClient.post('/contacts/', contactData);
        const createdContact = ghlRes.data.contact || ghlRes.data;

        // Store in local database
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_contacts (
            ghl_id, ghl_location_id, st_customer_id,
            first_name, last_name, name, email, phone,
            address_line1, city, state, zip,
            source, synced_to_st, full_data, ghl_created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, $14, NOW())
          ON CONFLICT (ghl_id) DO UPDATE SET
            st_customer_id = EXCLUDED.st_customer_id,
            synced_to_st = true,
            local_synced_at = NOW()
        `, [
          createdContact.id,
          locationId,
          customer.st_id,
          firstName,
          lastName,
          customer.name,
          customer.email,
          customer.phone,
          customer.address_line1,
          customer.city,
          customer.state,
          customer.zip,
          'servicetitan',
          JSON.stringify(createdContact)
        ]);

        console.log(`   ✅ Synced: ${customer.name} → ${createdContact.id}`);
        syncedContacts++;

        // Rate limit
        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.log(`   ❌ Failed: ${customer.name} - ${error.response?.data?.message || error.message}`);
        failedContacts++;
      }
    }

    console.log(`\n   Summary: ${syncedContacts} synced, ${skippedContacts} skipped, ${failedContacts} failed\n`);

    // Step 4: Fetch estimates for these customers
    console.log('4️⃣  Fetching estimates for synced customers...');

    const customerIds = customersResult.rows.map(c => c.st_id);

    const estimatesResult = await client.query(`
      SELECT
        e.st_id, e.estimate_number, e.name, e.total, e.status,
        e.customer_id, e.job_id,
        c.name as customer_name,
        j.job_number, j.summary as job_summary,
        bu.name as business_unit_name, bu.ghl_pipeline_id
      FROM ${SCHEMA.st}.st_estimates e
      JOIN ${SCHEMA.st}.st_customers c ON e.customer_id = c.st_id
      JOIN ${SCHEMA.st}.st_jobs j ON e.job_id = j.st_id
      JOIN ${SCHEMA.st}.st_business_units bu ON j.business_unit_id = bu.st_id
      WHERE e.customer_id = ANY($1)
      ORDER BY e.st_created_on DESC
      LIMIT 20
    `, [customerIds]);

    console.log(`   Found ${estimatesResult.rows.length} estimates for these customers\n`);

    // Step 5: Sync estimates as GHL opportunities
    console.log('5️⃣  Syncing estimates as GHL opportunities...');

    let syncedOpps = 0;
    let skippedOpps = 0;
    let failedOpps = 0;

    for (const estimate of estimatesResult.rows) {
      try {
        // Check if opportunity already exists
        const existingOpp = await client.query(`
          SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_opportunities
          WHERE st_job_id = $1 OR (full_data->>'stEstimateId')::bigint = $2
        `, [estimate.job_id, estimate.st_id]);

        if (existingOpp.rows.length > 0) {
          console.log(`   ⏭️  Skip: ${estimate.customer_name} - ${estimate.name || estimate.estimate_number} (exists)`);
          skippedOpps++;
          continue;
        }

        // Get GHL contact ID
        const contactResult = await client.query(`
          SELECT ghl_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE st_customer_id = $1
        `, [estimate.customer_id]);

        const ghlContactId = contactResult.rows[0]?.ghl_id;

        // Get pipeline - use first available if not mapped
        let pipelineId = estimate.ghl_pipeline_id;
        let stageId = null;

        if (!pipelineId) {
          // Fetch pipelines and use the first one
          const pipelinesRes = await ghlClient.get('/opportunities/pipelines', {
            params: { locationId }
          });

          if (pipelinesRes.data.pipelines?.length > 0) {
            pipelineId = pipelinesRes.data.pipelines[0].id;
            stageId = pipelinesRes.data.pipelines[0].stages?.[0]?.id;
            console.log(`   📋 Using default pipeline: ${pipelinesRes.data.pipelines[0].name}`);
          }
        } else {
          // Get stages for the mapped pipeline
          const pipelinesRes = await ghlClient.get('/opportunities/pipelines', {
            params: { locationId }
          });
          const pipeline = pipelinesRes.data.pipelines?.find(p => p.id === pipelineId);
          stageId = pipeline?.stages?.[0]?.id;
        }

        if (!pipelineId) {
          console.log(`   ⚠️  No pipeline available for: ${estimate.customer_name}`);
          skippedOpps++;
          continue;
        }

        // Format opportunity name
        const oppName = `${estimate.customer_name} - ${estimate.name || estimate.job_summary || 'Estimate'} - $${Number(estimate.total || 0).toLocaleString()}`;

        // Create opportunity in GHL
        const oppData = {
          pipelineId,
          locationId,
          name: oppName,
          status: 'open',
          monetaryValue: Number(estimate.total) || 0
        };

        if (stageId) oppData.pipelineStageId = stageId;
        if (ghlContactId) oppData.contactId = ghlContactId;

        const oppRes = await ghlClient.post('/opportunities/', oppData);
        const createdOpp = oppRes.data.opportunity || oppRes.data;

        // Store in local database
        await client.query(`
          INSERT INTO ${SCHEMA.ghl}.ghl_opportunities (
            ghl_id, st_job_id, st_customer_id, ghl_contact_id,
            ghl_pipeline_id, pipeline_name, ghl_pipeline_stage_id,
            name, monetary_value, status, source,
            custom_fields, ghl_created_at, full_data, synced_to_st
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, true)
          ON CONFLICT (ghl_id) DO UPDATE SET
            monetary_value = EXCLUDED.monetary_value,
            name = EXCLUDED.name,
            local_updated_at = NOW()
        `, [
          createdOpp.id,
          estimate.job_id,
          estimate.customer_id,
          ghlContactId,
          pipelineId,
          estimate.business_unit_name,
          stageId,
          oppName,
          estimate.total || 0,
          'open',
          'servicetitan_estimate',
          JSON.stringify({ stEstimateId: Number(estimate.st_id), stJobId: Number(estimate.job_id) }),
          JSON.stringify(createdOpp)
        ]);

        console.log(`   ✅ Created: ${oppName.substring(0, 50)}... → ${createdOpp.id}`);
        syncedOpps++;

        // Rate limit
        await new Promise(r => setTimeout(r, 200));

      } catch (error) {
        console.log(`   ❌ Failed: ${estimate.customer_name} - ${error.response?.data?.message || error.message}`);
        failedOpps++;
      }
    }

    console.log(`\n   Summary: ${syncedOpps} synced, ${skippedOpps} skipped, ${failedOpps} failed\n`);

    // Step 6: Final summary
    console.log('6️⃣  Final Sync Statistics:');

    const stats = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM ${SCHEMA.ghl}.ghl_contacts) as total_contacts,
        (SELECT COUNT(*) FROM ${SCHEMA.ghl}.ghl_contacts WHERE st_customer_id IS NOT NULL) as linked_contacts,
        (SELECT COUNT(*) FROM ${SCHEMA.ghl}.ghl_opportunities) as total_opportunities,
        (SELECT COUNT(*) FROM ${SCHEMA.ghl}.ghl_opportunities WHERE st_job_id IS NOT NULL) as linked_opportunities
    `);

    console.log(`   GHL Contacts:      ${stats.rows[0].total_contacts} total, ${stats.rows[0].linked_contacts} linked to ST`);
    console.log(`   GHL Opportunities: ${stats.rows[0].total_opportunities} total, ${stats.rows[0].linked_opportunities} linked to ST\n`);

    console.log('✅ GHL Sync Test Complete!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main();
