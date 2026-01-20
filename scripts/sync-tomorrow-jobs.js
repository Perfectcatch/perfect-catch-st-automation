/**
 * Sync Tomorrow's Jobs to GHL
 * Creates GHL opportunities for jobs scheduled tomorrow that don't have them
 */

import { stRequest } from '../src/services/stClient.js';
import { stEndpoints } from '../src/lib/stEndpoints.js';
import { getPool } from '../src/services/sync/sync-base.js';
import { GHL_PIPELINES, GHL_LOCATION_ID, buildOpportunityCustomFields } from '../src/config/ghl-pipelines.js';
import axios from 'axios';

const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

// Business unit to pipeline mapping
const BU_PIPELINE_MAP = {
  1314: 'SALES',      // Electrical Sales
  1308: 'INSTALL',    // Electrical Install
  4622: 'SALES',      // Pool Sales
  4623: 'INSTALL',    // Pool Install/Builder
  26143: 'SALES',     // Pool Residential (treating as sales for estimates)
  54670601: 'SALES'   // Service (fallback)
};

async function fetchCustomer(customerId) {
  try {
    const result = await stRequest(stEndpoints.customers.get(customerId));
    return result.ok ? result.data : null;
  } catch (e) {
    console.error(`Failed to fetch customer ${customerId}:`, e.message);
    return null;
  }
}

async function fetchJob(jobId) {
  try {
    const result = await stRequest(stEndpoints.jobs.get(jobId));
    return result.ok ? result.data : null;
  } catch (e) {
    console.error(`Failed to fetch job ${jobId}:`, e.message);
    return null;
  }
}

