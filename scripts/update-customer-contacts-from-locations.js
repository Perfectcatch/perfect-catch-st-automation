#!/usr/bin/env node
/**
 * Update customer contact information from ServiceTitan locations
 * 
 * ServiceTitan stores contact info (phone/email) in locations, not customers.
 * This script fetches location data for each customer and updates the customer record.
 */

import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:6432/perfectcatch_automation',
});

async function fetchCustomerLocations(customerId) {
  const tenantId = config.serviceTitan.tenantId;
  const url = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/locations`;
  
  const response = await stRequest(url, {
    query: {
      customerId: customerId,
      active: 'any',
      pageSize: 100
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch locations for customer ${customerId}: ${response.status}`);
  }

  return response.data.data || [];
}

async function updateCustomerContacts() {
  console.log('='.repeat(60));
  console.log('Update Customer Contacts from Locations');
  console.log('='.repeat(60));

  try {
    // Get all customers
    const customersResult = await pool.query(`
      SELECT st_id, name 
      FROM servicetitan.st_customers 
      ORDER BY st_id
    `);

    const totalCustomers = customersResult.rows.length;
    console.log(`\nFound ${totalCustomers} customers to process`);

    let processed = 0;
    let updated = 0;
    let failed = 0;
    let noLocations = 0;

    for (const customer of customersResult.rows) {
      processed++;
      
      try {
        // Fetch locations for this customer
        const locations = await fetchCustomerLocations(customer.st_id);
        
        if (locations.length === 0) {
          noLocations++;
          continue;
        }

        // Get primary location (first one) for contact info
        const primaryLocation = locations[0];
        
        // Extract contact info from location
        const phone = primaryLocation.phoneNumbers?.[0]?.number || null;
        const email = primaryLocation.emails?.[0]?.address || null;
        const phoneNumbers = primaryLocation.phoneNumbers || [];
        const emailAddresses = primaryLocation.emails || [];

        // Update customer record
        await pool.query(`
          UPDATE servicetitan.st_customers 
          SET 
            phone = $1,
            email = $2,
            phone_numbers = $3,
            email_addresses = $4,
            local_synced_at = NOW()
          WHERE st_id = $5
        `, [
          phone,
          email,
          JSON.stringify(phoneNumbers),
          JSON.stringify(emailAddresses),
          customer.st_id
        ]);

        updated++;

        if (updated % 50 === 0) {
          console.log(`Progress: ${processed}/${totalCustomers} | Updated: ${updated} | No locations: ${noLocations} | Failed: ${failed}`);
        }

        // Rate limiting - 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        failed++;
        console.error(`Failed to process customer ${customer.st_id} (${customer.name}): ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('UPDATE COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total processed: ${processed}`);
    console.log(`Updated with contact info: ${updated}`);
    console.log(`No locations found: ${noLocations}`);
    console.log(`Failed: ${failed}`);

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateCustomerContacts();
