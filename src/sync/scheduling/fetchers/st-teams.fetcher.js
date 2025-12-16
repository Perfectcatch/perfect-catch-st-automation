/**
 * ServiceTitan Teams Fetcher
 * Fetches all teams from ServiceTitan Dispatch API
 */

import config from '../../../config/index.js';
import { stEndpoints } from '../../../lib/stEndpoints.js';

export class STTeamsFetcher {
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
   * Fetch all teams from ServiceTitan
   * @returns {Promise<Array>}
   */
  async fetchAll() {
    const allTeams = [];
    let page = 1;
    let hasMore = true;
    const pageSize = 500;

    this.logger.info('Starting to fetch teams from ServiceTitan');

    while (hasMore) {
      try {
        const url = stEndpoints.teams.list();

        const response = await this.stClient.stRequest(url, {
          method: 'GET',
          query: {
            page,
            pageSize,
          },
        });

        if (response.status !== 200) {
          throw new Error(`Failed to fetch teams: ${response.status}`);
        }

        const data = response.data;
        const teams = data.data || [];

        allTeams.push(...teams);

        this.logger.info(
          { page, fetched: teams.length, total: allTeams.length },
          `Fetched teams page ${page}`
        );

        hasMore = data.hasMore || false;
        page++;

        // Rate limiting delay
        if (hasMore) {
          await this.sleep(100);
        }
      } catch (error) {
        this.logger.error({ page, error: error.message }, 'Failed to fetch teams page');
        throw error;
      }
    }

    this.logger.info({ total: allTeams.length }, 'Finished fetching teams');
    return allTeams;
  }

  /**
   * Fetch a single team by ID
   * @param {number} teamId
   * @returns {Promise<Object>}
   */
  async fetchById(teamId) {
    const url = stEndpoints.teams.get(teamId);

    const response = await this.stClient.stRequest(url, {
      method: 'GET',
    });

    if (response.status !== 200) {
      throw new Error(`Failed to fetch team ${teamId}: ${response.status}`);
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

export default STTeamsFetcher;
