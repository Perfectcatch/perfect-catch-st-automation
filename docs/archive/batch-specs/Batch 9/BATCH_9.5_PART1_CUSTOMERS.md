# BATCH 9.5: COMPLETE DATA SYNC OVERHAUL

## Overview

This batch completely rewrites the ServiceTitan sync engine to properly enrich all entities with full data.

**Problem:** Current sync only captures IDs, not actual data
**Solution:** Enrichment pipeline that makes detail API calls

---

## PART 1: CORE INFRASTRUCTURE

### File 1: ServiceTitan API Client (Enhanced)

**File:** `src/lib/servicetitan-client.js`

```javascript
import axios from 'axios';
import { logger } from './logger.js';

class ServiceTitanClient {
  constructor() {
    this.baseUrl = 'https://api.servicetitan.io';
    this.tenantId = process.env.SERVICE_TITAN_TENANT_ID;
    this.accessToken = null;
    this.tokenExpiry = null;
    
    // Rate limiting
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.requestsPerSecond = 5; // ST allows ~10/sec, we'll be conservative
  }
  
  async getAccessToken() {
    // Check if current token is valid
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    logger.info('Refreshing ServiceTitan access token...');
    
    const response = await axios.post(
      'https://auth.servicetitan.io/connect/token',
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: process.env.SERVICE_TITAN_CLIENT_ID,
        client_secret: process.env.SERVICE_TITAN_CLIENT_SECRET
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
    
    logger.info('Access token refreshed successfully');
    return this.accessToken;
  }
  
  async request(method, endpoint, options = {}) {
    const token = await this.getAccessToken();
    
    // Replace {tenant} placeholder
    const url = `${this.baseUrl}${endpoint}`.replace('{tenant}', this.tenantId);
    
    try {
      const response = await axios({
        method,
        url,
        headers: {
          'Authorization': `Bearer ${token}`,
          'ST-App-Key': process.env.SERVICE_TITAN_APP_KEY,
          'Content-Type': 'application/json',
          ...options.headers
        },
        params: options.params,
        data: options.data,
        timeout: 30000
      });
      
      return response.data;
      
    } catch (error) {
      if (error.response) {
        logger.error('ServiceTitan API error', {
          status: error.response.status,
          endpoint,
          error: error.response.data
        });
        
        // Handle rate limiting
        if (error.response.status === 429) {
          logger.warn('Rate limited, waiting 2 seconds...');
          await this.sleep(2000);
          return this.request(method, endpoint, options); // Retry
        }
      }
      throw error;
    }
  }
  
  async get(endpoint, options = {}) {
    return this.request('GET', endpoint, options);
  }
  
  async post(endpoint, data, options = {}) {
    return this.request('POST', endpoint, { ...options, data });
  }
  
  async put(endpoint, data, options = {}) {
    return this.request('PUT', endpoint, { ...options, data });
  }
  
  /**
   * Fetch all pages of a paginated endpoint
   */
  async fetchAllPages(endpoint, params = {}) {
    const allData = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await this.get(endpoint, {
        params: {
          ...params,
          page,
          pageSize: 100
        }
      });
      
      // Handle different response formats
      const data = response.data || response;
      if (Array.isArray(data)) {
        allData.push(...data);
      } else if (data.data) {
        allData.push(...data.data);
      }
      
      hasMore = response.hasMore || (data.length === 100);
      page++;
      
      // Rate limiting between pages
      await this.sleep(100);
      
      logger.debug(`Fetched page ${page - 1}, total records: ${allData.length}`);
    }
    
    return allData;
  }
  
  /**
   * Fetch details for multiple entities in parallel with rate limiting
   */
  async fetchDetailsBatch(endpoint, ids, batchSize = 10) {
    const results = [];
    
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      
      const promises = batch.map(async (id) => {
        try {
          const detail = await this.get(`${endpoint}/${id}`);
          return { id, data: detail, success: true };
        } catch (error) {
          logger.warn(`Failed to fetch detail for ${id}`, { error: error.message });
          return { id, error: error.message, success: false };
        }
      });
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // Rate limiting between batches
      await this.sleep(200);
      
      // Progress logging
      if ((i + batchSize) % 100 === 0 || i + batchSize >= ids.length) {
        logger.info(`Fetched details: ${Math.min(i + batchSize, ids.length)}/${ids.length}`);
      }
    }
    
    return results;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const stClient = new ServiceTitanClient();
```

---

### File 2: Sync Base Class

**File:** `src/services/sync/sync-base.js`

