/**
 * Customer Contacts Sync Module
 *
 * Syncs customer contact information (phone/email) from ServiceTitan.
 * Uses two strategies:
 *
 * 1. FULL SYNC: Uses /export/customers/contacts with continuation tokens
 *    - Efficient for large datasets
 *    - Stores continuation token for resumable syncs
 *
 * 2. INCREMENTAL SYNC: Uses /customers/contacts with modifiedOnOrAfter
 *    - Quick updates since last sync
 *    - Minimal API calls
 */

import { stRequest } from '../../services/stClient.js';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import pg from 'pg';

const { Pool } = pg;
const logger = createLogger('sync-contacts');

let pool = null;

function getPool() {
  if (!pool) {
    // Prioritize SERVICETITAN_DATABASE_URL (has correct credentials)
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL || config.database?.url;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    logger.info(`[contacts] Connecting to database...`);
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

/**
 * Full sync using the Export endpoint
 * GET /crm/v2/tenant/{tenant}/export/customers/contacts
 */
async function fullSyncContacts() {
  const startTime = Date.now();
  logger.info('[contacts] Starting FULL sync using export endpoint...');

  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/export/customers/contacts`;

  // Get last continuation token from sync state
  const client = await getPool().connect();
  let continueFrom = null;

  try {
    const stateResult = await client.query(
      "SELECT value FROM sync_state WHERE key = 'contacts_export_token'"
    );
    if (stateResult.rows.length > 0) {
      continueFrom = stateResult.rows[0].value;
      logger.info(`[contacts] Resuming from token: ${continueFrom.substring(0, 20)}...`);
    }
  } catch (e) {
    // Table might not exist, start fresh
    logger.info('[contacts] No previous sync state, starting fresh');
  } finally {
    client.release();
  }

  let allContacts = [];
  let hasMore = true;
  let pageCount = 0;
  let newToken = null;

  while (hasMore) {
    const query = {};
    if (continueFrom) {
      query.from = continueFrom;
    }

    const response = await stRequest(baseUrl, { query });

    if (!response.ok) {
      throw new Error(`Export API error: ${response.status}`);
    }

    const contacts = response.data.data || [];
    allContacts = allContacts.concat(contacts);
    hasMore = response.data.hasMore || false;
    newToken = response.data.continueFrom;
    continueFrom = newToken;
    pageCount++;

    logger.info(`[contacts] Export page ${pageCount}: ${contacts.length} contacts (total: ${allContacts.length})`);

    // Small delay between pages
    await new Promise(r => setTimeout(r, 100));
  }

  // Process and upsert contacts
  const stats = await upsertContacts(allContacts);

  // Save the continuation token for next sync
  if (newToken) {
    await saveSyncState('contacts_export_token', newToken);
  }

  const duration = Date.now() - startTime;
  logger.info(`[contacts] Full sync completed in ${duration}ms`, stats);

  return { ...stats, duration, type: 'full' };
}

/**
 * Incremental sync using the bulk contacts endpoint
 * GET /crm/v2/tenant/{tenant}/customers/contacts?modifiedOnOrAfter=...
 */
async function incrementalSyncContacts() {
  const startTime = Date.now();
  logger.info('[contacts] Starting INCREMENTAL sync...');

  const tenantId = config.serviceTitan.tenantId;
  const baseUrl = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/customers/contacts`;

  // Get last sync time
  const client = await getPool().connect();
  let lastSyncTime = null;

  try {
    const stateResult = await client.query(
      "SELECT value FROM sync_state WHERE key = 'contacts_last_sync'"
    );
    if (stateResult.rows.length > 0) {
      lastSyncTime = stateResult.rows[0].value;
    }
  } catch (e) {
    // Start from 30 days ago if no state
  } finally {
    client.release();
  }

  // Default to 30 days ago if no last sync
  if (!lastSyncTime) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    lastSyncTime = thirtyDaysAgo.toISOString();
  }

  logger.info(`[contacts] Fetching contacts modified since: ${lastSyncTime}`);

  let allContacts = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await stRequest(baseUrl, {
      query: {
        modifiedOnOrAfter: lastSyncTime,
        pageSize: 500,
        page
      }
    });

    if (!response.ok) {
      throw new Error(`Contacts API error: ${response.status}`);
    }

    const contacts = response.data.data || [];
    allContacts = allContacts.concat(contacts);
    hasMore = response.data.hasMore || false;
    page++;

    logger.info(`[contacts] Page ${page - 1}: ${contacts.length} contacts (total: ${allContacts.length})`);

    await new Promise(r => setTimeout(r, 100));
  }

  if (allContacts.length === 0) {
    logger.info('[contacts] No new contacts to sync');
    return { fetched: 0, updated: 0, duration: Date.now() - startTime, type: 'incremental' };
  }

  // Process and upsert contacts
  const stats = await upsertContacts(allContacts);

  // Update last sync time
  await saveSyncState('contacts_last_sync', new Date().toISOString());

  const duration = Date.now() - startTime;
  logger.info(`[contacts] Incremental sync completed in ${duration}ms`, stats);

  return { ...stats, duration, type: 'incremental' };
}

