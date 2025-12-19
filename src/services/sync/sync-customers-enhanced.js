/**
 * Enhanced Customer Sync Module
 * Syncs customers with full enrichment from ServiceTitan
 */

import { SyncBase, getPool, fetchAllPages, fetchDetails, sleep, logger } from './sync-base-enhanced.js';
import config from '../../config/index.js';

export class CustomerSync extends SyncBase {
  constructor() {
    super('customers');
    this.locationCache = new Map();
  }
  
  async fetchList() {
    return fetchAllPages('/crm/v2/tenant/{tenant}/customers', {
      active: 'True'
    });
  }
  
  async enrichOne(customer) {
    // Get full customer details
    const details = await fetchDetails('/crm/v2/tenant/{tenant}/customers', customer.id);
    
    if (!details) {
      return customer;
    }
    
    // Get location details if available
    let location = null;
    const locationId = details.locationId || details.locations?.[0]?.id;
    
    if (locationId) {
      location = await this.getLocation(locationId);
    }
    
    // Get contacts from the separate contacts endpoint
    let contacts = [];
    try {
      contacts = await this.getCustomerContacts(customer.id);
    } catch (e) {
      this.logger.warn(`[customers] Failed to get contacts for ${customer.id}:`, e.message);
    }
    
    return {
      ...details,
      location,
      contacts,
      _enrichedAt: new Date()
    };
  }
  
  async getCustomerContacts(customerId) {
    const tenantId = (await import('../../config/index.js')).default.serviceTitan.tenantId;
    const baseUrl = (await import('../../config/index.js')).default.serviceTitan.apiBaseUrl;
    const { stRequest } = await import('../stClient.js');
    
    const url = `${baseUrl}/crm/v2/tenant/${tenantId}/customers/${customerId}/contacts`;
    
    try {
      const response = await stRequest(url);
      if (response.ok && response.data?.data) {
        return response.data.data;
      }
      return [];
    } catch (e) {
      return [];
    }
  }
  
  async getLocation(locationId) {
    if (this.locationCache.has(locationId)) {
      return this.locationCache.get(locationId);
    }
    
    const location = await fetchDetails('/crm/v2/tenant/{tenant}/locations', locationId);
    if (location) {
      this.locationCache.set(locationId, location);
    }
    return location;
  }
  
  async transformOne(customer) {
    const location = customer.location || {};
    const address = location.address || customer.address || {};
    
    return {
      st_id: BigInt(customer.id),
      tenant_id: BigInt(config.serviceTitan.tenantId),
      
      // Names
      name: customer.name || this.buildName(customer),
      first_name: customer.firstName || null,
      last_name: customer.lastName || null,
      
      // Type
      type: customer.type || 'Residential',
      
      // Contact info
      email: this.extractEmail(customer),
      phone: this.extractPhone(customer),
      
      // Location info
      location_id: location.id ? BigInt(location.id) : null,
      address_line1: address.street || address.streetAddress || null,
      address_line2: address.unit || address.streetAddress2 || null,
      city: address.city || null,
      state: address.state || null,
      zip: address.zip || address.postalCode || null,
      postal_code: address.zip || address.postalCode || null,
      country: address.country || 'USA',
      
      // Status
      active: customer.active !== false,
      do_not_mail: customer.doNotMail || false,
      do_not_service: customer.doNotService || false,
      
      // Balance
      balance: customer.balance || 0,
      
      // Tags
      tag_type_ids: customer.tagTypeIds || [],
      tags: customer.tags || [],
      custom_fields: customer.customFields || {},
      
      // Timestamps
      st_created_on: customer.createdOn ? new Date(customer.createdOn) : new Date(),
      st_modified_on: customer.modifiedOn ? new Date(customer.modifiedOn) : new Date(),
      
      // Raw data
      full_data: customer,
      
      // Sync metadata
      last_synced_at: new Date()
    };
  }
  