function splitName(fullName) {
  if (!fullName) return { firstName: 'Unknown', lastName: 'Customer' };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: 'Customer' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

async function findOrCreateGHLContact(customer) {
  // Get customer contacts for phone/email
  let phone = null;
  let email = null;

  if (customer.contacts && customer.contacts.length > 0) {
    for (const contact of customer.contacts) {
      if (contact.phoneNumber && !phone) phone = contact.phoneNumber;
      if (contact.email && !email) email = contact.email;
    }
  }

  console.log(`Customer details - Name: ${customer.name}, Phone: ${phone}, Email: ${email}`);

  // Search for existing contact by email or phone
  if (email || phone) {
    try {
      const searchResult = await ghlClient.get('/contacts/search/duplicate', {
        params: {
          locationId: GHL_LOCATION_ID,
          email: email || undefined,
          phone: phone || undefined
        }
      });

      if (searchResult.data?.contact?.id) {
        console.log(`Found existing contact: ${searchResult.data.contact.id}`);
        return searchResult.data.contact.id;
      }
    } catch (e) {
      // Contact not found, create new
    }
  }

  // Create new contact
  try {
    const { firstName, lastName } = splitName(customer.name);

    const contactData = {
      locationId: GHL_LOCATION_ID,
      firstName: firstName,
      lastName: lastName,
      email: email || undefined,
      phone: phone || undefined,
      address1: customer.address?.street,
      city: customer.address?.city,
      state: customer.address?.state,
      postalCode: customer.address?.zip
    };

    // Must have either email, phone, or both first and last name
    if (!email && !phone && (!firstName || !lastName || lastName === 'Customer')) {
      console.error('Contact requires email, phone, or proper first/last name');
      return null;
    }

    const createResult = await ghlClient.post('/contacts/', contactData);
    console.log(`Created contact: ${createResult.data.contact.id}`);
    return createResult.data.contact.id;
  } catch (e) {
    console.error('Failed to create contact:', e.response?.data || e.message);
    return null;
  }
}

async function createOpportunity(job, customer, pipelineType, jobTypeName) {
  const client = await getPool().connect();

  try {
    // Find or create GHL contact
    const contactId = await findOrCreateGHLContact(customer);
    if (!contactId) {
      console.error(`Cannot create opportunity without contact for job ${job.id}`);
      return null;
    }

    // Determine pipeline and stage
    const pipeline = pipelineType === 'INSTALL'
      ? GHL_PIPELINES.INSTALL_PIPELINE
      : GHL_PIPELINES.SALES_PIPELINE;

    const stageId = pipelineType === 'INSTALL'
      ? pipeline.stages.ESTIMATE_APPROVED_JOB_CREATED
      : pipeline.stages.APPOINTMENT_SCHEDULED;

    // Build opportunity name
    const oppName = `${customer.name} - ${jobTypeName || job.summary || 'Job'}`;

    // Build custom fields
    const customFields = buildOpportunityCustomFields({
      stCustomerId: customer.id,
      stJobId: job.id,
      streetAddress: customer.address?.street,
      city: customer.address?.city,
      state: customer.address?.state,
      postalCode: customer.address?.zip
    });

    // Create in GHL
    const oppData = {
      locationId: GHL_LOCATION_ID,
      contactId: contactId,
      pipelineId: pipeline.id,
      pipelineStageId: stageId,
      name: oppName,
      status: 'open',
      monetaryValue: job.total || 0,
      customFields: customFields
    };

    console.log(`Creating opportunity: ${oppName} in ${pipelineType} pipeline`);

    const result = await ghlClient.post('/opportunities/', oppData);
    const ghlId = result.data.opportunity.id;

    // Save to local DB
    await client.query(`
      INSERT INTO public.ghl_opportunities (
        ghl_id, name, pipeline_id, pipeline_stage_id, contact_id,
        st_job_id, monetary_value, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW(), NOW())
      ON CONFLICT (ghl_id) DO UPDATE SET
        name = EXCLUDED.name,
        pipeline_id = EXCLUDED.pipeline_id,
        pipeline_stage_id = EXCLUDED.pipeline_stage_id,
        updated_at = NOW()
    `, [ghlId, oppName, pipeline.id, stageId, contactId, job.id, job.total || 0]);

    console.log(`✅ Created opportunity ${ghlId} for job ${job.id}`);
    return ghlId;

  } catch (e) {
    console.error(`Failed to create opportunity for job ${job.id}:`, e.response?.data || e.message);
    return null;
  } finally {
    client.release();
  }
}

async function main() {
  const client = await getPool().connect();

  try {
    // Jobs that need opportunities
    const jobsToProcess = [
      { jobId: 62795422, buId: 1314, jobType: 'Electrical - Sales: Estimate' },
      { jobId: 62819335, buId: 1308, jobType: 'Electrical - Install: 1. Callback' },
      { jobId: 62822278, buId: 1308, jobType: 'Electrical Install (Project) - Residential' },
      { jobId: 62709127, buId: 1308, jobType: 'Electrical - Install: 2. Recall' }
    ];

    let created = 0;
    let failed = 0;

    for (const jobInfo of jobsToProcess) {
      console.log(`\n=== Processing Job ${jobInfo.jobId} ===`);

      // Check if opportunity already exists
      const existing = await client.query(
        'SELECT ghl_id FROM public.ghl_opportunities WHERE st_job_id = $1',
        [jobInfo.jobId]
      );

      if (existing.rows.length > 0) {
        console.log(`Opportunity already exists: ${existing.rows[0].ghl_id}`);
        continue;
      }

      // Fetch job details
      const job = await fetchJob(jobInfo.jobId);
      if (!job) {
        console.error(`Could not fetch job ${jobInfo.jobId}`);
        failed++;
        continue;
      }

      // Fetch customer details
      const customer = await fetchCustomer(job.customerId);
      if (!customer) {
        console.error(`Could not fetch customer ${job.customerId}`);
        failed++;
        continue;
      }

      console.log(`Customer: ${customer.name}`);
      console.log(`Job Type: ${jobInfo.jobType}`);

      // Determine pipeline type
      const pipelineType = BU_PIPELINE_MAP[jobInfo.buId] || 'SALES';
      console.log(`Pipeline: ${pipelineType}`);

      // Create opportunity
      const ghlId = await createOpportunity(job, customer, pipelineType, jobInfo.jobType);

      if (ghlId) {
        created++;
      } else {
        failed++;
      }

      // Rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    console.log(`\n=== Summary ===`);
    console.log(`Created: ${created}`);
    console.log(`Failed: ${failed}`);

  } finally {
    client.release();
  }
}

main().catch(console.error);
