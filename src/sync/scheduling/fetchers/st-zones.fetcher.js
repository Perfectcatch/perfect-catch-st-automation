/**
 * ServiceTitan Zones Fetcher
 * Fetches all zones from ServiceTitan Dispatch API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STZonesFetcher {
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
   * Fetch all zones from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allZones = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch zones from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.zones.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch zones: ${response.status}`);
        }

        const data = response.data;
        const zones = data.data || [];

        allZones.push(...zones);

        this.logger.info(
          { page, fetched: zones.length, total: allZones.length },
          `Fetched zones page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch zones page');
        throw error;
      }
    }

    this.logger.info({ total: allZones.length }, 'Finished fetching zones');
    return allZones;
  }

  /**
   * Fetch a single zone by ID
   * @param {number} zoneId
   * @returns {Promise<Object>}
   */
  async fetchById(zoneId) {
    const url = stEndpoints.zones.get(zoneId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch zone ${zoneId}: ${response.status}`);
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

export default STZonesFetcher;
