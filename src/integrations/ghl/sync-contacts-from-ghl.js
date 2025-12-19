/**
 * Import contacts FROM GoHighLevel
 * Creates ST customers from GHL contacts
 *
 * Schema:
 *   - integrations.ghl_contacts - GHL contact storage
 *   - servicetitan.st_customers - ServiceTitan customers
 */

import axios from 'axios';
import config from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getPool } from '../../services/sync/sync-base.js';
import { stRequest } from '../../services/stClient.js';

// Schema prefixes for proper table references
const SCHEMA = {
  ghl: 'integrations',
  st: 'servicetitan'
};

const logger = createLogger('ghl-contacts');

// GHL API client
const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

// Add auth header dynamically
ghlClient.interceptors.request.use((config) => {
  config.headers['Authorization'] = `Bearer ${process.env.GHL_API_KEY || process.env.GHL_ACCESS_TOKEN}`;
  return config;
});

/**
 * Sync contacts from GHL
 */
export async function syncContactsFromGHL() {
  const syncId = await startSyncLog('import_contacts', 'from_ghl');
  let stats = { fetched: 0, created: 0, matched: 0, customersCreated: 0, failed: 0 };
  
  try {
    logger.info('Syncing contacts from GHL...');
    
    const locationId = process.env.GHL_LOCATION_ID;
    if (!locationId) {
      throw new Error('GHL_LOCATION_ID environment variable not set');
    }
    
    let hasMore = true;
    let startAfterId = null;
    
    while (hasMore) {
      const params = {
        locationId,
        limit: 100
      };
      
      if (startAfterId) {
        params.startAfterId = startAfterId;
      }
      
      const response = await ghlClient.get('/contacts/', { params });
      const contacts = response.data?.contacts || [];
      
      stats.fetched += contacts.length;
      
      for (const contact of contacts) {
        try {
          // Store contact in ghl_contacts table
          const result = await upsertGHLContact(contact);
          result.isNew ? stats.created++ : stats.created; // Count as created if new
          
          // Try to match to existing ST customer
          const matchedCustomerId = await matchContactToCustomer(contact.id);
          
          if (matchedCustomerId) {
            stats.matched++;
          } else {
            // Create new ST customer if contact is a customer type
            const isCustomer = contact.type === 'customer' || 
                              contact.tags?.some(t => t.toLowerCase().includes('customer'));
            
            if (isCustomer) {
              const created = await createSTCustomerFromContact(contact.id);
              if (created) stats.customersCreated++;
            }
          }
          
        } catch (error) {
          logger.error('Failed to process contact', {
            contactId: contact.id,
            error: error.message
          });
          stats.failed++;
        }
      }
      
      // Check if there are more contacts
      hasMore = contacts.length === 100;
      if (contacts.length > 0) {
        startAfterId = contacts[contacts.length - 1].id;
      }
      
      // Limit to 500 contacts per sync to avoid timeout
      if (stats.fetched >= 500) {
        logger.info('Reached contact limit, stopping sync');
        hasMore = false;
      }
    }
    
    await completeSyncLog(syncId, stats);
    logger.info('GHL contacts sync completed', stats);
    return stats;
    
  } catch (error) {
    await failSyncLog(syncId, error);
    logger.error('GHL contacts sync failed', { error: error.message });
    throw error;
  }
}

/**
 * Upsert a GHL contact to local database
 */
