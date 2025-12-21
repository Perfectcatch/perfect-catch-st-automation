/**
 * Customer Sync Service
 * 
 * Handles synchronization between ServiceTitan customers and Salesforce Contacts/Accounts.
 * 
 * Field Mapping based on ServiceTitan database schema:
 * - st_id → ServiceTitan_Customer_Id__c (External ID)
 * - Standard fields map to Salesforce standard fields
 * - Analytics fields sync to custom fields for sales visibility
 */

import { SalesforceService, getSalesforceService } from './salesforce.service';
import { 
  ServiceTitanCustomer, 
  SalesforceContact, 
  SalesforceAccount,
  CustomerSyncResult,
  SyncDirection,
} from '../models/customer.types';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import { Queue } from 'bullmq';

// Queue for async sync operations
const syncQueue = new Queue('customer-sync', {
  connection: { host: process.env.REDIS_HOST || 'localhost', port: parseInt(process.env.REDIS_PORT || '6379') }
});

export class CustomerSyncService {
  private sf: SalesforceService;
  
  // External ID fields - MUST match what you created in Salesforce
  private readonly CONTACT_EXTERNAL_ID = 'ServiceTitan_Customer_Id__c';
  private readonly ACCOUNT_EXTERNAL_ID = 'ServiceTitan_Account_Id__c';

  constructor() {
    this.sf = getSalesforceService();
  }

  // ============================================================
  // Single Customer Sync
  // ============================================================

