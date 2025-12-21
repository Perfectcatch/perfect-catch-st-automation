#!/usr/bin/env node
/**
 * Bulk sync customer contacts using the /customers/contacts API
 * Uses: GET /crm/v2/tenant/{tenant}/customers/contacts
 * Much faster than per-customer fetching
 */

import { stRequest } from '../src/services/stClient.js';
import config from '../src/config/index.js';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL,
});

async function fetchAllContacts() {
  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/customers/contacts`;

  // Fetch contacts modified in last 2 years
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  let allContacts = [];
  let page = 1;
  let hasMore = true;

  console.log('Fetching all customer contacts...');

  while (hasMore) {
    const response = await stRequest(baseUrl, {
      query: {
        modifiedOnOrAfter: twoYearsAgo.toISOString(),
        pageSize: 500,
        page
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch contacts: ${response.status}`);
    }

    const contacts = response.data.data || [];
    allContacts = allContacts.concat(contacts);
    hasMore = response.data.hasMore || false;

    console.log(`  Page ${page}: ${contacts.length} contacts (total: ${allContacts.length})`);
    page++;

    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 200));
  }

  return allContacts;
}

async function updateCustomerContacts() {
  console.log('='.repeat(60));
  console.log('Bulk Customer Contacts Sync');
  console.log('='.repeat(60));

  try {
    // Fetch all contacts in bulk
    const contacts = await fetchAllContacts();
    console.log(`\nFetched ${contacts.length} total contacts`);

    // Group contacts by customer ID
    // Contact structure: { id, customerId, type, value, phoneSettings }
    const contactsByCustomer = {};

    for (const contact of contacts) {
      const customerId = contact.customerId;
      if (!customerId) continue;

      if (!contactsByCustomer[customerId]) {
        contactsByCustomer[customerId] = { phones: [], emails: [] };
      }

      if (contact.type === 'MobilePhone' || contact.type === 'Phone') {
        const phone = contact.value || contact.phoneSettings?.phoneNumber;
        if (phone) {
          contactsByCustomer[customerId].phones.push({
            type: contact.type,
            number: phone,
            isPrimary: contact.type === 'MobilePhone'
          });
        }
      } else if (contact.type === 'Email') {
        if (contact.value) {
          contactsByCustomer[customerId].emails.push(contact.value);
        }
      }
    }

    const customerIds = Object.keys(contactsByCustomer);
    console.log(`Found contacts for ${customerIds.length} customers`);

    // Update database
    let updated = 0;
    let failed = 0;

    for (const customerId of customerIds) {
      const data = contactsByCustomer[customerId];

      // Get primary phone (prefer MobilePhone)
      const primaryPhone = data.phones.find(p => p.isPrimary)?.number || data.phones[0]?.number || null;
      const primaryEmail = data.emails[0] || null;

      try {
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
          primaryPhone,
          primaryEmail,
          JSON.stringify(data.phones),
          JSON.stringify(data.emails),
          customerId
        ]);

        updated++;

        if (updated % 100 === 0) {
          console.log(`Updated ${updated}/${customerIds.length} customers...`);
        }
      } catch (error) {
        failed++;
        console.error(`Failed to update customer ${customerId}: ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total contacts fetched: ${contacts.length}`);
    console.log(`Customers with contacts: ${customerIds.length}`);
    console.log(`Successfully updated: ${updated}`);
    console.log(`Failed: ${failed}`);

    // Show sample
    const sample = await pool.query(`
      SELECT st_id, name, phone, email
      FROM servicetitan.st_customers
      WHERE phone IS NOT NULL
      LIMIT 5
    `);
    console.log('\nSample customers with phone:');
    console.table(sample.rows);

  } catch (error) {
    console.error('Fatal error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

updateCustomerContacts();
