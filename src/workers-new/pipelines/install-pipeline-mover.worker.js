/**
 * Install Pipeline Mover Worker
 * Moves opportunities from Sales Pipeline to Install Pipeline
 * when an install job is created
 *
 * Schedule: Every 5 minutes
 */

import { BaseWorker } from '../base.js';
import { processInstallJobMoves } from '../../integrations/ghl/move-to-install-pipeline.js';

class InstallPipelineMoverWorker extends BaseWorker {
  constructor() {
    super('install-pipeline-mover', {
      schedule: '*/5 * * * *', // Every 5 minutes
      enabled: process.env.GHL_SYNC_ENABLED === 'true',
      timeout: 300000 // 5 minutes
    });
  }

  async execute() {
    await this.log('info', 'Starting install pipeline mover');

    const result = await processInstallJobMoves();

    await this.log('info', 'Install pipeline mover completed', result);

    return result;
  }
}

export default new InstallPipelineMoverWorker();
