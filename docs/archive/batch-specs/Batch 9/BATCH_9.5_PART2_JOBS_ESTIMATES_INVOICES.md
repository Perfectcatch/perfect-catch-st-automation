# BATCH 9.5 - PART 2: JOBS, ESTIMATES, INVOICES SYNC

## File 4: Complete Jobs Sync

**File:** `src/services/sync/sync-jobs.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class JobSync extends SyncBase {
  constructor() {
    super('jobs');
  }
  
  async fetchList() {
    // Fetch jobs from last 2 years (or all if initial sync)
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    
    return stClient.fetchAllPages('/jpm/v2/tenant/{tenant}/jobs', {
      createdOnOrAfter: twoYearsAgo.toISOString()
    });
  }
  
  async enrichOne(job) {
    // Get full job details
    const details = await stClient.get(`/jpm/v2/tenant/{tenant}/jobs/${job.id}`);
    
    // Get job history/notes
    let history = [];
    try {
      const historyResponse = await stClient.get(`/jpm/v2/tenant/{tenant}/jobs/${job.id}/history`);
      history = historyResponse.data || historyResponse || [];
    } catch (e) {
      // History endpoint may not be available
    }
    
    // Get job appointments
    let appointments = [];
    try {
      const apptResponse = await stClient.get(`/dispatch/v2/tenant/{tenant}/appointments`, {
        params: { jobId: job.id }
      });
      appointments = apptResponse.data || apptResponse || [];
    } catch (e) {
      // May fail if no appointments
    }
    
    return {
      ...details,
      history,
      appointments,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(job) {
    return {
      st_id: BigInt(job.id),
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
      // References
      customer_id: job.customerId ? BigInt(job.customerId) : null,
      location_id: job.locationId ? BigInt(job.locationId) : null,
      business_unit_id: job.businessUnitId ? BigInt(job.businessUnitId) : null,
      job_type_id: job.jobTypeId ? BigInt(job.jobTypeId) : null,
      campaign_id: job.campaignId ? BigInt(job.campaignId) : null,
      
      // Job info
      job_number: job.jobNumber || job.number || `J${job.id}`,
      summary: job.summary || job.name || null,
      job_status: job.jobStatus || job.status || 'Unknown',
      
      // Technician
      technician_id: job.technicianId ? BigInt(job.technicianId) : null,
      technician_name: job.technicianName || null,
      
      // Priority
      priority: job.priority || 'Normal',
      
      // Tags and custom fields
      tags: job.tagTypeIds || [],
      custom_fields: job.customFields || {},
      
      // Timestamps
      scheduled_start: job.scheduledStart ? new Date(job.scheduledStart) : null,
      scheduled_end: job.scheduledEnd ? new Date(job.scheduledEnd) : null,
      completed_on: job.completedOn ? new Date(job.completedOn) : null,
      
      // ServiceTitan timestamps
      st_created_on: job.createdOn ? new Date(job.createdOn) : new Date(),
      st_modified_on: job.modifiedOn ? new Date(job.modifiedOn) : new Date(),
      
      // Store full data
      full_data: job,
      
      // Sync metadata
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(job) {
    const existing = await prisma.st_jobs.findUnique({
      where: { st_id: job.st_id }
    });
    
    await prisma.st_jobs.upsert({
      where: { st_id: job.st_id },
      create: job,
      update: job
    });
    
    return { created: !existing };
  }
  
  async postProcess() {
    // Update job counts on business units
    logger.info('[jobs] Updating business unit statistics...');
    
    await prisma.$executeRaw`
      UPDATE st_business_units bu
      SET 
        total_jobs = COALESCE(stats.job_count, 0),
        active_jobs = COALESCE(stats.active_count, 0)
      FROM (
        SELECT 
          business_unit_id,
          COUNT(*) as job_count,
          COUNT(CASE WHEN job_status IN ('Scheduled', 'InProgress', 'Dispatched') THEN 1 END) as active_count
        FROM st_jobs
        WHERE business_unit_id IS NOT NULL
        GROUP BY business_unit_id
      ) stats
      WHERE bu.st_id = stats.business_unit_id
    `;
  }
}

export const jobSync = new JobSync();

export async function syncJobs() {
  return jobSync.run();
}
```

---

## File 5: Complete Estimates Sync

