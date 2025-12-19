/**
 * Workflow Manager
 * Main coordinator for the workflow system
 */

import { eventDetector } from './event-detector.js';
import { triggerEngine } from './trigger-engine.js';
import { executionEngine } from './execution-engine.js';
import { createLogger } from '../../lib/logger.js';
import { moveOpportunityToJobSold, moveOpportunityToInstallPipeline, processInstallJobMoves } from '../../integrations/ghl/index.js';

const logger = createLogger('workflow-manager');

// How often to check for pending install job moves (in ms)
const INSTALL_PIPELINE_CHECK_INTERVAL = 2 * 60 * 1000; // 2 minutes

export class WorkflowManager {
  constructor() {
    this.isRunning = false;
    this.installPipelineInterval = null;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Workflow system already running');
      return;
    }

    logger.info('Starting workflow system...');

    // Connect event detector to trigger engine
    this.setupEventHandlers();

    // Start engines
    await eventDetector.start();
    await executionEngine.start();

    // Start Install Pipeline background checker (if GHL sync enabled)
    if (process.env.GHL_SYNC_ENABLED === 'true') {
      this.startInstallPipelineChecker();
    }

    this.isRunning = true;
    logger.info('Workflow system started successfully');
  }

  /**
   * Start background checker for Install Pipeline moves
   * Runs every 2 minutes to catch any missed install jobs
   */
  startInstallPipelineChecker() {
    logger.info(`Starting Install Pipeline checker (every ${INSTALL_PIPELINE_CHECK_INTERVAL / 1000}s)`);

    // Run immediately on start
    this.checkInstallPipelineMoves();

    // Then run periodically
    this.installPipelineInterval = setInterval(() => {
      this.checkInstallPipelineMoves();
    }, INSTALL_PIPELINE_CHECK_INTERVAL);
  }

  /**
   * Check for and process pending Install Pipeline moves
   */
  async checkInstallPipelineMoves() {
    try {
      const result = await processInstallJobMoves();

      if (result.total > 0) {
        logger.info('Install Pipeline check complete', {
          moved: result.moved,
          failed: result.failed,
          total: result.total
        });
      }
    } catch (error) {
      logger.error('Error checking Install Pipeline moves', {
        error: error.message
      });
    }
  }

  setupEventHandlers() {
    // Estimate events
    eventDetector.on('estimate_created', (data) => {
      logger.debug('Handling estimate_created event');
      triggerEngine.handleEvent('estimate_created', data);
    });

    eventDetector.on('estimate_approved', async (data) => {
      logger.info('Handling estimate_approved event', { estimateId: data.estimateId });
      triggerEngine.handleEvent('estimate_approved', data);

      // Move GHL opportunity to Job Sold stage
      if (process.env.GHL_SYNC_ENABLED === 'true') {
        try {
          await moveOpportunityToJobSold(data.estimateId, data);
          logger.info('✅ GHL opportunity moved to Job Sold', { estimateId: data.estimateId });
        } catch (error) {
          logger.error('Failed to move GHL opportunity to Job Sold', {
            estimateId: data.estimateId,
            error: error.message
          });
        }
      }
    });

    eventDetector.on('estimate_rejected', (data) => {
      logger.debug('Handling estimate_rejected event');
      triggerEngine.handleEvent('estimate_rejected', data);
    });

    // Job events
    eventDetector.on('job_created', (data) => {
      logger.debug('Handling job_created event');
      triggerEngine.handleEvent('job_created', data);
    });

    eventDetector.on('job_completed', (data) => {
      logger.debug('Handling job_completed event');
      triggerEngine.handleEvent('job_completed', data);
    });

    // Invoice events
    eventDetector.on('invoice_created', (data) => {
      logger.debug('Handling invoice_created event');
      triggerEngine.handleEvent('invoice_created', data);
    });

    eventDetector.on('invoice_overdue', (data) => {
      logger.debug('Handling invoice_overdue event');
      triggerEngine.handleEvent('invoice_overdue', data);
    });

    // Appointment events
    eventDetector.on('appointment_created', (data) => {
      logger.debug('Handling appointment_created event');
      triggerEngine.handleEvent('appointment_created', data);
    });

    // Install job created - move opportunity from Sales to Install pipeline
    eventDetector.on('install_job_created', async (data) => {
      logger.info('Handling install_job_created event', {
        jobId: data.jobId,
        customerId: data.customerId,
        businessUnit: data.businessUnit
      });

      if (process.env.GHL_SYNC_ENABLED === 'true') {
        try {
          await moveOpportunityToInstallPipeline(data.jobId, data.customerId);
          logger.info('✅ Opportunity moved to Install Pipeline', {
            jobId: data.jobId,
            customerId: data.customerId
          });
        } catch (error) {
          logger.error('Failed to move opportunity to Install Pipeline', {
            jobId: data.jobId,
            customerId: data.customerId,
            error: error.message
          });
        }
      }
    });

    logger.info('Event handlers configured');
  }

  async stop() {
    logger.info('Stopping workflow system...');

    // Stop Install Pipeline checker
    if (this.installPipelineInterval) {
      clearInterval(this.installPipelineInterval);
      this.installPipelineInterval = null;
      logger.info('Install Pipeline checker stopped');
    }

    eventDetector.stop();
    executionEngine.stop();

    this.isRunning = false;
    logger.info('Workflow system stopped');
  }

  isActive() {
    return this.isRunning;
  }
}

export const workflowManager = new WorkflowManager();

export default WorkflowManager;
