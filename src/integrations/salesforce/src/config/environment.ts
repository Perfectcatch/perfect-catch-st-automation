/**
 * Environment Configuration
 * 
 * Centralized config with validation
 */

import { SalesforceConfig } from '../models/salesforce.types';

interface AppConfig {
  nodeEnv: string;
  port: number;
  salesforce: SalesforceConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  webhooks: {
    perfectcatchSecret?: string;
    salesforceSecret?: string;
  };
  sync: {
    batchSize: number;
    concurrency: number;
    retryAttempts: number;
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

export function loadConfig(): AppConfig {
  return {
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    
    salesforce: {
      clientId: requireEnv('SALESFORCE_CLIENT_ID'),
      clientSecret: requireEnv('SALESFORCE_CLIENT_SECRET'),
      redirectUri: requireEnv('SALESFORCE_REDIRECT_URI'),
      loginUrl: optionalEnv('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com'),
      tenantId: optionalEnv('TENANT_ID', 'default'),
      apiVersion: optionalEnv('SALESFORCE_API_VERSION', 'v59.0'),
    },
    
    redis: {
      host: optionalEnv('REDIS_HOST', 'localhost'),
      port: parseInt(optionalEnv('REDIS_PORT', '6379'), 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(optionalEnv('REDIS_DB', '0'), 10),
    },
    
    webhooks: {
      perfectcatchSecret: process.env.PERFECTCATCH_WEBHOOK_SECRET,
      salesforceSecret: process.env.SALESFORCE_WEBHOOK_SECRET,
    },
    
    sync: {
      batchSize: parseInt(optionalEnv('SYNC_BATCH_SIZE', '200'), 10),
      concurrency: parseInt(optionalEnv('SYNC_CONCURRENCY', '5'), 10),
      retryAttempts: parseInt(optionalEnv('SYNC_RETRY_ATTEMPTS', '3'), 10),
    },
  };
}

// Singleton
let config: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!config) {
    config = loadConfig();
  }
  return config;
}
