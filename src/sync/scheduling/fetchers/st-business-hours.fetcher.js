/**
 * ServiceTitan Business Hours Fetcher
 * Fetches all business hours from ServiceTitan Dispatch API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STBusinessHoursFetcher {
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
   * Fetch all business hours from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allBusinessHours = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch business hours from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.businessHours.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch business hours: ${response.status}`);
        }

        const data = response.data;
        const businessHours = data.data || [];

        allBusinessHours.push(...businessHours);

        this.logger.info(
          { page, fetched: businessHours.length, total: allBusinessHours.length },
          `Fetched business hours page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch business hours page');
        throw error;
      }
    }

    this.logger.info({ total: allBusinessHours.length }, 'Finished fetching business hours');
    return allBusinessHours;
  }

  /**
   * Fetch a single business hours entry by ID
   * @param {number} businessHoursId
   * @returns {Promise<Object>}
   */
  async fetchById(businessHoursId) {
    const url = stEndpoints.businessHours.get(businessHoursId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch business hours ${businessHoursId}: ${response.status}`);
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

export default STBusinessHoursFetcher;
