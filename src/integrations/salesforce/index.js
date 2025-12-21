/**
 * Salesforce Integration Bridge
 * 
 * Bridges the TypeScript Salesforce integration with the main JavaScript codebase.
 * This module provides a JavaScript API for the Salesforce sync functionality.
 * 
 * Usage:
 *   import { syncCustomerToSalesforce, getSalesforceStatus } from './integrations/salesforce/index.js';
 */

import axios from 'axios';
import { redis } from '../../db/redis.js';
import { logger } from '../../lib/logger.js';

// Configuration
const config = {
  clientId: process.env.SALESFORCE_CLIENT_ID,
  clientSecret: process.env.SALESFORCE_CLIENT_SECRET,
  redirectUri: process.env.SALESFORCE_REDIRECT_URI || 'http://localhost:3001/api/salesforce/callback',
  loginUrl: process.env.SALESFORCE_LOGIN_URL || 'https://login.salesforce.com',
  apiVersion: process.env.SALESFORCE_API_VERSION || 'v59.0',
  enabled: process.env.SALESFORCE_SYNC_ENABLED === 'true',
  autoSyncCustomers: process.env.SALESFORCE_AUTO_SYNC_CUSTOMERS === 'true',
  batchSize: parseInt(process.env.SALESFORCE_SYNC_BATCH_SIZE || '200', 10),
};

// Token storage key
const TOKEN_KEY = 'salesforce:tokens:default';

// External ID field names
const CONTACT_EXTERNAL_ID = 'ServiceTitan_Customer_ID__c';
const ACCOUNT_EXTERNAL_ID = 'ServiceTitan_Account_ID__c';

/**
 * Get stored Salesforce tokens from Redis
 */
async function getStoredTokens() {
  try {
    const stored = await redis.get(TOKEN_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to get Salesforce tokens');
    return null;
  }
}

/**
 * Store Salesforce tokens in Redis
 */
async function storeTokens(tokens) {
  try {
    await redis.set(TOKEN_KEY, JSON.stringify(tokens), 'EX', 86400 * 30); // 30 days
    return true;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to store Salesforce tokens');
    return false;
  }
}

/**
 * Generate OAuth authorization URL
 */
export function getAuthorizationUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: 'api refresh_token offline_access',
    state,
  });
  return `${config.loginUrl}/services/oauth2/authorize?${params.toString()}`;
}

/**
 * Authenticate using Client Credentials flow (server-to-server, no user interaction)
 * This is the preferred method for automated integrations
 */
