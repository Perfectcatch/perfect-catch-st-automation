/**
 * ServiceTitan Equipment Fetcher
 * Fetches all pricebook equipment from ServiceTitan API
 */

import config from '../../../config/index.js';

export class STEquipmentFetcher {
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
   * Fetch all equipment from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allEquipment = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    this.logger.info('Starting to fetch equipment from ServiceTitan');

    while (hasMore) {
      try {
        const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/equipment`;
        
        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch equipment: ${response.status}`);
        }

        const data = response.data;
        const equipment = data.data || [];
        
        allEquipment.push(...equipment);

        this.logger.info(
          { page, fetched: equipment.length, total: allEquipment.length },
          `Fetched equipment page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch equipment page');
        throw error;
      }
    }

    this.logger.info({ total: allEquipment.length }, 'Finished fetching equipment');
    return allEquipment;
  }

  /**
   * Fetch a single equipment by ID
   * @param {number} equipmentId
   * @returns {Promise<Object>}
   */
  async fetchById(equipmentId) {
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/equipment/${equipmentId}`;
    
    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch equipment ${equipmentId}: ${response.status}`);
    }

    return response.data;
  }

  /**
   * Fetch equipment by category ID
   * @param {number} categoryId
   * @returns {Promise<Array>}
   */
  async fetchByCategory(categoryId) {
    const allEquipment = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 1000;

    while (hasMore) {
      const url = `https://api.servicetitan.io/pricebook/v2/tenant/${this.tenantId}/equipment`;
      
      const response = await this.stClient.stRequest(url, {
        method: 'GET',
        query: {
          page,
          pageSize,
          categoryId,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch equipment for category ${categoryId}: ${response.status}`);
      }

      const data = response.data;
      const equipment = data.data || [];
      
      allEquipment.push(...equipment);
      hasMore = data.hasMore || false;
      page++;

      if (hasMore) {
        await this.sleep(100);
      }
    }

    return allEquipment;
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

export default STEquipmentFetcher;