  /**
   * Sync a single customer to Salesforce
   * Creates/updates both Account and Contact records
   */
  async syncCustomerToSalesforce(customer: ServiceTitanCustomer): Promise<CustomerSyncResult> {
    const startTime = Date.now();
    
    try {
      // Step 1: Upsert Account
      const accountData = this.mapCustomerToAccount(customer);
      const accountResult = await this.sf.upsert(
        'Account',
        this.ACCOUNT_EXTERNAL_ID,
        `st_${customer.st_id}`,
        accountData
      );
      
      logger.debug('Account upserted', { 
        stId: customer.st_id, 
        accountId: accountResult.id,
        created: accountResult.created 
      });

      // Step 2: Upsert Contact linked to Account
      const contactData = this.mapCustomerToContact(customer, accountResult.id);
      const contactResult = await this.sf.upsert(
        'Contact',
        this.CONTACT_EXTERNAL_ID,
        `st_${customer.st_id}`,
        contactData
      );

      // Step 3: Record sync timestamp
      await this.recordSyncTimestamp(customer.st_id, 'outbound');

      const duration = Date.now() - startTime;
      logger.info('Customer synced to Salesforce', {
        stId: customer.st_id,
        contactId: contactResult.id,
        accountId: accountResult.id,
        created: contactResult.created,
        duration,
      });

      return {
        success: true,
        stId: customer.st_id,
        salesforceContactId: contactResult.id,
        salesforceAccountId: accountResult.id,
        created: contactResult.created,
        direction: 'outbound',
        duration,
      };
    } catch (error: any) {
      logger.error('Failed to sync customer to Salesforce', {
        stId: customer.st_id,
        error: error.message,
        errorCode: error.errorCode,
      });

      return {
        success: false,
        stId: customer.st_id,
        direction: 'outbound',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  // ============================================================
  // Data Mapping - ServiceTitan → Salesforce
  // ============================================================

  /**
   * Map ServiceTitan customer to Salesforce Account
   */
  private mapCustomerToAccount(customer: ServiceTitanCustomer): Partial<SalesforceAccount> {
    return {
      // Standard Fields
      Name: customer.name || `${customer.first_name} ${customer.last_name}`.trim(),
      Type: this.mapCustomerType(customer.type),
      Phone: customer.phone || undefined,
      
      // Billing Address
      BillingStreet: this.formatStreetAddress(customer.address_line1, customer.address_line2),
      BillingCity: customer.city || undefined,
      BillingState: customer.state || undefined,
      BillingPostalCode: customer.zip || customer.postal_code || undefined,
      BillingCountry: customer.country || 'USA',
      
      // Custom Fields
      Account_Balance__c: customer.balance || 0,
      Lifetime_Value__c: customer.lifetime_value || 0,
      Customer_Segment__c: this.calculateSegment(customer),
    };
  }

  /**
   * Map ServiceTitan customer to Salesforce Contact
   */
  private mapCustomerToContact(
    customer: ServiceTitanCustomer,
    accountId?: string
  ): Partial<SalesforceContact> {
    return {
      // Relationship
      AccountId: accountId || undefined,
      
      // Standard Fields
      FirstName: customer.first_name || undefined,
      LastName: customer.last_name || customer.name || 'Unknown',
      Email: customer.email || undefined,
      Phone: customer.phone || undefined,
      
      // Mailing Address
      MailingStreet: this.formatStreetAddress(customer.address_line1, customer.address_line2),
      MailingCity: customer.city || undefined,
      MailingState: customer.state || undefined,
      MailingPostalCode: customer.zip || customer.postal_code || undefined,
      MailingCountry: customer.country || 'USA',
      
      // Standard Email Opt-Out (maps to do_not_mail)
      HasOptedOutOfEmail: customer.do_not_mail || false,
      
      // Custom Fields - Identity
      ServiceTitan_Customer_Id__c: `st_${customer.st_id}`,
      ServiceTitan_Tenant_Id__c: customer.tenant_id || undefined,
      
      // Custom Fields - Status
      Active__c: customer.active !== false,
      Do_Not_Service__c: customer.do_not_service || false,
      
      // Custom Fields - Analytics
      Total_Jobs__c: customer.total_jobs || 0,
      Completed_Jobs__c: customer.completed_jobs || 0,
      First_Service_Date__c: this.formatDate(customer.first_job_date),
      Last_Service_Date__c: this.formatDate(customer.last_job_date),
      
      // Custom Fields - Sync Metadata
      ServiceTitan_Last_Modified__c: this.formatDateTime(customer.st_modified_on),
      Last_Sync_DateTime__c: new Date().toISOString(),
    };
  }

  // ============================================================
  // Batch Sync Operations
  // ============================================================

  /**
   * Batch sync multiple customers to Salesforce
   */
  async batchSyncCustomersToSalesforce(
    customers: ServiceTitanCustomer[]
  ): Promise<{ results: CustomerSyncResult[]; summary: BatchSyncSummary }> {
    const startTime = Date.now();
    const results: CustomerSyncResult[] = [];

    // Bulk upsert Accounts
    const accountRecords = customers.map((c) => ({
      ...this.mapCustomerToAccount(c),
      [this.ACCOUNT_EXTERNAL_ID]: `st_${c.st_id}`,
    }));

    const accountResults = await this.sf.bulkUpsert(
      'Account', 
      this.ACCOUNT_EXTERNAL_ID, 
      accountRecords
    );

    // Build Account ID map
    const accountIdMap = new Map<string, string>();
    customers.forEach((customer, index) => {
      if (accountResults[index]?.success) {
        accountIdMap.set(`st_${customer.st_id}`, accountResults[index].id);
      }
    });

    // Bulk upsert Contacts
    const contactRecords = customers.map((c) => ({
      ...this.mapCustomerToContact(c, accountIdMap.get(`st_${c.st_id}`)),
      [this.CONTACT_EXTERNAL_ID]: `st_${c.st_id}`,
    }));

    const contactResults = await this.sf.bulkUpsert(
      'Contact',
      this.CONTACT_EXTERNAL_ID,
      contactRecords
    );

    // Map results
    customers.forEach((customer, index) => {
      const contactResult = contactResults[index];
      const accountResult = accountResults[index];
      
      results.push({
        success: contactResult?.success || false,
        stId: customer.st_id,
        salesforceContactId: contactResult?.success ? contactResult.id : undefined,
        salesforceAccountId: accountResult?.success ? accountResult.id : undefined,
        direction: 'outbound',
        error: contactResult?.errors?.length > 0 ? contactResult.errors.join(', ') : undefined,
      });

      if (contactResult?.success) {
        this.recordSyncTimestamp(customer.st_id, 'outbound');
      }
    });

    const summary: BatchSyncSummary = {
      total: customers.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      duration: Date.now() - startTime,
    };

    logger.info('Batch customer sync completed', summary);
    return { results, summary };
  }

  /**
   * Full sync - sync all customers modified since last sync
   */
  async fullSync(since?: Date): Promise<BatchSyncSummary> {
    const lastSyncTime = since || (await this.getLastFullSyncTime());
    logger.info('Starting full customer sync', { since: lastSyncTime });

    const modifiedCustomers = await this.getModifiedCustomers(lastSyncTime);
    
    if (modifiedCustomers.length === 0) {
      logger.info('No customers to sync');
      return { total: 0, successful: 0, failed: 0, duration: 0 };
    }

    const batchSize = 200;
    let totalSuccessful = 0;
    let totalFailed = 0;
    const startTime = Date.now();

    for (let i = 0; i < modifiedCustomers.length; i += batchSize) {
      const batch = modifiedCustomers.slice(i, i + batchSize);
      const { summary } = await this.batchSyncCustomersToSalesforce(batch);
      totalSuccessful += summary.successful;
      totalFailed += summary.failed;
    }

    await redis.set('salesforce:lastFullSync', new Date().toISOString());

    return {
      total: modifiedCustomers.length,
      successful: totalSuccessful,
      failed: totalFailed,
      duration: Date.now() - startTime,
    };
  }

  // ============================================================
  // Queue-based Async Sync
  // ============================================================

  async queueCustomerSync(stId: number, priority: 'high' | 'normal' = 'normal'): Promise<void> {
    await syncQueue.add('sync-customer', { stId }, {
      priority: priority === 'high' ? 1 : 10,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
    logger.debug('Customer sync queued', { stId, priority });
  }

  async queueBatchSync(stIds: number[]): Promise<void> {
    const jobs = stIds.map((stId) => ({
      name: 'sync-customer',
      data: { stId },
      opts: { attempts: 3 },
    }));
    await syncQueue.addBulk(jobs);
    logger.info('Batch sync queued', { count: stIds.length });
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  private mapCustomerType(type?: string): string {
    if (!type) return 'Residential';
    const normalized = type.toLowerCase();
    if (normalized.includes('commercial') || normalized.includes('business')) {
      return 'Commercial';
    }
    return 'Residential';
  }

  private calculateSegment(customer: ServiceTitanCustomer): string {
    const ltv = customer.lifetime_value || 0;
    const lastJobDate = customer.last_job_date ? new Date(customer.last_job_date) : null;
    const daysSinceLastJob = lastJobDate 
      ? Math.floor((Date.now() - lastJobDate.getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (ltv >= 10000 && daysSinceLastJob < 180) return 'VIP';
    if (ltv >= 5000) return 'High Value';
    if (daysSinceLastJob > 365) return 'Churning';
    if (daysSinceLastJob > 180) return 'At Risk';
    return 'Standard';
  }

  private formatStreetAddress(line1?: string, line2?: string): string | undefined {
    if (!line1 && !line2) return undefined;
    if (!line2) return line1;
    if (!line1) return line2;
    return `${line1}\n${line2}`;
  }

  private formatDate(date?: string | Date): string | undefined {
    if (!date) return undefined;
    const d = new Date(date);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString().split('T')[0];
  }

  private formatDateTime(date?: string | Date): string | undefined {
    if (!date) return undefined;
    const d = new Date(date);
    if (isNaN(d.getTime())) return undefined;
    return d.toISOString();
  }

  private async recordSyncTimestamp(stId: number, direction: SyncDirection): Promise<void> {
    const key = `salesforce:sync:customer:${stId}`;
    await redis.hset(key, {
      [`last_${direction}_sync`]: new Date().toISOString(),
      direction,
    });
    await redis.expire(key, 86400 * 90);
  }

  private async getLastFullSyncTime(): Promise<Date> {
    const lastSync = await redis.get('salesforce:lastFullSync');
    return lastSync ? new Date(lastSync) : new Date(0);
  }

  /**
   * Get customers modified since a given date
   * TODO: Implement with your database query
   */
  private async getModifiedCustomers(since: Date): Promise<ServiceTitanCustomer[]> {
    logger.warn('getModifiedCustomers not implemented');
    return [];
  }
}

interface BatchSyncSummary {
  total: number;
  successful: number;
  failed: number;
  duration: number;
}

let customerSyncInstance: CustomerSyncService | null = null;

export function getCustomerSyncService(): CustomerSyncService {
  if (!customerSyncInstance) {
    customerSyncInstance = new CustomerSyncService();
  }
  return customerSyncInstance;
}
