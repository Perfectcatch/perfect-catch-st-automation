/**
 * ServiceTitan Arrival Windows Fetcher
 * Fetches all arrival windows from ServiceTitan Dispatch API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STArrivalWindowsFetcher {
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
   * Fetch all arrival windows from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allArrivalWindows = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch arrival windows from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.arrivalWindows.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch arrival windows: ${response.status}`);
        }

        const data = response.data;
        const arrivalWindows = data.data || [];

        allArrivalWindows.push(...arrivalWindows);

        this.logger.info(
          { page, fetched: arrivalWindows.length, total: allArrivalWindows.length },
          `Fetched arrival windows page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch arrival windows page');
        throw error;
      }
    }

    this.logger.info({ total: allArrivalWindows.length }, 'Finished fetching arrival windows');
    return allArrivalWindows;
  }

  /**
   * Fetch a single arrival window by ID
   * @param {number} arrivalWindowId
   * @returns {Promise<Object>}
   */
  async fetchById(arrivalWindowId) {
    const url = stEndpoints.arrivalWindows.get(arrivalWindowId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch arrival window ${arrivalWindowId}: ${response.status}`);
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

export default STArrivalWindowsFetcher;
