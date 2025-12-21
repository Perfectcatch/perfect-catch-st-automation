/**
 * Sync Worker
 * 
 * Background worker that processes the customer sync queue.
 * Uses BullMQ for reliable job processing with retry logic.
 */

import { Worker, Job, QueueEvents } from 'bullmq';
import { getCustomerSyncService } from '../services/customer-sync.service';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';

// Redis connection for BullMQ
const connection = { host: 'localhost', port: 6379 };

// ============================================================
// Customer Sync Worker
// ============================================================

const customerSyncWorker = new Worker(
  'customer-sync',
  async (job: Job) => {
    const { customerId, customer } = job.data;
    
    logger.info('Processing customer sync job', { 
      jobId: job.id, 
      customerId,
      attempt: job.attemptsMade + 1 
    });

    const syncService = getCustomerSyncService();

    // If full customer data provided, use it
    if (customer) {
      return await syncService.syncCustomerToSalesforce(customer);
    }

    // Otherwise, fetch customer and sync
    // You'll need to implement this based on your data layer
    const customerData = await fetchCustomerById(customerId);
    if (!customerData) {
      throw new Error(`Customer not found: ${customerId}`);
    }

    return await syncService.syncCustomerToSalesforce(customerData);
  },
  {
    connection,
    concurrency: 5, // Process 5 jobs concurrently
    limiter: {
      max: 100, // Max 100 jobs
      duration: 60000, // Per minute (respects Salesforce rate limits)
    },
  }
);

// ============================================================
// Event Handlers
// ============================================================

customerSyncWorker.on('completed', (job: Job, result: any) => {
  logger.info('Customer sync job completed', {
    jobId: job.id,
    customerId: job.data.customerId,
    salesforceId: result?.salesforceContactId,
    duration: result?.duration,
  });

  // Update metrics
  incrementMetric('sync_success');
});

customerSyncWorker.on('failed', (job: Job | undefined, error: Error) => {
  logger.error('Customer sync job failed', {
    jobId: job?.id,
    customerId: job?.data?.customerId,
    error: error.message,
    attempts: job?.attemptsMade,
  });

  // Update metrics
  incrementMetric('sync_failed');
});

customerSyncWorker.on('error', (error: Error) => {
  logger.error('Worker error', { error: error.message });
});

// ============================================================
// Queue Events (for monitoring)
// ============================================================

const queueEvents = new QueueEvents('customer-sync', { connection });

queueEvents.on('waiting', ({ jobId }) => {
  logger.debug('Job waiting', { jobId });
});

queueEvents.on('active', ({ jobId }) => {
  logger.debug('Job active', { jobId });
});

queueEvents.on('stalled', ({ jobId }) => {
  logger.warn('Job stalled', { jobId });
});

// ============================================================
// Scheduled Jobs
// ============================================================

/**
 * Schedule a full sync to run periodically
 * This ensures any missed real-time syncs are caught
 */
async function scheduleFullSync(): Promise<void> {
  const { Queue } = await import('bullmq');
  const schedulerQueue = new Queue('sync-scheduler', { connection });

  // Add a repeating job for full sync
  await schedulerQueue.add(
    'full-sync',
    {},
    {
      repeat: {
        pattern: '0 2 * * *', // Run at 2 AM daily
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    }
  );

  logger.info('Full sync scheduled for 2 AM daily');
}

// Full sync worker
const fullSyncWorker = new Worker(
  'sync-scheduler',
  async (job: Job) => {
    if (job.name === 'full-sync') {
      logger.info('Starting scheduled full sync');
      const syncService = getCustomerSyncService();
      return await syncService.fullSync();
    }
  },
  { connection }
);

fullSyncWorker.on('completed', (job: Job, result: any) => {
  logger.info('Full sync completed', {
    total: result?.total,
    successful: result?.successful,
    failed: result?.failed,
    duration: result?.duration,
  });
});

// ============================================================
// Helper Functions
// ============================================================

/**
 * Fetch customer by ID from your data layer
 * TODO: Implement based on your PerfectCatch data access pattern
 */
async function fetchCustomerById(customerId: number): Promise<any> {
  // This is a placeholder - implement based on your data layer
  // Options:
  // 1. Direct database query
  // 2. Internal API call
  // 3. ServiceTitan API call
  
  throw new Error('Implement fetchCustomerById based on your data layer');
}

/**
 * Increment a metric counter
 */
async function incrementMetric(metric: string): Promise<void> {
  const key = `salesforce:metrics:${metric}`;
  await redis.incr(key);
  
  // Set daily expiration
  const ttl = await redis.ttl(key);
  if (ttl === -1) {
    await redis.expire(key, 86400);
  }
}

// ============================================================
// Graceful Shutdown
// ============================================================

async function shutdown(): Promise<void> {
  logger.info('Shutting down sync workers...');
  
  await customerSyncWorker.close();
  await fullSyncWorker.close();
  await queueEvents.close();
  
  logger.info('Workers shut down gracefully');
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ============================================================
// Export for testing
// ============================================================

export {
  customerSyncWorker,
  fullSyncWorker,
  scheduleFullSync,
  shutdown,
};
