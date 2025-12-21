/**
 * Salesforce Integration Routes
 * 
 * Provides REST API endpoints for Salesforce OAuth and sync operations.
 */

import { Router } from 'express';
import crypto from 'crypto';
import salesforce from '../integrations/salesforce/index.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ============================================================
// OAuth Routes
// ============================================================

/**
 * GET /api/salesforce/auth
 * Initiates OAuth flow - redirects to Salesforce login
 */
router.get('/auth', (req, res) => {
  const state = crypto.randomBytes(32).toString('hex');
  req.session = req.session || {};
  req.session.salesforceOAuthState = state;
  
  const authUrl = salesforce.getAuthorizationUrl(state);
  logger.info('Initiating Salesforce OAuth flow');
  
  res.redirect(authUrl);
});

/**
 * GET /api/salesforce/callback
 * OAuth callback - exchanges code for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;
    
    if (error) {
      logger.error({ error, error_description }, 'Salesforce OAuth error');
      return res.redirect(`/?error=${encodeURIComponent(error_description || error)}`);
    }
    
    // Validate state for CSRF protection (if session available)
    if (req.session?.salesforceOAuthState && state !== req.session.salesforceOAuthState) {
      logger.error('OAuth state mismatch');
      return res.redirect('/?error=invalid_state');
    }
    
    await salesforce.exchangeCodeForTokens(code);
    
    if (req.session) {
      delete req.session.salesforceOAuthState;
    }
    
    logger.info('Salesforce connected successfully');
    res.redirect('/?success=salesforce_connected');
  } catch (error) {
    logger.error({ error: error.message }, 'Salesforce OAuth callback failed');
    res.redirect(`/?error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * GET /api/salesforce/status
 * Check connection status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await salesforce.getSalesforceStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/salesforce/config
 * Get Salesforce configuration
 */
router.get('/config', (req, res) => {
  res.json(salesforce.getSalesforceConfig());
});

/**
 * POST /api/salesforce/connect
 * Authenticate using Client Credentials flow (no user interaction needed)
 */
router.post('/connect', async (req, res) => {
  try {
    const tokens = await salesforce.authenticateWithClientCredentials();
    res.json({ 
      success: true, 
      connected: true,
      instanceUrl: tokens.instanceUrl 
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Salesforce client credentials auth failed');
    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/salesforce/login
 * Authenticate using username/password flow (for server-to-server)
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, securityToken } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    
    const tokens = await salesforce.authenticateWithPassword(username, password, securityToken || '');
    res.json({ 
      success: true, 
      connected: true,
      instanceUrl: tokens.instanceUrl 
    });
  } catch (error) {
    logger.error({ error: error.message }, 'Salesforce login failed');
    res.status(401).json({ error: error.message });
  }
});

/**
 * POST /api/salesforce/disconnect
 * Disconnect from Salesforce
 */
router.post('/disconnect', async (req, res) => {
  try {
    const result = await salesforce.disconnectSalesforce();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// Sync Routes
// ============================================================

/**
 * Middleware to check Salesforce connection
 */
async function requireSalesforceConnection(req, res, next) {
  const status = await salesforce.getSalesforceStatus();
  if (!status.connected) {
    return res.status(503).json({
      error: 'Salesforce not connected',
      message: 'Please connect to Salesforce first via /api/salesforce/auth',
    });
  }
  next();
}

/**
 * POST /api/salesforce/sync/customer
 * Sync a single customer to Salesforce
 */
router.post('/sync/customer', requireSalesforceConnection, async (req, res) => {
  try {
    const { customer } = req.body;
    
    if (!customer) {
      return res.status(400).json({ error: 'customer object is required' });
    }
    
    if (!customer.st_id) {
      return res.status(400).json({ error: 'customer.st_id is required' });
    }
    
    const result = await salesforce.syncCustomerToSalesforce(customer);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    logger.error({ error: error.message }, 'Customer sync failed');
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/salesforce/sync/customers
 * Batch sync multiple customers
 */
router.post('/sync/customers', requireSalesforceConnection, async (req, res) => {
  try {
    const { customers } = req.body;
    
    if (!customers || !Array.isArray(customers)) {
      return res.status(400).json({ error: 'customers array is required' });
    }
    
    const { results, summary } = await salesforce.batchSyncCustomersToSalesforce(customers);
    res.json({ results, summary });
  } catch (error) {
    logger.error({ error: error.message }, 'Batch sync failed');
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/salesforce/query
 * Query Salesforce using SOQL
 */
router.get('/query', requireSalesforceConnection, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'q (SOQL query) parameter is required' });
    }
    
    const result = await salesforce.querySalesforce(q);
    res.json(result);
  } catch (error) {
    logger.error({ error: error.message }, 'SOQL query failed');
    res.status(500).json({ error: error.message });
  }
});

export default router;
