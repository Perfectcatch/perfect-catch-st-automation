#!/usr/bin/env node
/**
 * Test Script: Sync January customers and create GHL opportunities for last week's jobs
 * 
 * Usage: node scripts/test-sync-and-create-opps.js
 */

import 'dotenv/config';
import pg from 'pg';
import axios from 'axios';

const { Pool } = pg;

// Configuration
const config = {
  st: {
    tenantId: process.env.ST_TENANT_ID || process.env.SERVICE_TITAN_TENANT_ID,
    clientId: process.env.ST_CLIENT_ID || process.env.SERVICE_TITAN_CLIENT_ID,
    clientSecret: process.env.ST_CLIENT_SECRET || process.env.SERVICE_TITAN_CLIENT_SECRET,
    appKey: process.env.ST_APP_KEY || process.env.SERVICE_TITAN_APP_KEY,
  },
  ghl: {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID,
    salesPipelineId: process.env.GHL_SALES_PIPELINE_ID || 'fWJfnMsPzwOXgKdWxdjC',
  },
  db: {
    url: process.env.DATABASE_URL,
  }
};

// Sales Pipeline Stages
const STAGES = {
  NEW_LEAD: '3dc14ef1-7883-40d4-9831-61a313a46e0a',
  CONTACTED: '56ab4d16-e629-4315-a755-7755677e03e1',
  APPOINTMENT_SCHEDULED: 'e439d832-d8af-47a6-b459-26ed1f210f96',
};

// Logger
const log = (msg, level = 'info') => {
  const ts = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✓';
  console.log(`[${ts}] ${prefix} ${msg}`);
};

