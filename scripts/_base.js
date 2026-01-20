/**
 * Shared base configuration for all standalone sync scripts
 * Usage: import { supabase, config, log, stRequest } from './_base.js';
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import axios from 'axios';

const { Pool } = pg;

// Supabase client (for JS SDK operations)
export const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;

// Direct PostgreSQL pool (for raw SQL)
let pool = null;
export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

// Configuration object
export const config = {
  tenantId: process.env.TENANT_ID || '3222348440',
  serviceTitan: {
    clientId: process.env.ST_CLIENT_ID,
    clientSecret: process.env.ST_CLIENT_SECRET,
    tenantId: process.env.ST_TENANT_ID || '3222348440',
    appKey: process.env.ST_APP_KEY,
  },
  ghl: {
    apiKey: process.env.GHL_API_KEY,
    locationId: process.env.GHL_LOCATION_ID,
  },
};

// Simple timestamped logger
export const log = (msg, level = 'info') => {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✓';
  console.log(`[${timestamp}] ${prefix} ${msg}`);
};

// ServiceTitan token cache
let stToken = null;
let stTokenExpiry = null;

/**
 * Get ServiceTitan OAuth token
 */
async function getSTToken() {
  // Return cached token if still valid (with 5 min buffer)
  if (stToken && stTokenExpiry && Date.now() < stTokenExpiry - 300000) {
    return stToken;
  }

  const { clientId, clientSecret } = config.serviceTitan;
  
  const response = await axios.post(
    'https://auth.servicetitan.io/connect/token',
    new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }
  );

  stToken = response.data.access_token;
  stTokenExpiry = Date.now() + (response.data.expires_in * 1000);
  
  return stToken;
}

/**
 * Make authenticated request to ServiceTitan API
 */
export async function stRequest(method, endpoint, data = null) {
  const token = await getSTToken();
  const { tenantId, appKey } = config.serviceTitan;
  
  const url = endpoint.startsWith('http') 
    ? endpoint 
    : `https://api.servicetitan.io${endpoint.replace('{tenant}', tenantId)}`;

  const response = await axios({
    method,
    url,
    data,
    headers: {
      'Authorization': `Bearer ${token}`,
      'ST-App-Key': appKey,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

/**
 * GHL API client
 */
export const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${config.ghl.apiKey}`,
  },
});

/**
 * Log sync operation to database
 */
export async function logSync(operation, status, details = {}) {
  try {
    await supabase.from('sync_log').insert({
      operation,
      status,
      details,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    log(`Failed to log sync: ${err.message}`, 'warn');
  }
}

/**
 * Exit handler with proper cleanup
 */
export function exitWithCode(code, message) {
  if (code === 0) {
    log(message || 'Completed successfully');
  } else {
    log(message || 'Failed', 'error');
  }
  process.exit(code);
}
