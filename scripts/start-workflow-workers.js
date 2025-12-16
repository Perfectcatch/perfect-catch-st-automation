#!/usr/bin/env node

/**
 * Start Workflow Workers
 * Entry point for the workflow automation system
 * Usage: node scripts/start-workflow-workers.js
 *
 * Batch 10: Added heartbeat for Docker health checks
 */

import dotenv from 'dotenv';
dotenv.config();

import { workflowManager } from '../src/services/workflow/workflow-manager.js';
import { createLogger } from '../src/lib/logger.js';
import { startHeartbeat, stopHeartbeat } from '../src/workers/base-worker.js';

const logger = createLogger('workflow-workers');

async function main() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  STARTING WORKFLOW WORKERS');
  console.log('='.repeat(60));
  console.log('');
  console.log('This will start the event-driven workflow automation system.');
  console.log('');
  console.log('Components:');
  console.log('  - Event Detector: Polls for changes every 30 seconds');
  console.log('  - Trigger Engine: Matches events to workflows');
  console.log('  - Execution Engine: Runs workflow steps every 10 seconds');
  console.log('  - Agent Executor: Uses Claude to interpret actions');
  console.log('');
  console.log('GHL Sync Status:');
  console.log(`  - GHL_SYNC_ENABLED: ${process.env.GHL_SYNC_ENABLED || 'false (default)'}`);
  console.log(`  - GHL_AUTO_SYNC_ESTIMATES: ${process.env.GHL_AUTO_SYNC_ESTIMATES || 'false (default)'}`);
  console.log(`  - GHL_AUTO_SYNC_JOBS: ${process.env.GHL_AUTO_SYNC_JOBS || 'false (default)'}`);
  console.log('');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Start heartbeat for Docker health checks
    startHeartbeat();

    await workflowManager.start();

    console.log('');
    console.log('Workflow system is running');
    console.log('');
    console.log('Press Ctrl+C to stop');
    console.log('');

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('');
      logger.info('Received SIGINT, shutting down...');
      stopHeartbeat();
      await workflowManager.stop();
      console.log('');
      console.log('Workflow system stopped gracefully');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down...');
      stopHeartbeat();
      await workflowManager.stop();
      process.exit(0);
    });

    // Keep process alive
    process.stdin.resume();

  } catch (error) {
    console.log('');
    console.log('='.repeat(60));
    console.log('  FAILED TO START WORKFLOW WORKERS');
    console.log('='.repeat(60));
    console.log('');
    console.log(`Error: ${error.message}`);
    console.log('');

    if (error.stack) {
      console.log('Stack trace:');
      console.log(error.stack);
    }

    console.log('');
    console.log('Troubleshooting:');
    console.log('  1. Check database connection (SERVICETITAN_DATABASE_URL)');
    console.log('  2. Verify Anthropic API key (ANTHROPIC_API_KEY)');
    console.log('  3. Ensure Twilio credentials are set (for SMS)');
    console.log('  4. Check that database migrations have been run');
    console.log('');

    stopHeartbeat();
    process.exit(1);
  }
}

main();
