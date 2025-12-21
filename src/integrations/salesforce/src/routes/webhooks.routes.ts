/**
 * Webhook Handlers
 * 
 * Handles incoming webhooks from:
 * - PerfectCatch/ServiceTitan (customer created/updated events)
 * - Salesforce (Platform Events or Outbound Messages)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getCustomerSyncService } from '../services/customer-sync.service';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

// ============================================================
// PerfectCatch Webhooks (ServiceTitan events)
// ============================================================

/**
 * POST /webhooks/perfectcatch
 * Receives events from PerfectCatch/ServiceTitan
 */
router.post('/perfectcatch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-perfectcatch-signature'] as string;
    if (!verifyPerfectCatchSignature(req.body, signature)) {
      logger.warn('Invalid webhook signature received');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, entityType, entityId, data } = req.body;
    
    logger.info('PerfectCatch webhook received', { event, entityType, entityId });

    // Handle customer events
    if (entityType === 'customer') {
      const syncService = getCustomerSyncService();
      
      switch (event) {
        case 'customer.created':
        case 'customer.updated':
          // Queue for async sync (don't block the webhook response)
          await syncService.queueCustomerSync(entityId, 'high');
          break;
          
        case 'customer.deleted':
          // Optionally handle deletion in Salesforce
          // Could mark as inactive rather than delete
          logger.info('Customer deleted event - consider marking inactive in SF', { entityId });
          break;
          
        default:
          logger.debug('Unhandled customer event', { event });
      }
    }

    // Handle estimate events (future: sync to Opportunities)
    if (entityType === 'estimate') {
      switch (event) {
        case 'estimate.created':
        case 'estimate.updated':
        case 'estimate.sold':
          // TODO: Implement estimate sync
          logger.info('Estimate event received - sync not yet implemented', { event, entityId });
          break;
      }
    }

    // Handle job events (future: sync to Events)
    if (entityType === 'job') {
      switch (event) {
        case 'job.scheduled':
        case 'job.completed':
          // TODO: Implement job sync
          logger.info('Job event received - sync not yet implemented', { event, entityId });
          break;
      }
    }

    // Always respond quickly to webhooks
    res.json({ received: true, event });
  } catch (error) {
    logger.error('Webhook processing error', { error });
    // Still return 200 to prevent retries for processing errors
    res.json({ received: true, error: 'Processing error logged' });
  }
});

/**
 * POST /webhooks/servicetitan
 * Direct webhooks from ServiceTitan
 */
router.post('/servicetitan', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventType, data } = req.body;
    
    logger.info('ServiceTitan webhook received', { eventType });

    // Map ServiceTitan events to sync actions
    if (eventType.startsWith('Customer')) {
      const syncService = getCustomerSyncService();
      const customerId = data.id || data.customerId;
      
      if (customerId) {
        await syncService.queueCustomerSync(customerId, 'normal');
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('ServiceTitan webhook error', { error });
    res.json({ received: true });
  }
});

// ============================================================
// Salesforce Webhooks
// ============================================================

/**
 * POST /webhooks/salesforce
 * Receives Salesforce Platform Events or Outbound Messages
 */
router.post('/salesforce', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Salesforce Outbound Messages are SOAP-based
    // Platform Events use a different mechanism (usually push via CometD)
    // This handles simple REST-based notifications if configured
    
    const { sobject, recordId, changeType, changedFields } = req.body;
    
    logger.info('Salesforce webhook received', { sobject, recordId, changeType });

    // Handle Contact updates from Salesforce
    if (sobject === 'Contact' && changeType === 'updated') {
      const syncService = getCustomerSyncService();
      
      // Only sync if relevant fields changed (sales/marketing fields)
      const relevantFields = ['Lead_Source__c', 'Customer_Segment__c', 'Lifecycle_Stage__c', 'HasOptedOutOfEmail'];
      const hasRelevantChanges = relevantFields.some(field => changedFields?.[field] !== undefined);
      
      if (hasRelevantChanges) {
        await syncService.syncContactToPerfectCatch(recordId);
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Salesforce webhook error', { error });
    res.json({ received: true });
  }
});

/**
 * POST /webhooks/salesforce/outbound-message
 * Handles Salesforce SOAP Outbound Messages
 */
router.post('/salesforce/outbound-message', async (req: Request, res: Response) => {
  // Salesforce expects a specific SOAP response
  const soapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">
      <Ack>true</Ack>
    </notificationsResponse>
  </soapenv:Body>
</soapenv:Envelope>`;

  try {
    // Parse SOAP request body to extract notification data
    // In production, use a proper XML parser
    logger.info('Salesforce Outbound Message received');
    
    // Process the notification asynchronously
    // The actual parsing would depend on your workflow configuration
    
    res.type('application/xml').send(soapResponse);
  } catch (error) {
    logger.error('Outbound message error', { error });
    res.type('application/xml').send(soapResponse);
  }
});

// ============================================================
// Utility Functions
// ============================================================

/**
 * Verify webhook signature from PerfectCatch
 */
function verifyPerfectCatchSignature(payload: any, signature: string): boolean {
  if (!signature || !process.env.PERFECTCATCH_WEBHOOK_SECRET) {
    // In development, allow unsigned webhooks
    return process.env.NODE_ENV === 'development';
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.PERFECTCATCH_WEBHOOK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

export default router;
