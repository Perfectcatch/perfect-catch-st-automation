/**
 * ServiceTitan Materials Fetcher
 * Fetches all pricebook materials from ServiceTitan API
 */

import config from '../../../config/index.js';

export class STMaterialsFetcher {
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
   * Fetch all materials from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allMaterials = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    this.logger.info('Starting to fetch materials from ServiceTitan');

    while (hasMore) {
      try {
        const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials`;
        
        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch materials: ${response.status}`);
        }

        const data = response.data;
        const materials = data.data || [];
        
        allMaterials.push(...materials);

        this.logger.info(
          { page, fetched: materials.length, total: allMaterials.length },
          `Fetched materials page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch materials page');
        throw error;
      }
    }

    this.logger.info({ total: allMaterials.length }, 'Finished fetching materials');
    return allMaterials;
  }

  /**
   * Fetch a single material by ID
   * @param {number} materialId
   * @returns {Promise<Object>}
   */
  async fetchById(materialId) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials/${materialId}`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch material ${materialId}: ${response.status}`);
    }

    return response.data;
  }

  /**
   * Fetch materials by category ID
   * @param {number} categoryId
   * @returns {Promise<Array>}
   */
  async fetchByCategory(categoryId) {
    const allMaterials = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    while (hasMore) {
      const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/materials`;
      
      const response = await this.stClient.stRequest(url, {
        method: 'GET',
        query: {
          page,
          pageSize,
          categoryId,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch materials for category ${categoryId}: ${response.status}`);
      }

      const data = response.data;
      const materials = data.data || [];
      
      allMaterials.push(...materials);
      hasMore = data.hasMore || false;
      page++;

      if (hasMore) {
        await this.sleep(100);
      }
    }

    return allMaterials;
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

export default STMaterialsFetcher;