/**
 * Upsert contacts to the database
 */
async function upsertContacts(contacts) {
  if (contacts.length === 0) {
    return { fetched: 0, updated: 0, failed: 0 };
  }

  logger.info(`[contacts] Processing ${contacts.length} contacts...`);

  // Group contacts by customer ID
  const contactsByCustomer = {};

  for (const contact of contacts) {
    const customerId = contact.customerId;
    if (!customerId) continue;

    if (!contactsByCustomer[customerId]) {
      contactsByCustomer[customerId] = { phones: [], emails: [] };
    }

    const contactType = contact.type;
    const value = contact.value || contact.phoneSettings?.phoneNumber;

    if (!value) continue;

    if (contactType === 'MobilePhone' || contactType === 'Phone') {
      contactsByCustomer[customerId].phones.push({
        type: contactType,
        number: value,
        isPrimary: contactType === 'MobilePhone',
        doNotText: contact.phoneSettings?.doNotText || false
      });
    } else if (contactType === 'Email') {
      contactsByCustomer[customerId].emails.push(value);
    }
  }

  const customerIds = Object.keys(contactsByCustomer);
  logger.info(`[contacts] Found contacts for ${customerIds.length} customers`);

  const client = await getPool().connect();
  let updated = 0;
  let failed = 0;

  try {
    for (const customerId of customerIds) {
      const data = contactsByCustomer[customerId];

      // Get primary phone (prefer MobilePhone)
      const primaryPhone = data.phones.find(p => p.isPrimary)?.number
        || data.phones[0]?.number
        || null;
      const primaryEmail = data.emails[0] || null;

      try {
        await client.query(`
          UPDATE st_customers
          SET
            phone = $1,
            email = $2,
            phone_numbers = $3,
            email_addresses = $4,
            local_synced_at = NOW()
          WHERE st_id = $5
        `, [
          normalizePhone(primaryPhone),
          primaryEmail,
          JSON.stringify(data.phones),
          JSON.stringify(data.emails),
          customerId
        ]);

        updated++;

        if (updated % 100 === 0) {
          logger.info(`[contacts] Updated ${updated}/${customerIds.length} customers...`);
        }
      } catch (error) {
        failed++;
        if (failed <= 5) {
          logger.error(`[contacts] Failed to update customer ${customerId}: ${error.message}`);
        }
      }
    }
  } finally {
    client.release();
  }

  return {
    fetched: contacts.length,
    customersFound: customerIds.length,
    updated,
    failed
  };
}

/**
 * Normalize phone number to consistent format
 */
function normalizePhone(phone) {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone;
}

/**
 * Save sync state to database
 */
async function saveSyncState(key, value) {
  const client = await getPool().connect();
  try {
    // Ensure sync_state table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      INSERT INTO sync_state (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
    `, [key, value]);

    logger.info(`[contacts] Saved sync state: ${key}`);
  } finally {
    client.release();
  }
}

/**
 * Get sync statistics
 */
async function getContactsStats() {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total_customers,
        COUNT(phone) as with_phone,
        COUNT(email) as with_email,
        COUNT(CASE WHEN phone IS NOT NULL AND email IS NOT NULL THEN 1 END) as with_both
      FROM st_customers
    `);

    const stateResult = await client.query(`
      SELECT key, value, updated_at
      FROM sync_state
      WHERE key LIKE 'contacts_%'
    `);

    return {
      customers: result.rows[0],
      syncState: stateResult.rows
    };
  } finally {
    client.release();
  }
}

/**
 * Main sync function - chooses strategy based on options
 */
export async function syncCustomerContacts({ full = false } = {}) {
  if (full) {
    return fullSyncContacts();
  }
  return incrementalSyncContacts();
}

export {
  fullSyncContacts,
  incrementalSyncContacts,
  getContactsStats
};

export default {
  syncCustomerContacts,
  fullSyncContacts,
  incrementalSyncContacts,
  getContactsStats
};