**File:** `src/services/sync/sync-estimates.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class EstimateSync extends SyncBase {
  constructor() {
    super('estimates');
  }
  
  async fetchList() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    return stClient.fetchAllPages('/sales/v2/tenant/{tenant}/estimates', {
      createdOnOrAfter: oneYearAgo.toISOString()
    });
  }
  
  async enrichOne(estimate) {
    // Get full estimate details including line items
    const details = await stClient.get(`/sales/v2/tenant/{tenant}/estimates/${estimate.id}`);
    
    // Get estimate items/line items
    let items = [];
    try {
      const itemsResponse = await stClient.get(`/sales/v2/tenant/{tenant}/estimates/${estimate.id}/items`);
      items = itemsResponse.data || itemsResponse || [];
    } catch (e) {
      // Items might be included in main response
      items = details.items || details.lineItems || [];
    }
    
    return {
      ...details,
      items,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(estimate) {
    // Calculate totals from items if not provided
    const items = estimate.items || [];
    const subtotal = estimate.subtotal || items.reduce((sum, item) => sum + (item.total || item.price || 0), 0);
    const total = estimate.total || subtotal;
    
    return {
      st_id: BigInt(estimate.id),
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
      // References
      customer_id: estimate.customerId ? BigInt(estimate.customerId) : null,
      job_id: estimate.jobId ? BigInt(estimate.jobId) : null,
      location_id: estimate.locationId ? BigInt(estimate.locationId) : null,
      business_unit_id: estimate.businessUnitId ? BigInt(estimate.businessUnitId) : null,
      
      // Estimate info
      estimate_number: estimate.number || estimate.estimateNumber || `E${estimate.id}`,
      name: estimate.name || estimate.summary || 'Estimate',
      status: estimate.status || 'Open',
      
      // Pricing
      subtotal: subtotal,
      tax: estimate.tax || 0,
      total: total,
      
      // Items stored as JSON
      items: JSON.stringify(items),
      item_count: items.length,
      
      // Sold info
      sold_on: estimate.soldOn ? new Date(estimate.soldOn) : null,
      sold_by_id: estimate.soldById ? BigInt(estimate.soldById) : null,
      
      // Timestamps
      st_created_on: estimate.createdOn ? new Date(estimate.createdOn) : new Date(),
      st_modified_on: estimate.modifiedOn ? new Date(estimate.modifiedOn) : new Date(),
      
      // Raw data
      full_data: estimate,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(estimate) {
    const existing = await prisma.st_estimates.findUnique({
      where: { st_id: estimate.st_id }
    });
    
    await prisma.st_estimates.upsert({
      where: { st_id: estimate.st_id },
      create: estimate,
      update: estimate
    });
    
    return { created: !existing };
  }
  
  async postProcess() {
    // Calculate conversion metrics
    logger.info('[estimates] Calculating conversion metrics...');
    
    const metrics = await prisma.$queryRaw`
      SELECT 
        COUNT(*) as total_estimates,
        COUNT(CASE WHEN status = 'Sold' THEN 1 END) as sold_estimates,
        COUNT(CASE WHEN status = 'Open' THEN 1 END) as open_estimates,
        SUM(CASE WHEN status = 'Sold' THEN total ELSE 0 END) as sold_value,
        AVG(CASE WHEN status = 'Sold' THEN total END) as avg_sold_value
      FROM st_estimates
      WHERE st_created_on >= NOW() - INTERVAL '90 days'
    `;
    
    logger.info('[estimates] Conversion metrics:', metrics[0]);
  }
}

export const estimateSync = new EstimateSync();

export async function syncEstimates() {
  return estimateSync.run();
}
```

---

## File 6: Complete Invoices Sync

**File:** `src/services/sync/sync-invoices.js`