export async function authenticateWithClientCredentials() {
  try {
    const response = await axios.post(
      `${config.loginUrl}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: '', // Client credentials doesn't return refresh token
      instanceUrl: response.data.instance_url,
      tokenType: response.data.token_type,
      issuedAt: new Date(parseInt(response.data.issued_at)),
      expiresIn: 7200,
    };

    await storeTokens(tokens);
    logger.info({ instanceUrl: tokens.instanceUrl }, 'Salesforce authenticated via client credentials');
    return tokens;
  } catch (error) {
    const errMsg = error.response?.data?.error_description || error.message;
    logger.error({ error: errMsg }, 'Salesforce client credentials authentication failed');
    throw new Error(errMsg);
  }
}

/**
 * Authenticate using Username-Password flow (for server-to-server)
 * Requires: username, password, and security token
 */
export async function authenticateWithPassword(username, password, securityToken = '') {
  try {
    const response = await axios.post(
      `${config.loginUrl}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'password',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        username: username,
        password: password + securityToken,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || null,
      instanceUrl: response.data.instance_url,
      tokenType: response.data.token_type,
      issuedAt: new Date(parseInt(response.data.issued_at)),
    };

    await storeTokens(tokens);
    logger.info({ instanceUrl: tokens.instanceUrl }, 'Salesforce authenticated via password flow');
    return tokens;
  } catch (error) {
    const errMsg = error.response?.data?.error_description || error.message;
    logger.error({ error: errMsg }, 'Salesforce password authentication failed');
    throw new Error(errMsg);
  }
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code) {
  try {
    const response = await axios.post(
      `${config.loginUrl}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const tokens = {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token,
      instanceUrl: response.data.instance_url,
      tokenType: response.data.token_type,
      issuedAt: new Date(parseInt(response.data.issued_at)),
    };

    await storeTokens(tokens);
    logger.info('Salesforce OAuth tokens obtained successfully');
    return tokens;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to exchange code for tokens');
    throw error;
  }
}

/**
 * Refresh access token
 */
async function refreshAccessToken(tokens) {
  try {
    const response = await axios.post(
      `${config.loginUrl}/services/oauth2/token`,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const newTokens = {
      ...tokens,
      accessToken: response.data.access_token,
      instanceUrl: response.data.instance_url,
      issuedAt: new Date(parseInt(response.data.issued_at)),
    };

    await storeTokens(newTokens);
    logger.info('Salesforce access token refreshed');
    return newTokens;
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to refresh Salesforce token');
    throw error;
  }
}

/**
 * Create authenticated Salesforce API client
 */
async function getSalesforceClient() {
  let tokens = await getStoredTokens();
  if (!tokens) {
    throw new Error('Salesforce not connected. Please authenticate first.');
  }

  const client = axios.create({
    baseURL: `${tokens.instanceUrl}/services/data/${config.apiVersion}`,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // Add response interceptor for token refresh
  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        logger.info('Salesforce token expired, refreshing...');
        tokens = await refreshAccessToken(tokens);
        error.config.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return axios(error.config);
      }
      throw error;
    }
  );

  return client;
}

/**
 * Check Salesforce connection status
 */
export async function getSalesforceStatus() {
  try {
    const tokens = await getStoredTokens();
    if (!tokens) {
      return { connected: false, enabled: config.enabled };
    }

    const client = await getSalesforceClient();
    const limits = await client.get('/limits');

    return {
      connected: true,
      enabled: config.enabled,
      instanceUrl: tokens.instanceUrl,
      limits: {
        dailyApiRequests: {
          used: limits.data.DailyApiRequests.Max - limits.data.DailyApiRequests.Remaining,
          max: limits.data.DailyApiRequests.Max,
          remaining: limits.data.DailyApiRequests.Remaining,
        },
      },
    };
  } catch (error) {
    return { connected: false, enabled: config.enabled, error: error.message };
  }
}

/**
 * Disconnect from Salesforce
 */
export async function disconnectSalesforce() {
  try {
    await redis.del(TOKEN_KEY);
    logger.info('Salesforce disconnected');
    return { success: true };
  } catch (error) {
    logger.error({ error: error.message }, 'Failed to disconnect Salesforce');
    return { success: false, error: error.message };
  }
}

/**
 * Calculate customer segment based on lifetime value and recency
 */
function calculateSegment(customer) {
  const ltv = customer.lifetime_value || 0;
  const lastJobDate = customer.last_job_date ? new Date(customer.last_job_date) : null;
  const daysSinceLastJob = lastJobDate
    ? Math.floor((Date.now() - lastJobDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  if (ltv >= 10000 && daysSinceLastJob < 180) return 'VIP';
  if (ltv >= 5000) return 'High Value';
  if (daysSinceLastJob > 365) return 'At Risk'; // Was 'Churning' - using 'At Risk' if picklist doesn't have it
  if (daysSinceLastJob > 180) return 'At Risk';
  return 'Standard';
}

/**
 * US State abbreviation to full name mapping
 */
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia', PR: 'Puerto Rico', VI: 'Virgin Islands', GU: 'Guam',
};

/**
 * Convert state abbreviation to full name
 */
function getStateName(state) {
  if (!state) return 'Florida';
  const upper = state.toUpperCase().trim();
  return STATE_NAMES[upper] || state;
}

/**
 * Format street address
 */
function formatStreetAddress(line1, line2) {
  if (!line1 && !line2) return undefined;
  if (!line2) return line1;
  if (!line1) return line2;
  return `${line1}\n${line2}`;
}

/**
 * Map ServiceTitan customer to Salesforce Account
 */
function mapCustomerToAccount(customer) {
  return {
    Name: customer.name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown',
    Type: customer.type?.toLowerCase().includes('commercial') ? 'Commercial' : 'Residential',
    Phone: customer.phone || undefined,
    BillingStreet: formatStreetAddress(customer.address_line1, customer.address_line2),
    BillingCity: customer.city || undefined,
    BillingState: getStateName(customer.state),
    BillingPostalCode: customer.zip || customer.postal_code || undefined,
    BillingCountry: 'United States',
    Account_Balance__c: customer.balance || 0,
    Lifetime_Value__c: customer.lifetime_value || 0,
    Customer_Segment__c: calculateSegment(customer),
  };
}

/**
 * Map ServiceTitan customer to Salesforce Contact
 */
function mapCustomerToContact(customer, accountId) {
  return {
    AccountId: accountId || undefined,
    FirstName: customer.first_name || undefined,
    LastName: customer.last_name || customer.name || 'Unknown',
    Email: customer.email || undefined,
    Phone: customer.phone || undefined,
    MailingStreet: formatStreetAddress(customer.address_line1, customer.address_line2),
    MailingCity: customer.city || undefined,
    MailingState: getStateName(customer.state),
    MailingPostalCode: customer.zip || customer.postal_code || undefined,
    MailingCountry: 'United States',
    HasOptedOutOfEmail: customer.do_not_mail || false,
    ServiceTitan_Tenant_ID__c: customer.tenant_id || undefined,
    Active__c: customer.active !== false,
    Do_Not_Service__c: customer.do_not_service || false,
    Total_Jobs__c: customer.total_jobs || 0,
    Completed_Jobs__c: customer.completed_jobs || 0,
    First_Service_Date__c: customer.first_job_date ? new Date(customer.first_job_date).toISOString().split('T')[0] : undefined,
    Last_Service_Date__c: customer.last_job_date ? new Date(customer.last_job_date).toISOString().split('T')[0] : undefined,
    ServiceTitan_Last_Modified__c: customer.st_modified_on ? new Date(customer.st_modified_on).toISOString() : undefined,
    Last_Sync_DateTime__c: new Date().toISOString(),
  };
}

/**
 * Upsert a record to Salesforce using External ID
 */
async function upsertRecord(client, sobject, externalIdField, externalIdValue, data) {
  try {
    const response = await client.patch(
      `/sobjects/${sobject}/${externalIdField}/${externalIdValue}`,
      data
    );
    return {
      id: response.data?.id || externalIdValue,
      created: response.status === 201,
      success: true,
    };
  } catch (error) {
    const sfError = error.response?.data;
    throw new Error(
      Array.isArray(sfError) && sfError[0]?.message
        ? sfError[0].message
        : error.message
    );
  }
}

/**
 * Sync a single customer to Salesforce
 */
export async function syncCustomerToSalesforce(customer) {
  if (!config.enabled) {
    return { success: false, error: 'Salesforce sync is disabled' };
  }

  const startTime = Date.now();

  try {
    const client = await getSalesforceClient();
    const externalId = `st_${customer.st_id}`;

    // Step 1: Upsert Account (don't include external ID in body - it's in the URL)
    const accountData = mapCustomerToAccount(customer);
    const accountResult = await upsertRecord(
      client,
      'Account',
      ACCOUNT_EXTERNAL_ID,
      externalId,
      accountData
    );

    logger.debug({ stId: customer.st_id, accountId: accountResult.id }, 'Account upserted');

    // Step 2: Upsert Contact linked to Account
    const contactData = mapCustomerToContact(customer, accountResult.id);
    const contactResult = await upsertRecord(
      client,
      'Contact',
      CONTACT_EXTERNAL_ID,
      externalId,
      contactData
    );

    const duration = Date.now() - startTime;
    logger.info(
      { stId: customer.st_id, contactId: contactResult.id, accountId: accountResult.id, duration },
      'Customer synced to Salesforce'
    );

    return {
      success: true,
      stId: customer.st_id,
      salesforceContactId: contactResult.id,
      salesforceAccountId: accountResult.id,
      created: contactResult.created,
      direction: 'outbound',
      duration,
    };
  } catch (error) {
    logger.error({ stId: customer.st_id, error: error.message }, 'Failed to sync customer to Salesforce');
    return {
      success: false,
      stId: customer.st_id,
      direction: 'outbound',
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Batch sync multiple customers to Salesforce
 */
export async function batchSyncCustomersToSalesforce(customers) {
  if (!config.enabled) {
    return { results: [], summary: { total: 0, successful: 0, failed: 0, duration: 0, error: 'Salesforce sync is disabled' } };
  }

  const startTime = Date.now();
  const results = [];

  // Process in batches
  for (let i = 0; i < customers.length; i += config.batchSize) {
    const batch = customers.slice(i, i + config.batchSize);
    
    // Sync each customer individually (could be optimized with Composite API)
    for (const customer of batch) {
      const result = await syncCustomerToSalesforce(customer);
      results.push(result);
    }
  }

  const summary = {
    total: customers.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    duration: Date.now() - startTime,
  };

  logger.info(summary, 'Batch customer sync completed');
  return { results, summary };
}

/**
 * Query Salesforce using SOQL
 */
export async function querySalesforce(soql) {
  try {
    const client = await getSalesforceClient();
    const response = await client.get('/query', { params: { q: soql } });
    return {
      records: response.data.records,
      totalSize: response.data.totalSize,
    };
  } catch (error) {
    logger.error({ error: error.message, soql }, 'SOQL query failed');
    throw error;
  }
}

/**
 * Get Salesforce configuration
 */
export function getSalesforceConfig() {
  return {
    enabled: config.enabled,
    autoSyncCustomers: config.autoSyncCustomers,
    batchSize: config.batchSize,
    loginUrl: config.loginUrl,
    redirectUri: config.redirectUri,
    configured: !!(config.clientId && config.clientSecret),
  };
}

export default {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  authenticateWithClientCredentials,
  authenticateWithPassword,
  getSalesforceStatus,
  disconnectSalesforce,
  syncCustomerToSalesforce,
  batchSyncCustomersToSalesforce,
  querySalesforce,
  getSalesforceConfig,
};
