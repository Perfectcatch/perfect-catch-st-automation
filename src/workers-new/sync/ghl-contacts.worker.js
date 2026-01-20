/**
 * GHL Contacts Sync Worker
 * Pulls contacts from GHL and syncs to local database
 *
 * Schedule: Every 30 minutes
 */

import { BaseWorker } from '../base.js';
import { syncContactsFromGHL } from '../../integrations/ghl/sync-contacts-from-ghl.js';

class GHLContactsSyncWorker extends BaseWorker {
  constructor() {
    super('ghl-contacts-sync', {
      schedule: '*/30 * * * *', // Every 30 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 600000 // 10 minutes
    });
  }

  async execute() {
    await this.log('info', 'Starting GHL contacts sync');

    const result = await syncContactsFromGHL();

    await this.log('info', 'GHL contacts sync completed', result);

    return result;
  }
}

export default new GHLContactsSyncWorker();