  buildName(customer) {
    const parts = [customer.firstName, customer.lastName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : `Customer ${customer.id}`;
  }
  
  extractEmail(customer) {
    // First check contacts array from /customers/{id}/contacts endpoint
    if (customer.contacts?.length > 0) {
      const emailContact = customer.contacts.find(c => c.type === 'Email');
      if (emailContact?.value) return emailContact.value;
    }
    
    // Fallback to direct email field
    if (customer.email) return customer.email;
    
    // Fallback to emails array
    if (customer.emails?.length > 0) {
      return customer.emails[0].address || customer.emails[0].value;
    }
    
    return null;
  }
  
  extractPhone(customer) {
    // First check contacts array from /customers/{id}/contacts endpoint
    if (customer.contacts?.length > 0) {
      // Prefer MobilePhone, then Phone
      const mobileContact = customer.contacts.find(c => c.type === 'MobilePhone');
      if (mobileContact?.value) return this.normalizePhone(mobileContact.value);
      
      const phoneContact = customer.contacts.find(c => c.type === 'Phone');
      if (phoneContact?.value) return this.normalizePhone(phoneContact.value);
      
      // Also check phoneSettings in contact
      const contactWithPhone = customer.contacts.find(c => c.phoneSettings?.phoneNumber);
      if (contactWithPhone?.phoneSettings?.phoneNumber) {
        return this.normalizePhone(contactWithPhone.phoneSettings.phoneNumber);
      }
    }
    
    // Fallback to direct phone field
    if (customer.phone) return this.normalizePhone(customer.phone);
    if (customer.phoneNumber) return this.normalizePhone(customer.phoneNumber);
    
    // Fallback to phoneSettings array
    if (customer.phoneSettings?.length > 0) {
      const primary = customer.phoneSettings.find(p => p.isPrimary);
      if (primary) return this.normalizePhone(primary.phoneNumber || primary.number);
      return this.normalizePhone(customer.phoneSettings[0].phoneNumber || customer.phoneSettings[0].number);
    }
    
    // Fallback to phoneNumbers array
    if (customer.phoneNumbers?.length > 0) {
      return this.normalizePhone(customer.phoneNumbers[0].number);
    }
    
    return null;
  }
  
  normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    
    return phone;
  }
  
  async upsertOne(customer) {
    const client = await getPool().connect();
    try {
      const existing = await client.query(
        'SELECT st_id FROM st_customers WHERE st_id = $1',
        [customer.st_id]
      );
      
      const isNew = existing.rows.length === 0;
      
      if (isNew) {
        await client.query(`
          INSERT INTO st_customers (
            st_id, tenant_id, name, first_name, last_name, type,
            email, phone, location_id,
            address_line1, address_line2, city, state, zip, postal_code, country,
            active, do_not_mail, do_not_service, balance,
            tag_type_ids, tags, custom_fields,
            st_created_on, st_modified_on, full_data, last_synced_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20,
            $21, $22, $23,
            $24, $25, $26, $27
          )
        `, [
          customer.st_id,
          customer.tenant_id,
          customer.name,
          customer.first_name,
          customer.last_name,
          customer.type,
          customer.email,
          customer.phone,
          customer.location_id,
          customer.address_line1,
          customer.address_line2,
          customer.city,
          customer.state,
          customer.zip,
          customer.postal_code,
          customer.country,
          customer.active,
          customer.do_not_mail,
          customer.do_not_service,
          customer.balance,
          customer.tag_type_ids,
          JSON.stringify(customer.tags),
          JSON.stringify(customer.custom_fields),
          customer.st_created_on,
          customer.st_modified_on,
          JSON.stringify(customer.full_data),
          customer.last_synced_at
        ]);
      } else {
        await client.query(`
          UPDATE st_customers SET
            name = $2, first_name = $3, last_name = $4, type = $5,
            email = $6, phone = $7, location_id = $8,
            address_line1 = $9, address_line2 = $10, city = $11, state = $12, zip = $13, postal_code = $14, country = $15,
            active = $16, do_not_mail = $17, do_not_service = $18, balance = $19,
            tag_type_ids = $20, tags = $21, custom_fields = $22,
            st_modified_on = $23, full_data = $24, last_synced_at = $25
          WHERE st_id = $1
        `, [
          customer.st_id,
          customer.name,
          customer.first_name,
          customer.last_name,
          customer.type,
          customer.email,
          customer.phone,
          customer.location_id,
          customer.address_line1,
          customer.address_line2,
          customer.city,
          customer.state,
          customer.zip,
          customer.postal_code,
          customer.country,
          customer.active,
          customer.do_not_mail,
          customer.do_not_service,
          customer.balance,
          customer.tag_type_ids,
          JSON.stringify(customer.tags),
          JSON.stringify(customer.custom_fields),
          customer.st_modified_on,
          JSON.stringify(customer.full_data),
          customer.last_synced_at
        ]);
      }
      
      return { created: isNew };
    } finally {
      client.release();
    }
  }
  
