/**
 * GHL Opportunities Sync Worker
 * Pulls opportunities from GHL and syncs to local database
 *
 * Schedule: Every 15 minutes
 */

import { BaseWorker } from '../base.js';
import { syncOpportunitiesFromGHL } from '../../integrations/ghl/sync-opportunities-from-ghl.js';

class GHLOpportunitiesSyncWorker extends BaseWorker {
  constructor() {
    super('ghl-opportunities-sync', {
      schedule: '*/15 * * * *', // Every 15 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 600000 // 10 minutes
    });
  }

  async execute() {
    await this.log('info', 'Starting GHL opportunities sync');

    const result = await syncOpportunitiesFromGHL();

    await this.log('info', 'GHL opportunities sync completed', result);

    return result;
  }
}

export default new GHLOpportunitiesSyncWorker();
