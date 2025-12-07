/**
 * ServiceTitan Categories Fetcher
 * Fetches all pricebook categories from ServiceTitan API
 */

import config from '../../../config/index.js';

export class STCategoriesFetcher {
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
   * Fetch all categories from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allCategories = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    this.logger.info('Starting to fetch categories from ServiceTitan');

    while (hasMore) {
      try {
        const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/categories`;
        
        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch categories: ${response.status}`);
        }

        const data = response.data;
        const categories = data.data || [];
        
        allCategories.push(...categories);

        this.logger.info(
          { page, fetched: categories.length, total: allCategories.length },
          `Fetched categories page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch categories page');
        throw error;
      }
    }

    this.logger.info({ total: allCategories.length }, 'Finished fetching categories');
    return allCategories;
  }

  /**
   * Fetch a single category by ID
   * @param {number} categoryId
   * @returns {Promise<Object>}
   */
  async fetchById(categoryId) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/categories/${categoryId}`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch category ${categoryId}: ${response.status}`);
    }

    return response.data;
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

export default STCategoriesFetcher;