  async postProcess() {
    this.logger.info('[customers] Calculating aggregates...');
    
    const client = await getPool().connect();
    try {
      // Update aggregates - non-fatal if it fails
      try {
        await client.query(`
          UPDATE st_customers c
          SET 
            total_jobs = COALESCE(stats.job_count, 0),
            completed_jobs = COALESCE(stats.completed_count, 0),
            lifetime_value = COALESCE(stats.total_value, 0),
            last_job_date = stats.last_job,
            aggregates_updated_at = NOW()
          FROM (
            SELECT 
              j.customer_id,
              COUNT(DISTINCT j.st_id) as job_count,
              COUNT(DISTINCT CASE WHEN j.job_status = 'Completed' THEN j.st_id END) as completed_count,
              COALESCE(SUM(i.total), 0) as total_value,
              MAX(j.st_created_on) as last_job
            FROM st_jobs j
            LEFT JOIN st_invoices i ON i.job_id = j.st_id AND i.status = 'Paid'
            GROUP BY j.customer_id
          ) stats
          WHERE c.st_id = stats.customer_id
        `);
        this.logger.info('[customers] Aggregates updated');
      } catch (aggError) {
        this.logger.warn('[customers] Failed to update aggregates (non-fatal):', aggError.message);
      }
      
      // Sync locations from cache - non-fatal if it fails
      try {
        await this.syncLocations();
      } catch (locError) {
        this.logger.warn('[customers] Failed to sync locations (non-fatal):', locError.message);
      }
    } finally {
      client.release();
    }
  }
  
  async syncLocations() {
    this.logger.info(`[customers] Syncing ${this.locationCache.size} locations...`);
    
    const client = await getPool().connect();
    try {
      for (const [locationId, location] of this.locationCache) {
        try {
          const address = location.address || {};
          
          await client.query(`
            INSERT INTO st_locations (st_id, tenant_id, customer_id, name, street, unit, city, state, zip, country, latitude, longitude, full_data, local_synced_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (st_id) DO UPDATE SET
              customer_id = $3, name = $4, street = $5, unit = $6, city = $7, state = $8, zip = $9, country = $10, latitude = $11, longitude = $12, full_data = $13, local_synced_at = NOW()
          `, [
            locationId,
            config.serviceTitan.tenantId,
            location.customerId || null,
            location.name || 'Primary',
            address.street || address.streetAddress,
            address.unit,
            address.city,
            address.state,
            address.zip || address.postalCode,
            address.country || 'USA',
            address.latitude,
            address.longitude,
            JSON.stringify(location)
          ]);
        } catch (error) {
          this.logger.error(`Failed to upsert location ${locationId}:`, error.message);
        }
      }
    } finally {
      client.release();
    }
  }
}

export const customerSync = new CustomerSync();

export async function syncCustomers() {
  return customerSync.run();
}

export default { CustomerSync, syncCustomers };
