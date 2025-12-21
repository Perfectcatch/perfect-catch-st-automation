/**
 * Salesforce API Routes
 * 
 * Endpoints for OAuth flow and sync operations
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getSalesforceService } from '../services/salesforce.service';
import { getCustomerSyncService } from '../services/customer-sync.service';
import { logger } from '../utils/logger';
import { validateSyncRequest } from '../middleware/validation';
import crypto from 'crypto';

const router = Router();

// ============================================================
// OAuth Routes
// ============================================================

/**
 * GET /api/salesforce/auth
 * Initiates OAuth flow - redirects to Salesforce login
 */
router.get('/auth', (req: Request, res: Response) => {
  const sf = getSalesforceService();
  
  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  req.session.salesforceOAuthState = state;
  
  const authUrl = sf.getAuthorizationUrl(state);
  logger.info('Initiating Salesforce OAuth flow');
  
  res.redirect(authUrl);
});

/**
 * GET /api/salesforce/callback
 * OAuth callback - exchanges code for tokens
 */
router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    // Handle OAuth errors
    if (error) {
      logger.error('Salesforce OAuth error', { error, error_description });
      return res.redirect(`/settings/integrations?error=${encodeURIComponent(error_description as string)}`);
    }
    
    // Validate state for CSRF protection
    if (state !== req.session.salesforceOAuthState) {
      logger.error('OAuth state mismatch', { expected: req.session.salesforceOAuthState, received: state });
      return res.redirect('/settings/integrations?error=invalid_state');
    }
    
    // Exchange code for tokens
    const sf = getSalesforceService();
    await sf.exchangeCodeForTokens(code as string);
    
    // Clean up session
    delete req.session.salesforceOAuthState;
    
    logger.info('Salesforce connected successfully');
    res.redirect('/settings/integrations?success=salesforce_connected');
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/salesforce/status
 * Check connection status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sf = getSalesforceService();
    const connected = sf.isConnected();
    
    let limits = null;
    if (connected) {
      try {
        limits = await sf.getLimits();
      } catch (e) {
        // Token might be expired
      }
    }
    
    res.json({
      connected,
      limits: limits ? {
        dailyApiRequests: {
          used: limits.DailyApiRequests.Max - limits.DailyApiRequests.Remaining,
          max: limits.DailyApiRequests.Max,
          remaining: limits.DailyApiRequests.Remaining,
        },
      } : null,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/salesforce/disconnect
 * Disconnect from Salesforce
 */
router.post('/disconnect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Clear stored tokens
    const { redis } = await import('../config/redis');
    const tenantId = req.user?.tenantId || 'default';
    await redis.del(`salesforce:tokens:${tenantId}`);
    
    logger.info('Salesforce disconnected');
    res.json({ success: true, message: 'Salesforce disconnected' });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Sync Routes
// ============================================================

/**
 * POST /api/salesforce/sync/customer
 * Sync a single customer to Salesforce
 */
router.post('/sync/customer', validateSyncRequest, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId, customer } = req.body;
    const syncService = getCustomerSyncService();
    
    // If full customer object provided, use it; otherwise fetch by ID
    let customerToSync = customer;
    if (!customerToSync && customerId) {
      // Fetch from your data layer
      // customerToSync = await getCustomerById(customerId);
      return res.status(400).json({ error: 'Customer data required' });
    }
    
    const result = await syncService.syncCustomerToSalesforce(customerToSync);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/salesforce/sync/customers
 * Batch sync multiple customers
 */
router.post('/sync/customers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customers, customerIds } = req.body;
    const syncService = getCustomerSyncService();
    
    if (!customers && !customerIds) {
      return res.status(400).json({ error: 'customers or customerIds required' });
    }
    
    // If customerIds provided, queue for async processing
    if (customerIds && Array.isArray(customerIds)) {
      await syncService.queueBatchSync(customerIds);
      return res.json({ 
        queued: true, 
        count: customerIds.length,
        message: `${customerIds.length} customers queued for sync`
      });
    }
    
    // If full customer objects provided, sync immediately
    const { results, summary } = await syncService.batchSyncCustomersToSalesforce(customers);
    
    res.json({ results, summary });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/salesforce/sync/full
 * Trigger a full sync of all modified customers
 */
router.post('/sync/full', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { since } = req.body;
    const syncService = getCustomerSyncService();
    
    const sinceDate = since ? new Date(since) : undefined;
    const summary = await syncService.fullSync(sinceDate);
    
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/salesforce/sync/queue
 * Queue a customer for async sync
 */
router.post('/sync/queue', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId, priority } = req.body;
    
    if (!customerId) {
      return res.status(400).json({ error: 'customerId required' });
    }
    
    const syncService = getCustomerSyncService();
    await syncService.queueCustomerSync(customerId, priority || 'normal');
    
    res.json({ 
      queued: true, 
      customerId,
      message: 'Customer queued for sync'
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================
// Query Routes
// ============================================================

/**
 * GET /api/salesforce/contacts
 * Query contacts from Salesforce
 */
router.get('/contacts', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, limit = 20 } = req.query;
    const sf = getSalesforceService();
    
    let soql = `SELECT Id, FirstName, LastName, Email, Phone, PerfectCatch_Customer_Id__c 
                FROM Contact`;
    
    if (search) {
      soql += ` WHERE Name LIKE '%${search}%' OR Email LIKE '%${search}%'`;
    }
    
    soql += ` ORDER BY LastModifiedDate DESC LIMIT ${limit}`;
    
    const result = await sf.query(soql);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/salesforce/contact/:id
 * Get a specific contact from Salesforce
 */
router.get('/contact/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const sf = getSalesforceService();
    
    const contact = await sf.getById('Contact', id);
    res.json(contact);
  } catch (error) {
    next(error);
  }
});

export default router;