```javascript
import { PrismaClient } from '@prisma/client';
import { stClient } from '../../lib/servicetitan-client.js';
import { logger } from '../../lib/logger.js';

const prisma = new PrismaClient();

export class SyncBase {
  constructor(entityName) {
    this.entityName = entityName;
    this.stats = {
      fetched: 0,
      enriched: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0
    };
    this.startTime = null;
  }
  
  async run() {
    this.startTime = Date.now();
    logger.info(`Starting ${this.entityName} sync...`);
    
    try {
      // Step 1: Fetch list
      logger.info(`[${this.entityName}] Step 1: Fetching list...`);
      const list = await this.fetchList();
      this.stats.fetched = list.length;
      logger.info(`[${this.entityName}] Fetched ${list.length} records`);
      
      if (list.length === 0) {
        logger.warn(`[${this.entityName}] No records to sync`);
        await this.logSyncResult('completed');
        return this.stats;
      }
      
      // Step 2: Enrich with details
      logger.info(`[${this.entityName}] Step 2: Enriching with details...`);
      const enriched = await this.enrichAll(list);
      this.stats.enriched = enriched.filter(r => r.enriched).length;
      logger.info(`[${this.entityName}] Enriched ${this.stats.enriched} records`);
      
      // Step 3: Transform data
      logger.info(`[${this.entityName}] Step 3: Transforming data...`);
      const transformed = await this.transformAll(enriched);
      
      // Step 4: Upsert to database
      logger.info(`[${this.entityName}] Step 4: Upserting to database...`);
      await this.upsertAll(transformed);
      
      // Step 5: Post-sync processing
      logger.info(`[${this.entityName}] Step 5: Post-processing...`);
      await this.postProcess();
      
      const duration = Date.now() - this.startTime;
      logger.info(`[${this.entityName}] Sync completed in ${duration}ms`, { stats: this.stats });
      
      await this.logSyncResult('completed');
      return this.stats;
      
    } catch (error) {
      logger.error(`[${this.entityName}] Sync failed`, { error: error.message });
      await this.logSyncResult('failed', error.message);
      throw error;
    }
  }
  
  // Override in subclasses
  async fetchList() {
    throw new Error('fetchList() must be implemented');
  }
  
  async enrichOne(item) {
    throw new Error('enrichOne() must be implemented');
  }
  
  async transformOne(item) {
    throw new Error('transformOne() must be implemented');
  }
  
  async upsertOne(item) {
    throw new Error('upsertOne() must be implemented');
  }
  
  async postProcess() {
    // Optional override
  }
  
  async enrichAll(list) {
    const results = [];
    const batchSize = 10;
    
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      
      const promises = batch.map(async (item) => {
        try {
          const enriched = await this.enrichOne(item);
          return { ...enriched, enriched: true };
        } catch (error) {
          logger.warn(`[${this.entityName}] Failed to enrich ${item.id}`, { error: error.message });
          return { ...item, enriched: false, enrichError: error.message };
        }
      });
      
      const batchResults = await Promise.all(promises);
      results.push(...batchResults);
      
      // Progress
      if ((i + batchSize) % 50 === 0) {
        logger.info(`[${this.entityName}] Enriched ${i + batchSize}/${list.length}`);
      }
      
      await this.sleep(100);
    }
    
    return results;
  }
  
  async transformAll(list) {
    return Promise.all(list.map(item => this.transformOne(item)));
  }
  
  async upsertAll(list) {
    for (const item of list) {
      try {
        const result = await this.upsertOne(item);
        if (result.created) this.stats.created++;
        else this.stats.updated++;
      } catch (error) {
        logger.error(`[${this.entityName}] Failed to upsert ${item.st_id}`, { error: error.message });
        this.stats.failed++;
      }
    }
  }
  
  async logSyncResult(status, errorMessage = null) {
    const duration = Date.now() - this.startTime;
    
    await prisma.st_sync_log.create({
      data: {
        module: this.entityName,
        sync_type: 'full',
        status,
        records_fetched: this.stats.fetched,
        records_created: this.stats.created,
        records_updated: this.stats.updated,
        records_failed: this.stats.failed,
        duration_ms: duration,
        error_message: errorMessage,
        started_at: new Date(this.startTime),
        completed_at: new Date()
      }
    });
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { prisma, stClient, logger };
```

---

### File 3: Complete Customer Sync

