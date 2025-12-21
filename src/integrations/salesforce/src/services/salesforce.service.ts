/**
 * Salesforce Integration Service
 * 
 * Handles all communication with Salesforce REST API including:
 * - OAuth 2.0 authentication (Web Server Flow)
 * - Token refresh management
 * - CRUD operations on Salesforce objects
 * - Bulk operations for large data sets
 * - Error handling and retry logic
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { SalesforceConfig, SalesforceTokens, SalesforceError } from '../models/salesforce.types';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';

export class SalesforceService {
  private config: SalesforceConfig;
  private axiosInstance: AxiosInstance | null = null;
  private tokens: SalesforceTokens | null = null;

  constructor(config: SalesforceConfig) {
    this.config = config;
  }

  /**
   * Generate the OAuth authorization URL for initial connection
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: 'api refresh_token offline_access',
      state,
    });

    return `${this.config.loginUrl}/services/oauth2/authorize?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCodeForTokens(code: string): Promise<SalesforceTokens> {
    try {
      const response = await axios.post(
        `${this.config.loginUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.tokens = {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token,
        instanceUrl: response.data.instance_url,
        tokenType: response.data.token_type,
        issuedAt: new Date(parseInt(response.data.issued_at)),
        expiresIn: 7200, // Salesforce tokens typically expire in 2 hours
      };

      await this.storeTokens(this.tokens);
      this.initializeAxiosInstance();

      logger.info('Salesforce OAuth tokens obtained successfully');
      return this.tokens;
    } catch (error) {
      logger.error('Failed to exchange code for tokens', { error });
      throw this.handleError(error);
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<SalesforceTokens> {
    if (!this.tokens?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await axios.post(
        `${this.config.loginUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.tokens.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );

      this.tokens = {
        ...this.tokens,
        accessToken: response.data.access_token,
        instanceUrl: response.data.instance_url,
        issuedAt: new Date(parseInt(response.data.issued_at)),
      };

      await this.storeTokens(this.tokens);
      this.initializeAxiosInstance();

      logger.info('Salesforce access token refreshed');
      return this.tokens;
    } catch (error) {
      logger.error('Failed to refresh access token', { error });
      throw this.handleError(error);
    }
  }

  /**
   * Initialize axios instance with auth headers
   */
  private initializeAxiosInstance(): void {
    if (!this.tokens) {
      throw new Error('Tokens not initialized');
    }

    this.axiosInstance = axios.create({
      baseURL: `${this.tokens.instanceUrl}/services/data/v59.0`,
      headers: {
        Authorization: `Bearer ${this.tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Add response interceptor for token refresh
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          logger.info('Access token expired, refreshing...');
          await this.refreshAccessToken();
          
          // Retry the original request
          if (error.config) {
            error.config.headers.Authorization = `Bearer ${this.tokens?.accessToken}`;
            return axios(error.config);
          }
        }
        throw error;
      }
    );
  }

  /**
   * Store tokens in Redis for persistence
   */
  private async storeTokens(tokens: SalesforceTokens): Promise<void> {
    await redis.set(
      `salesforce:tokens:${this.config.tenantId}`,
      JSON.stringify(tokens),
      'EX',
      86400 * 30 // 30 days
    );
  }

  /**
   * Load tokens from Redis
   */
  async loadStoredTokens(): Promise<boolean> {
    const stored = await redis.get(`salesforce:tokens:${this.config.tenantId}`);
    if (stored) {
      this.tokens = JSON.parse(stored);
      this.initializeAxiosInstance();
      return true;
    }
    return false;
  }

  /**
   * Check if connected to Salesforce
   */
  isConnected(): boolean {
    return this.tokens !== null && this.axiosInstance !== null;
  }

  /**
   * Get the axios instance, ensuring connection
   */
  private async getClient(): Promise<AxiosInstance> {
    if (!this.axiosInstance) {
      const loaded = await this.loadStoredTokens();
      if (!loaded) {
        throw new Error('Salesforce not connected. Please authenticate first.');
      }
    }
    return this.axiosInstance!;
  }

  // ============================================================
  // CRUD Operations
  // ============================================================

  /**
   * Create a record in Salesforce
   */
  async create<T>(sobject: string, data: T): Promise<{ id: string; success: boolean }> {
    const client = await this.getClient();
    
    try {
      const response = await client.post(`/sobjects/${sobject}`, data);
      logger.info(`Created ${sobject} record`, { id: response.data.id });
      return { id: response.data.id, success: true };
    } catch (error) {
      logger.error(`Failed to create ${sobject}`, { error, data });
      throw this.handleError(error);
    }
  }

  /**
   * Update a record in Salesforce
   */
  async update<T>(sobject: string, id: string, data: T): Promise<void> {
    const client = await this.getClient();
    
    try {
      await client.patch(`/sobjects/${sobject}/${id}`, data);
      logger.info(`Updated ${sobject} record`, { id });
    } catch (error) {
      logger.error(`Failed to update ${sobject}`, { error, id, data });
      throw this.handleError(error);
    }
  }

  /**
   * Upsert a record using external ID
   * This is the preferred method for syncing - creates if not exists, updates if exists
   */
  async upsert<T>(
    sobject: string,
    externalIdField: string,
    externalIdValue: string,
    data: T
  ): Promise<{ id: string; created: boolean }> {
    const client = await this.getClient();
    
    try {
      const response = await client.patch(
        `/sobjects/${sobject}/${externalIdField}/${externalIdValue}`,
        data
      );
      
      const created = response.status === 201;
      logger.info(`Upserted ${sobject} record`, { 
        externalId: externalIdValue, 
        created 
      });
      
      return { 
        id: response.data?.id || externalIdValue, 
        created 
      };
    } catch (error) {
      logger.error(`Failed to upsert ${sobject}`, { 
        error, 
        externalIdField, 
        externalIdValue 
      });
      throw this.handleError(error);
    }
  }

  /**
   * Get a record by ID
   */
  async getById<T>(sobject: string, id: string, fields?: string[]): Promise<T> {
    const client = await this.getClient();
    
    try {
      const params = fields ? `?fields=${fields.join(',')}` : '';
      const response = await client.get(`/sobjects/${sobject}/${id}${params}`);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get ${sobject}`, { error, id });
      throw this.handleError(error);
    }
  }

  /**
   * Query records using SOQL
   */
  async query<T>(soql: string): Promise<{ records: T[]; totalSize: number }> {
    const client = await this.getClient();
    
    try {
      const response = await client.get('/query', {
        params: { q: soql },
      });
      
      return {
        records: response.data.records,
        totalSize: response.data.totalSize,
      };
    } catch (error) {
      logger.error('SOQL query failed', { error, soql });
      throw this.handleError(error);
    }
  }

  /**
   * Delete a record
   */
  async delete(sobject: string, id: string): Promise<void> {
    const client = await this.getClient();
    
    try {
      await client.delete(`/sobjects/${sobject}/${id}`);
      logger.info(`Deleted ${sobject} record`, { id });
    } catch (error) {
      logger.error(`Failed to delete ${sobject}`, { error, id });
      throw this.handleError(error);
    }
  }

  // ============================================================
  // Bulk Operations
  // ============================================================

  /**
   * Bulk upsert records using Composite API
   * Limited to 200 records per call
   */
  async bulkUpsert<T>(
    sobject: string,
    externalIdField: string,
    records: Array<T & { [key: string]: string }>
  ): Promise<Array<{ id: string; success: boolean; errors: string[] }>> {
    const client = await this.getClient();
    
    // Split into chunks of 200
    const chunks = this.chunkArray(records, 200);
    const results: Array<{ id: string; success: boolean; errors: string[] }> = [];

    for (const chunk of chunks) {
      try {
        const compositeRequest = {
          allOrNone: false,
          records: chunk.map((record) => ({
            attributes: { type: sobject },
            ...record,
          })),
        };

        const response = await client.patch(
          `/composite/sobjects/${sobject}/${externalIdField}`,
          compositeRequest
        );

        results.push(
          ...response.data.map((r: any) => ({
            id: r.id,
            success: r.success,
            errors: r.errors?.map((e: any) => e.message) || [],
          }))
        );
      } catch (error) {
        logger.error('Bulk upsert failed', { error, sobject });
        throw this.handleError(error);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info(`Bulk upsert completed for ${sobject}`, {
      total: records.length,
      success: successCount,
      failed: records.length - successCount,
    });

    return results;
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Describe an object to get its metadata
   */
  async describe(sobject: string): Promise<any> {
    const client = await this.getClient();
    const response = await client.get(`/sobjects/${sobject}/describe`);
    return response.data;
  }

  /**
   * Get API limits
   */
  async getLimits(): Promise<any> {
    const client = await this.getClient();
    const response = await client.get('/limits');
    return response.data;
  }

  /**
   * Handle and transform Salesforce errors
   */
  private handleError(error: any): SalesforceError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<any>;
      const sfErrors = axiosError.response?.data;
      
      if (Array.isArray(sfErrors) && sfErrors.length > 0) {
        return {
          message: sfErrors[0].message,
          errorCode: sfErrors[0].errorCode,
          fields: sfErrors[0].fields,
          statusCode: axiosError.response?.status,
        };
      }
      
      return {
        message: axiosError.message,
        errorCode: 'UNKNOWN_ERROR',
        statusCode: axiosError.response?.status,
      };
    }
    
    return {
      message: error.message || 'Unknown error',
      errorCode: 'UNKNOWN_ERROR',
    };
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// Singleton instance factory
let salesforceInstance: SalesforceService | null = null;

export function getSalesforceService(config?: SalesforceConfig): SalesforceService {
  if (!salesforceInstance && config) {
    salesforceInstance = new SalesforceService(config);
  }
  if (!salesforceInstance) {
    throw new Error('Salesforce service not initialized');
  }
  return salesforceInstance;
}
