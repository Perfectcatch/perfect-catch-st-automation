/**
 * ServiceTitan Job Types Fetcher
 * Fetches all job types from ServiceTitan JPM API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STJobTypesFetcher {
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
   * Fetch all job types from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allJobTypes = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch job types from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.jobTypes.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch job types: ${response.status}`);
        }

        const data = response.data;
        const jobTypes = data.data || [];

        allJobTypes.push(...jobTypes);

        this.logger.info(
          { page, fetched: jobTypes.length, total: allJobTypes.length },
          `Fetched job types page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch job types page');
        throw error;
      }
    }

    this.logger.info({ total: allJobTypes.length }, 'Finished fetching job types');
    return allJobTypes;
  }

  /**
   * Fetch a single job type by ID
   * @param {number} jobTypeId
   * @returns {Promise<Object>}
   */
  async fetchById(jobTypeId) {
    const url = stEndpoints.jobTypes.get(jobTypeId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch job type ${jobTypeId}: ${response.status}`);
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

export default STJobTypesFetcher;