// Database pool
const pool = new Pool({
  connectionString: config.db.url,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

// ServiceTitan token cache
let stToken = null;
let stTokenExpiry = null;

async function getSTToken() {
  if (stToken && stTokenExpiry && Date.now() < stTokenExpiry - 300000) {
    return stToken;
  }

  log('Getting ServiceTitan token...');
  const response = await axios.post(
    'https://auth.servicetitan.io/connect/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.st.clientId,
      client_secret: config.st.clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  stToken = response.data.access_token;
  stTokenExpiry = Date.now() + (response.data.expires_in * 1000);
  log('ServiceTitan token acquired');
  return stToken;
}

async function stRequest(method, endpoint, data = null) {
  const token = await getSTToken();
  const url = `https://api.servicetitan.io${endpoint}`;
  
  const response = await axios({
    method,
    url,
    data,
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': config.st.appKey,
      'Content-Type': 'application/json',
    },
  });
  
  return response.data;
}

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${config.ghl.apiKey}`,
  },
});

/**
 * Step 1: Sync customers created in January 2026
 */
async function syncJanuaryCustomers() {
  log('=== Step 1: Syncing January 2026 customers ===');
  
  const startDate = '2026-01-01T00:00:00Z';
  const endDate = '2026-01-31T23:59:59Z';
  
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/crm/v2/tenant/${config.st.tenantId}/customers?page=${page}&pageSize=50&createdOnOrAfter=${startDate}&createdBefore=${endDate}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    log(`Page ${page}: Found ${data.data.length} customers`);
    
    for (const customer of data.data) {
      const record = {
        st_id: customer.id,
        name: customer.name,
        first_name: customer.contacts?.[0]?.firstName,
        last_name: customer.contacts?.[0]?.lastName,
        email: customer.contacts?.[0]?.email,
        phone: customer.contacts?.[0]?.phoneNumber,
        address_line1: customer.address?.street,
        city: customer.address?.city,
        state: customer.address?.state,
        zip: customer.address?.zip,
        active: customer.active,
        st_created_on: customer.createdOn,
        st_modified_on: customer.modifiedOn,
        full_data: JSON.stringify(customer),
        fetched_at: new Date().toISOString(),
      };
      
      await pool.query(`
        INSERT INTO raw_st_customers (st_id, name, first_name, last_name, email, phone, address_line1, city, state, zip, active, st_created_on, st_modified_on, full_data, fetched_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (st_id) DO UPDATE SET
          name = EXCLUDED.name,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          email = EXCLUDED.email,
          phone = EXCLUDED.phone,
          address_line1 = EXCLUDED.address_line1,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip = EXCLUDED.zip,
          active = EXCLUDED.active,
          st_modified_on = EXCLUDED.st_modified_on,
          full_data = EXCLUDED.full_data,
          fetched_at = EXCLUDED.fetched_at
      `, [record.st_id, record.name, record.first_name, record.last_name, record.email, record.phone, 
          record.address_line1, record.city, record.state, record.zip, record.active, 
          record.st_created_on, record.st_modified_on, record.full_data, record.fetched_at]);
      
      total++;
    }
    
    if (!data.hasMore) break;
    page++;
    await new Promise(r => setTimeout(r, 250));
  }
  
  log(`Synced ${total} customers from January 2026`);
  return total;
}

/**
 * Step 2: Sync jobs from last week
 */
async function syncLastWeekJobs() {
  log('=== Step 2: Syncing jobs from last week ===');
  
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  let page = 1;
  let total = 0;
  
  while (true) {
    const data = await stRequest('GET', 
      `/jpm/v2/tenant/${config.st.tenantId}/jobs?page=${page}&pageSize=50&createdOnOrAfter=${lastWeek.toISOString()}`
    );
    
    if (!data.data || data.data.length === 0) break;
    
    log(`Page ${page}: Found ${data.data.length} jobs`);
    
    for (const job of data.data) {
      const record = {
        st_id: job.id,
        job_number: job.number,
        customer_id: job.customerId,
        location_id: job.locationId,
        business_unit_id: job.businessUnitId,
        job_type_id: job.jobTypeId,
        status: job.jobStatus,
        summary: job.summary,
        total: job.total || 0,
        st_created_on: job.createdOn,
        st_modified_on: job.modifiedOn,
        completed_on: job.completedOn,
        full_data: JSON.stringify(job),
        fetched_at: new Date().toISOString(),
      };
      
      await pool.query(`
        INSERT INTO raw_st_jobs (st_id, job_number, customer_id, location_id, business_unit_id, job_type_id, status, summary, total, st_created_on, st_modified_on, completed_on, full_data, fetched_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (st_id) DO UPDATE SET
          job_number = EXCLUDED.job_number,
          customer_id = EXCLUDED.customer_id,
          status = EXCLUDED.status,
          summary = EXCLUDED.summary,
          total = EXCLUDED.total,
          st_modified_on = EXCLUDED.st_modified_on,
          completed_on = EXCLUDED.completed_on,
          full_data = EXCLUDED.full_data,
          fetched_at = EXCLUDED.fetched_at
      `, [record.st_id, record.job_number, record.customer_id, record.location_id, record.business_unit_id,
          record.job_type_id, record.status, record.summary, record.total, record.st_created_on,
          record.st_modified_on, record.completed_on, record.full_data, record.fetched_at]);
      
      total++;
    }
    
    if (!data.hasMore) break;
    page++;
    await new Promise(r => setTimeout(r, 250));
  }
  
  log(`Synced ${total} jobs from last week`);
  return total;
}

/**
 * Step 3: Create GHL opportunities for jobs without existing opportunities
 */
async function createGHLOpportunities() {
  log('=== Step 3: Creating GHL opportunities ===');
  
  // Get jobs from last week with customer info that don't have GHL opportunities yet
  const result = await pool.query(`
    SELECT 
      j.st_id as job_id,
      j.job_number,
      j.summary,
      j.total,
      j.st_created_on,
      c.st_id as customer_id,
      c.name as customer_name,
      c.first_name,
      c.last_name,
      c.email,
      c.phone,
      c.address_line1,
      c.city,
      c.state,
      c.zip
    FROM raw_st_jobs j
    JOIN raw_st_customers c ON j.customer_id = c.st_id
    LEFT JOIN ghl_opportunities o ON o.st_job_id = j.st_id
    WHERE j.st_created_on >= NOW() - INTERVAL '7 days'
      AND o.id IS NULL
    ORDER BY j.st_created_on DESC
    LIMIT 20
  `);
  
  log(`Found ${result.rows.length} jobs needing GHL opportunities`);
  
  let created = 0;
  let failed = 0;
  
  for (const job of result.rows) {
    try {
      // First, find or create contact in GHL
      let contactId = null;
      
      // Search for existing contact by email or phone
      if (job.email || job.phone) {
        const searchQuery = job.email || job.phone;
        const searchResp = await ghlClient.get(`/contacts/search/duplicate`, {
          params: {
            locationId: config.ghl.locationId,
            email: job.email || undefined,
            phone: job.phone || undefined,
          }
        });
        
        if (searchResp.data?.contact?.id) {
          contactId = searchResp.data.contact.id;
          log(`Found existing GHL contact: ${contactId}`);
        }
      }
      
      // Create contact if not found
      if (!contactId) {
        const contactData = {
          locationId: config.ghl.locationId,
          firstName: job.first_name || job.customer_name?.split(' ')[0] || 'Unknown',
          lastName: job.last_name || job.customer_name?.split(' ').slice(1).join(' ') || '',
          email: job.email || undefined,
          phone: job.phone || undefined,
          address1: job.address_line1 || undefined,
          city: job.city || undefined,
          state: job.state || undefined,
          postalCode: job.zip || undefined,
          source: 'ServiceTitan',
          customFields: [
            { key: 'st_customer_id', field_value: String(job.customer_id) }
          ],
        };
        
        const createResp = await ghlClient.post('/contacts/', contactData);
        contactId = createResp.data?.contact?.id;
        log(`Created GHL contact: ${contactId}`);
      }
      
      if (!contactId) {
        log(`Failed to get/create contact for job ${job.job_number}`, 'warn');
        failed++;
        continue;
      }
      
      // Create opportunity
      const oppData = {
        locationId: config.ghl.locationId,
        pipelineId: config.ghl.salesPipelineId,
        pipelineStageId: STAGES.CONTACTED,
        contactId: contactId,
        name: `Job #${job.job_number} - ${job.customer_name || 'Customer'}`,
        status: 'open',
        monetaryValue: job.total || 0,
        source: 'ServiceTitan',
        customFields: [
          { key: 'st_job_id', field_value: String(job.job_id) },
          { key: 'st_customer_id', field_value: String(job.customer_id) },
        ],
      };
      
      const oppResp = await ghlClient.post('/opportunities/', oppData);
      const oppId = oppResp.data?.opportunity?.id;
      
      if (oppId) {
        // Save to local DB
        await pool.query(`
          INSERT INTO ghl_opportunities (ghl_id, location_id, contact_id, pipeline_id, pipeline_stage_id, name, status, monetary_value, st_job_id, full_data, fetched_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (ghl_id) DO NOTHING
        `, [oppId, config.ghl.locationId, contactId, config.ghl.salesPipelineId, STAGES.CONTACTED,
            oppData.name, 'open', job.total || 0, job.job_id, JSON.stringify(oppResp.data)]);
        
        log(`Created opportunity: ${oppData.name} (${oppId})`);
        created++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      log(`Error creating opportunity for job ${job.job_number}: ${error.message}`, 'error');
      failed++;
    }
  }
  
  return { created, failed };
}

async function main() {
  log('========================================');
  log('ST-Automation Test: Sync & Create Opps');
  log('========================================');
  
  try {
    // Verify config
    if (!config.st.clientId || !config.st.clientSecret) {
      throw new Error('Missing ServiceTitan credentials');
    }
    if (!config.ghl.apiKey) {
      throw new Error('Missing GHL API key');
    }
    if (!config.db.url) {
      throw new Error('Missing DATABASE_URL');
    }
    
    log(`ST Tenant: ${config.st.tenantId}`);
    log(`GHL Location: ${config.ghl.locationId}`);
    
    // Run steps
    const customers = await syncJanuaryCustomers();
    const jobs = await syncLastWeekJobs();
    const opps = await createGHLOpportunities();
    
    log('========================================');
    log('SUMMARY');
    log('========================================');
    log(`Customers synced: ${customers}`);
    log(`Jobs synced: ${jobs}`);
    log(`Opportunities created: ${opps.created}`);
    log(`Opportunities failed: ${opps.failed}`);
    
  } catch (error) {
    log(`Fatal error: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
