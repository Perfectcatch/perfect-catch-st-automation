/**
 * Estimates to GHL Worker
 * Pushes ST estimates to GHL as opportunities
 *
 * Schedule: Every 5 minutes
 */

import { BaseWorker } from '../base.js';
import { syncPendingEstimatesToGHL } from '../../integrations/ghl/index.js';

class EstimatesToGHLWorker extends BaseWorker {
  constructor() {
    super('estimates-to-ghl', {
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true' &&
               process.env.GHL_AUTO_SYNC_ESTIMATES !== 'false',
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    await this.log('info', 'Starting estimates to GHL sync');

    const result = await syncPendingEstimatesToGHL();

    await this.log('info', 'Estimates to GHL sync completed', result);

    return result;
  }
}

export default new EstimatesToGHLWorker();