```javascript
import { SyncBase, prisma, stClient, logger } from './sync-base.js';

export class InvoiceSync extends SyncBase {
  constructor() {
    super('invoices');
  }
  
  async fetchList() {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    return stClient.fetchAllPages('/accounting/v2/tenant/{tenant}/invoices', {
      createdOnOrAfter: oneYearAgo.toISOString()
    });
  }
  
  async enrichOne(invoice) {
    // Get full invoice details
    const details = await stClient.get(`/accounting/v2/tenant/{tenant}/invoices/${invoice.id}`);
    
    // Get invoice items
    let items = [];
    try {
      const itemsResponse = await stClient.get(`/accounting/v2/tenant/{tenant}/invoices/${invoice.id}/items`);
      items = itemsResponse.data || itemsResponse || [];
    } catch (e) {
      items = details.items || details.lineItems || [];
    }
    
    // Get payments
    let payments = [];
    try {
      const paymentsResponse = await stClient.get(`/accounting/v2/tenant/{tenant}/invoices/${invoice.id}/payments`);
      payments = paymentsResponse.data || paymentsResponse || [];
    } catch (e) {
      payments = details.payments || [];
    }
    
    return {
      ...details,
      items,
      payments,
      _enrichedAt: new Date()
    };
  }
  
  async transformOne(invoice) {
    const items = invoice.items || [];
    const payments = invoice.payments || [];
    
    // Calculate paid amount from payments
    const paidAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const balance = (invoice.total || 0) - paidAmount;
    
    // Determine status based on balance
    let status = invoice.status || 'Open';
    if (balance <= 0 && invoice.total > 0) {
      status = 'Paid';
    } else if (paidAmount > 0 && balance > 0) {
      status = 'Partial';
    }
    
    return {
      st_id: BigInt(invoice.id),
      tenant_id: BigInt(process.env.SERVICE_TITAN_TENANT_ID),
      
      // References
      customer_id: invoice.customerId ? BigInt(invoice.customerId) : null,
      job_id: invoice.jobId ? BigInt(invoice.jobId) : null,
      location_id: invoice.locationId ? BigInt(invoice.locationId) : null,
      business_unit_id: invoice.businessUnitId ? BigInt(invoice.businessUnitId) : null,
      
      // Invoice info
      invoice_number: invoice.number || invoice.invoiceNumber || `INV${invoice.id}`,
      status: status,
      
      // Amounts
      subtotal: invoice.subtotal || 0,
      tax: invoice.tax || invoice.taxAmount || 0,
      total: invoice.total || 0,
      balance: balance,
      paid_amount: paidAmount,
      
      // Items and payments
      items: JSON.stringify(items),
      payments: JSON.stringify(payments),
      item_count: items.length,
      payment_count: payments.length,
      
      // Dates
      due_date: invoice.dueDate ? new Date(invoice.dueDate) : null,
      paid_on: status === 'Paid' && payments.length > 0 
        ? new Date(payments[payments.length - 1].date || payments[payments.length - 1].createdOn)
        : null,
      
      // Timestamps
      st_created_on: invoice.createdOn ? new Date(invoice.createdOn) : new Date(),
      st_modified_on: invoice.modifiedOn ? new Date(invoice.modifiedOn) : new Date(),
      
      // Raw data
      full_data: invoice,
      
      // Sync
      last_synced_at: new Date()
    };
  }
  
  async upsertOne(invoice) {
    const existing = await prisma.st_invoices.findUnique({
      where: { st_id: invoice.st_id }
    });
    
    await prisma.st_invoices.upsert({
      where: { st_id: invoice.st_id },
      create: invoice,
      update: invoice
    });
    
    return { created: !existing };
  }
  
  async postProcess() {
    // Calculate AR aging
    logger.info('[invoices] Calculating AR aging...');
    
    const aging = await prisma.$queryRaw`
      SELECT 
        COUNT(*) FILTER (WHERE balance > 0 AND due_date >= CURRENT_DATE) as current,
        COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE AND due_date >= CURRENT_DATE - 30) as days_1_30,
        COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 30 AND due_date >= CURRENT_DATE - 60) as days_31_60,
        COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 60 AND due_date >= CURRENT_DATE - 90) as days_61_90,
        COUNT(*) FILTER (WHERE balance > 0 AND due_date < CURRENT_DATE - 90) as over_90,
        SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END) as total_outstanding
      FROM st_invoices
    `;
    
    logger.info('[invoices] AR Aging:', aging[0]);
    
    // Also sync payments to separate table
    await this.syncPayments();
  }
  
  async syncPayments() {
    logger.info('[invoices] Syncing payments...');
    
    // Get all invoices with payments
    const invoicesWithPayments = await prisma.st_invoices.findMany({
      where: {
        payment_count: { gt: 0 }
      },
      select: {
        st_id: true,
        customer_id: true,
        payments: true
      }
    });
    
    let paymentCount = 0;
    
    for (const invoice of invoicesWithPayments) {
      const payments = JSON.parse(invoice.payments || '[]');
      
      for (const payment of payments) {
        try {
          await prisma.st_payments.upsert({
            where: { 
              st_id: payment.id ? BigInt(payment.id) : BigInt(`${invoice.st_id}${paymentCount}`) 
            },
            create: {
              st_id: payment.id ? BigInt(payment.id) : BigInt(`${invoice.st_id}${paymentCount}`),
              invoice_id: invoice.st_id,
              customer_id: invoice.customer_id,
              amount: payment.amount || 0,
              payment_method: payment.type || payment.method || 'Unknown',
              payment_date: payment.date ? new Date(payment.date) : new Date(payment.createdOn),
              reference: payment.checkNumber || payment.reference || null,
              full_data: payment,
              last_synced_at: new Date()
            },
            update: {
              amount: payment.amount || 0,
              payment_method: payment.type || payment.method || 'Unknown',
              payment_date: payment.date ? new Date(payment.date) : new Date(payment.createdOn),
              reference: payment.checkNumber || payment.reference || null,
              full_data: payment,
              last_synced_at: new Date()
            }
          });
          paymentCount++;
        } catch (error) {
          logger.error('Failed to upsert payment', { error: error.message });
        }
      }
    }
    
    logger.info(`[invoices] Synced ${paymentCount} payments`);
  }
}

export const invoiceSync = new InvoiceSync();

export async function syncInvoices() {
  return invoiceSync.run();
}
```

---

## Continue to Part 3?

Part 3 contains:
- Appointments sync
- Technicians/Employees sync
- Reference data sync (Business Units, Job Types, Campaigns)
- Database migration
- Orchestrator update
- Complete Windsurf deployment prompt

**Continue?**
