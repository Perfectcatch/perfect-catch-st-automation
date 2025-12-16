/**
 * ServiceTitan Technicians Fetcher
 * Fetches all technicians from ServiceTitan Settings API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STTechniciansFetcher {
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
   * Fetch all technicians from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allTechnicians = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch technicians from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.technicians.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch technicians: ${response.status}`);
        }

        const data = response.data;
        const technicians = data.data || [];

        allTechnicians.push(...technicians);

        this.logger.info(
          { page, fetched: technicians.length, total: allTechnicians.length },
          `Fetched technicians page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch technicians page');
        throw error;
      }
    }

    this.logger.info({ total: allTechnicians.length }, 'Finished fetching technicians');
    return allTechnicians;
  }

  /**
   * Fetch a single technician by ID
   * @param {number} technicianId
   * @returns {Promise<Object>}
   */
  async fetchById(technicianId) {
    const url = stEndpoints.technicians.get(technicianId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch technician ${technicianId}: ${response.status}`);
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

export default STTechniciansFetcher;