**File:** `src/services/sync/sync-customers.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class CustomerSync extends SyncBase {
  constructor() {
    super('customers');
    this.locationCache = new Map();
  }
  
  async fetchList() {
    return stClient.fetchAllPages('/crm/v2/tenant/{tenant}/customers', {
      active: 'True'
    });
  }
  
  async enrichOne(customer) {
    // Get full customer details
    const details = await stClient.get(`/crm/v2/tenant/{tenant}/customers/${customer.id}`);
    
    // Get location details if we have locationId
    let location = null;
    const locationId = details.locationId || details.locations?.[0]?.id;
    
    if (locationId) {
      location = await this.getLocation(locationId);
    }
    
    // Get contacts
    let contacts = [];
    try {
      const contactsResponse = await stClient.get(`/crm/v2/tenant/{tenant}/customers/${customer.id}/contacts`);
      contacts = contactsResponse.data || contactsResponse || [];
    } catch (e) {
      // Contacts endpoint may not exist for all customers
    }
    
    return {
      ...details,
      location,
      contacts,
      _enrichedAt: new Date()
    };
  }
  
  async getLocation(locationId) {
    // Check cache
    if (this.locationCache.has(locationId)) {
      return this.locationCache.get(locationId);
    }
    
    try {
      const location = await stClient.get(`/crm/v2/tenant/{tenant}/locations/${locationId}`);
      this.locationCache.set(locationId, location);
      return location;
    } catch (error) {
      logger.warn(`Failed to fetch location ${locationId}`, { error: error.message });
      return null;
    }
  }
  
  async transformOne(customer) {
    const location = customer.location || {};
    const address = location.address || {};
    
    return {
      st_id: BigInt(customer.id),
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
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
      postal_code: address.zip || address.postalCode || null,
      country: address.country || 'USA',
      
      // Status
      active: customer.active !== false,
      do_not_mail: customer.doNotMail || false,
      do_not_service: customer.doNotService || false,
      
      // Timestamps from ST
      st_created_on: customer.createdOn ? new Date(customer.createdOn) : new Date(),
      st_modified_on: customer.modifiedOn ? new Date(customer.modifiedOn) : new Date(),
      
      // Raw data for reference
      full_data: customer,
      
      // Sync metadata
      last_synced_at: new Date()
    };
  }
  
  buildName(customer) {
    const parts = [
      customer.firstName,
      customer.lastName
    ].filter(Boolean);
    
    return parts.length > 0 ? parts.join(' ') : `Customer ${customer.id}`;
  }
  
  extractEmail(customer) {
    // Direct email field
    if (customer.email) return customer.email;
    
    // Check contacts
    if (customer.contacts && customer.contacts.length > 0) {
      const emailContact = customer.contacts.find(c => 
        c.type === 'Email' || c.type?.toLowerCase() === 'email'
      );
      if (emailContact) return emailContact.value;
    }
    
    // Check within customer object
    if (customer.emails && customer.emails.length > 0) {
      return customer.emails[0].address || customer.emails[0].value;
    }
    
    return null;
  }
  
  extractPhone(customer) {
    // Direct phone field
    if (customer.phone) return this.normalizePhone(customer.phone);
    if (customer.phoneNumber) return this.normalizePhone(customer.phoneNumber);
    
    // Phone settings (ServiceTitan format)
    if (customer.phoneSettings && customer.phoneSettings.length > 0) {
      const primary = customer.phoneSettings.find(p => p.isPrimary);
      if (primary) return this.normalizePhone(primary.phoneNumber || primary.number);
      return this.normalizePhone(customer.phoneSettings[0].phoneNumber || customer.phoneSettings[0].number);
    }
    
    // Check contacts
    if (customer.contacts && customer.contacts.length > 0) {
      const phoneContact = customer.contacts.find(c => 
        c.type === 'Phone' || c.type === 'MobilePhone' || c.type?.toLowerCase().includes('phone')
      );
      if (phoneContact) return this.normalizePhone(phoneContact.value);
    }
    
    return null;
  }
  
  normalizePhone(phone) {
    if (!phone) return null;
    
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX for US numbers
    if (digits.length === 10) {
      return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
    }
    
    return phone; // Return original if can't normalize
  }
  
  async upsertOne(customer) {
    const existing = await prisma.st_customers.findUnique({
      where: { st_id: customer.st_id }
    });
    
    await prisma.st_customers.upsert({
      where: { st_id: customer.st_id },
      create: customer,
      update: customer
    });
    
    return { created: !existing };
  }
  
  async postProcess() {
    // Calculate aggregates for all customers
    logger.info('[customers] Calculating aggregates...');
    
    await prisma.$executeRaw`
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
    `;
    
    // Also sync location table
    await this.syncLocations();
  }
  
  async syncLocations() {
    logger.info('[customers] Syncing locations from cache...');
    
    for (const [locationId, location] of this.locationCache) {
      try {
        const address = location.address || {};
        
        await prisma.st_locations.upsert({
          where: { st_id: BigInt(locationId) },
          create: {
            st_id: BigInt(locationId),
            customer_id: location.customerId ? BigInt(location.customerId) : null,
            name: location.name || 'Primary',
            address_line1: address.street || address.streetAddress,
            address_line2: address.unit,
            city: address.city,
            state: address.state,
            postal_code: address.zip || address.postalCode,
            country: address.country || 'USA',
            latitude: address.latitude,
            longitude: address.longitude,
            full_data: location,
            last_synced_at: new Date()
          },
          update: {
            customer_id: location.customerId ? BigInt(location.customerId) : null,
            name: location.name || 'Primary',
            address_line1: address.street || address.streetAddress,
            address_line2: address.unit,
            city: address.city,
            state: address.state,
            postal_code: address.zip || address.postalCode,
            country: address.country || 'USA',
            latitude: address.latitude,
            longitude: address.longitude,
            full_data: location,
            last_synced_at: new Date()
          }
        });
      } catch (error) {
        logger.error(`Failed to upsert location ${locationId}`, { error: error.message });
      }
    }
    
    logger.info(`[customers] Synced ${this.locationCache.size} locations`);
  }
}

// Export singleton and run function
export const customerSync = new CustomerSync();

export async function syncCustomers() {
  return customerSync.run();
}
```

---

## PART 2: JOBS SYNC (Next File)

This continues with jobs, estimates, invoices, appointments, technicians...

**Continue to Part 2?**
