/**
 * ServiceTitan Services Fetcher
 * Fetches all pricebook services from ServiceTitan API
 */

import config from '../../../config/index.js';

export class STServicesFetcher {
  /**
   * @param {Object} stClient - ServiceTitan API client
   * @param {Object} logger - Logger instance
   */
  constructor(stClient, logger) {
    this.stClient = stClient;
    this.logger = logger;
    this.tenantId = config.serviceTitan.tenantId;
  }

  /**
   * Fetch all services from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allServices = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    this.logger.info('Starting to fetch services from ServiceTitan');

    while (hasMore) {
      try {
        const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services`;
        
        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch services: ${response.status}`);
        }

        const data = response.data;
        const services = data.data || [];
        
        allServices.push(...services);

        this.logger.info(
          { page, fetched: services.length, total: allServices.length },
          `Fetched services page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch services page');
        throw error;
      }
    }

    this.logger.info({ total: allServices.length }, 'Finished fetching services');
    return allServices;
  }

  /**
   * Fetch a single service by ID
   * @param {number} serviceId
   * @returns {Promise<Object>}
   */
  async fetchById(serviceId) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services/${serviceId}`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch service ${serviceId}: ${response.status}`);
    }

    return response.data;
  }

  /**
   * Fetch services by category ID
   * @param {number} categoryId
   * @returns {Promise<Array>}
   */
  async fetchByCategory(categoryId) {
    const allServices = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    while (hasMore) {
      const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/services`;
      
      const response = await this.stClient.stRequest(url, {
        method: 'GET',
        query: {
          page,
          pageSize,
          categoryId,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch services for category ${categoryId}: ${response.status}`);
      }

      const data = response.data;
      const services = data.data || [];
      
      allServices.push(...services);
      hasMore = data.hasMore || false;
      page++;

      if (hasMore) {
        await this.sleep(100);
      }
    }

    return allServices;
  }

  /**
   * Sleep utility for rate limiting
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default STServicesFetcher;