async function upsertGHLContact(contact) {
  const client = await getPool().connect();
  
  try {
    // Check if exists
    const existing = await client.query(
      `SELECT id, st_customer_id FROM ${SCHEMA.ghl}.ghl_contacts WHERE ghl_id = $1`,
      [contact.id]
    );
    
    const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name || 'Unknown';
    
    if (existing.rows.length === 0) {
      // Insert new
      await client.query(`
        INSERT INTO ${SCHEMA.ghl}.ghl_contacts (
          ghl_id, ghl_location_id, first_name, last_name, name,
          email, phone, address_line1, city, state, zip, country,
          phone_numbers, email_addresses, tags, source, type,
          custom_fields, ghl_created_at, ghl_updated_at, full_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `, [
        contact.id,
        contact.locationId,
        contact.firstName,
        contact.lastName,
        fullName,
        contact.email,
        contact.phone,
        contact.address1,
        contact.city,
        contact.state,
        contact.postalCode,
        contact.country,
        JSON.stringify(contact.additionalPhones || []),
        JSON.stringify(contact.additionalEmails || []),
        JSON.stringify(contact.tags || []),
        contact.source,
        contact.type,
        JSON.stringify(contact.customFields || {}),
        contact.dateAdded ? new Date(contact.dateAdded) : null,
        contact.dateUpdated ? new Date(contact.dateUpdated) : null,
        JSON.stringify(contact)
      ]);
      
      return { isNew: true };
    } else {
      // Update existing
      await client.query(`
        UPDATE ${SCHEMA.ghl}.ghl_contacts SET
          first_name = $2,
          last_name = $3,
          name = $4,
          email = $5,
          phone = $6,
          tags = $7,
          ghl_updated_at = $8,
          full_data = $9,
          local_synced_at = NOW()
        WHERE ghl_id = $1
      `, [
        contact.id,
        contact.firstName,
        contact.lastName,
        fullName,
        contact.email,
        contact.phone,
        JSON.stringify(contact.tags || []),
        contact.dateUpdated ? new Date(contact.dateUpdated) : null,
        JSON.stringify(contact)
      ]);
      
      return { isNew: false };
    }
  } finally {
    client.release();
  }
}

/**
 * Match GHL contact to existing ST customer
 */
