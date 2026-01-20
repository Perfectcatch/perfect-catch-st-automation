/**
 * GHL API Client
 * Production-ready client with rate limiting, retries, and error handling
 */

import axios from 'axios';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('ghl-client');

// Rate limiting: GHL allows 100 requests per 10 seconds (10/sec)
const queue = new PQueue({
  concurrency: 5,
  interval: 1000,
  intervalCap: 8 // 8 requests per second to be safe
});

// Axios instance
const axiosInstance = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28'
  }
});

// Add auth header
axiosInstance.interceptors.request.use((config) => {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    throw new Error('GHL_API_KEY environment variable not set');
  }
  config.headers['Authorization'] = `Bearer ${apiKey}`;
  return config;
});

// Response interceptor for logging
axiosInstance.interceptors.response.use(
  (response) => {
    logger.debug({
      method: response.config.method?.toUpperCase(),
      url: response.config.url,
      status: response.status
    }, 'GHL API response');
    return response;
  },
  (error) => {
    logger.error({
      method: error.config?.method?.toUpperCase(),
      url: error.config?.url,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    }, 'GHL API error');
    throw error;
  }
);

/**
 * Make a rate-limited, retrying API request
 */
async function request(method, url, data = null, options = {}) {
  return queue.add(() =>
    pRetry(
      async () => {
        const response = await axiosInstance({
          method,
          url,
          data,
          params: options.params
        });
        return response.data;
      },
      {
        retries: 3,
        onFailedAttempt: (error) => {
          const status = error.response?.status;

          // Don't retry on 4xx errors (except 429)
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw error;
          }

          logger.warn({
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            status,
            url
          }, 'GHL request failed, retrying');
        },
        minTimeout: 1000,
        maxTimeout: 10000
      }
    )
  );
}

// Contacts API
export const contacts = {
  async list(locationId, params = {}) {
    return request('GET', '/contacts/', null, {
      params: { locationId, ...params }
    });
  },

  async get(contactId) {
    return request('GET', `/contacts/${contactId}`);
  },

  async create(contactData) {
    return request('POST', '/contacts/', contactData);
  },

  async update(contactId, contactData) {
    return request('PUT', `/contacts/${contactId}`, contactData);
  },

  async delete(contactId) {
    return request('DELETE', `/contacts/${contactId}`);
  },

  async search(locationId, query) {
    return request('GET', '/contacts/search', null, {
      params: { locationId, query }
    });
  },

  async upsert(locationId, contactData) {
    return request('POST', '/contacts/upsert', {
      locationId,
      ...contactData
    });
  }
};

// Opportunities API
export const opportunities = {
  async list(locationId, params = {}) {
    return request('GET', `/opportunities/`, null, {
      params: { locationId, ...params }
    });
  },

  async get(opportunityId) {
    return request('GET', `/opportunities/${opportunityId}`);
  },

  async create(opportunityData) {
    return request('POST', '/opportunities/', opportunityData);
  },

  async update(opportunityId, opportunityData) {
    return request('PUT', `/opportunities/${opportunityId}`, opportunityData);
  },

  async delete(opportunityId) {
    return request('DELETE', `/opportunities/${opportunityId}`);
  },

  async updateStage(opportunityId, pipelineId, stageId) {
    return request('PUT', `/opportunities/${opportunityId}/status`, {
      pipelineId,
      stageId
    });
  },

  async search(locationId, pipelineId, params = {}) {
    return request('GET', '/opportunities/search', null, {
      params: { locationId, pipelineId, ...params }
    });
  }
};

// Pipelines API
export const pipelines = {
  async list(locationId) {
    return request('GET', '/opportunities/pipelines', null, {
      params: { locationId }
    });
  },

  async get(pipelineId, locationId) {
    return request('GET', `/opportunities/pipelines/${pipelineId}`, null, {
      params: { locationId }
    });
  }
};

// Custom Fields API
export const customFields = {
  async list(locationId) {
    return request('GET', '/custom-fields/', null, {
      params: { locationId }
    });
  },

  async get(fieldId, locationId) {
    return request('GET', `/custom-fields/${fieldId}`, null, {
      params: { locationId }
    });
  }
};

// Export default client
export const ghlClient = {
  contacts,
  opportunities,
  pipelines,
  customFields,
  request,
  getQueueStats: () => ({
    size: queue.size,
    pending: queue.pending
  })
};

export default ghlClient;
