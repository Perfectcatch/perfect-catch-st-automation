/**
 * In Progress Stage Mover Worker
 * Moves opportunities to "In Progress / On Site" stage when
 * the install job's appointment is dispatched or working
 *
 * Schedule: Every 5 minutes
 */

import { BaseWorker } from '../base.js';
import { processInProgressMoves } from '../../integrations/ghl/move-to-in-progress.js';

class InProgressStageMoverWorker extends BaseWorker {
  constructor() {
    super('in-progress-stage-mover', {
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    await this.log('info', 'Starting in-progress stage mover');

    const result = await processInProgressMoves();

    await this.log('info', 'In-progress stage mover completed', result);

    return result;
  }
}

export default new InProgressStageMoverWorker();