async function matchContactToCustomer(ghlContactId) {
  const client = await getPool().connect();
  
  try {
    // Get contact details
    const contactResult = await client.query(
      `SELECT * FROM ${SCHEMA.ghl}.ghl_contacts WHERE ghl_id = $1`,
      [ghlContactId]
    );
    
    const contact = contactResult.rows[0];
    if (!contact || contact.st_customer_id) {
      return contact?.st_customer_id; // Already matched
    }
    
    let customerId = null;
    
    // Try email match first
    if (contact.email) {
      const emailMatch = await client.query(
        `SELECT st_id FROM ${SCHEMA.st}.st_customers WHERE email = $1 LIMIT 1`,
        [contact.email]
      );
      customerId = emailMatch.rows[0]?.st_id;
    }

    // Try phone match if no email match
    if (!customerId && contact.phone) {
      // Normalize phone (remove non-digits)
      const normalizedPhone = contact.phone.replace(/\D/g, '');
      const phoneMatch = await client.query(
        `SELECT st_id FROM ${SCHEMA.st}.st_customers
         WHERE REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [normalizedPhone]
      );
      customerId = phoneMatch.rows[0]?.st_id;
    }

    // Update contact with match
    if (customerId) {
      await client.query(
        `UPDATE ${SCHEMA.ghl}.ghl_contacts SET st_customer_id = $2, synced_to_st = true WHERE ghl_id = $1`,
        [ghlContactId, customerId]
      );
      
      logger.debug('Matched GHL contact to ST customer', {
        contactId: ghlContactId,
        customerId
      });
    }
    
    return customerId;
    
  } finally {
    client.release();
  }
}

/**
 * Create ST customer from GHL contact
 */
async function createSTCustomerFromContact(ghlContactId) {
  const client = await getPool().connect();

  try {
    // Get contact
    const contactResult = await client.query(
      `SELECT * FROM ${SCHEMA.ghl}.ghl_contacts WHERE ghl_id = $1`,
      [ghlContactId]
    );
    
    const contact = contactResult.rows[0];
    if (!contact || contact.st_customer_id) {
      return false; // Already synced or not found
    }
    
    // Create customer in ServiceTitan via API
    const tenantId = config.serviceTitan.tenantId;
    const customerUrl = `${config.serviceTitan.apiBaseUrl}/crm/v2/tenant/${tenantId}/customers`;
    
    const customerData = {
      name: contact.name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      type: 'Residential',
      address: {
        street: contact.address_line1,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        country: contact.country || 'USA'
      }
    };
    
    // Add contact info if available
    if (contact.email) {
      customerData.email = contact.email;
    }
    if (contact.phone) {
      customerData.phoneSettings = {
        phoneNumber: contact.phone,
        doNotText: false
      };
    }
    
    const response = await stRequest(customerUrl, {
      method: 'POST',
      body: customerData
    });
    
    if (!response.ok) {
      throw new Error(`ST API error: ${response.status} - ${JSON.stringify(response.data)}`);
    }
    
    const createdCustomer = response.data;
    
    // Store in local database
    await client.query(`
      INSERT INTO ${SCHEMA.st}.st_customers (
        st_id, tenant_id, name, type, email, phone,
        address_line1, city, state, zip,
        full_data, st_created_on, st_modified_on
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (st_id) DO NOTHING
    `, [
      createdCustomer.id,
      createdCustomer.tenantId || tenantId,
      createdCustomer.name,
      createdCustomer.type || 'Residential',
      createdCustomer.email,
      createdCustomer.phoneNumbers?.[0]?.number || contact.phone,
      createdCustomer.address?.street,
      createdCustomer.address?.city,
      createdCustomer.address?.state,
      createdCustomer.address?.zip,
      JSON.stringify(createdCustomer),
      createdCustomer.createdOn ? new Date(createdCustomer.createdOn) : new Date(),
      createdCustomer.modifiedOn ? new Date(createdCustomer.modifiedOn) : new Date()
    ]);
    
    // Link in GHL contact
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_contacts SET
        st_customer_id = $2,
        synced_to_st = true,
        st_sync_error = NULL,
        local_synced_at = NOW()
      WHERE ghl_id = $1
    `, [ghlContactId, createdCustomer.id]);
    
    logger.info('Created ST customer from GHL contact', {
      contactId: ghlContactId,
      customerId: createdCustomer.id
    });
    
    return true;
    
  } catch (error) {
    logger.error('Error creating ST customer from contact', {
      contactId: ghlContactId,
      error: error.message
    });

    await client.query(
      `UPDATE ${SCHEMA.ghl}.ghl_contacts SET st_sync_error = $2 WHERE ghl_id = $1`,
      [ghlContactId, error.message]
    );

    return false;
  } finally {
    client.release();
  }
}

// ============================================
// Sync Log Helpers
// ============================================

async function startSyncLog(type, direction) {
  const client = await getPool().connect();
  try {
    const result = await client.query(`
      INSERT INTO ${SCHEMA.ghl}.ghl_sync_log (sync_type, direction, status, triggered_by)
      VALUES ($1, $2, 'started', 'scheduled')
      RETURNING id
    `, [type, direction]);
    return result.rows[0].id;
  } finally {
    client.release();
  }
}

async function completeSyncLog(id, stats) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_sync_log SET
        status = 'completed',
        records_fetched = $2,
        records_created = $3,
        records_updated = $4,
        records_failed = $5,
        completed_at = NOW()
      WHERE id = $1
    `, [id, stats.fetched, stats.created + stats.matched, stats.customersCreated, stats.failed]);
  } finally {
    client.release();
  }
}

async function failSyncLog(id, error) {
  const client = await getPool().connect();
  try {
    await client.query(`
      UPDATE ${SCHEMA.ghl}.ghl_sync_log SET
        status = 'failed',
        error_message = $2,
        completed_at = NOW()
      WHERE id = $1
    `, [id, error.message]);
  } finally {
    client.release();
  }
}

export default { syncContactsFromGHL };
