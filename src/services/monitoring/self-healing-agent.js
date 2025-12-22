/**
 * Self-Healing Agent
 * Monitors system health and automatically fixes common issues
 */

import { HealthMonitor } from './health-monitor.js';
import pg from 'pg';
import Anthropic from '@anthropic-ai/sdk';
import { createLogger } from '../../lib/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const { Pool } = pg;
const logger = createLogger('self-healing-agent');

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 3 });
  }
  return pool;
}

export class SelfHealingAgent {
  constructor() {
    this.monitor = new HealthMonitor();
    this.isRunning = false;
    this.checkInterval = parseInt(process.env.HEALTH_CHECK_INTERVAL_MS) || 300000; // 5 minutes
    this.anthropic = null;
    this.interval = null;
  }
  
  async start() {
    if (this.isRunning) {
      logger.warn('Self-healing agent already running');
      return;
    }
    
    this.isRunning = true;
    logger.info(`Starting self-healing agent (checking every ${this.checkInterval / 1000} seconds)...`);
    
    // Initialize Anthropic client if API key is available
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    
    this.interval = setInterval(() => this.runHealthCheck(), this.checkInterval);
    
    // Run immediately
    await this.runHealthCheck();
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('Self-healing agent stopped');
  }
  
  async runHealthCheck() {
    try {
      logger.info('Running automated health check...');
      
      const health = await this.monitor.getSystemHealth();
      
      if (health.status === 'healthy') {
        logger.info('✅ All systems healthy');
        return;
      }
      
      logger.warn('⚠️  Issues detected', {
        status: health.status,
        issues: health.checks.filter(c => c.status !== 'healthy')
      });
      
      // Attempt automated fixes
      for (const check of health.checks) {
        if (check.status !== 'healthy') {
          await this.attemptFix(check);
        }
      }
      
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
    }
  }
  
  async attemptFix(issue) {
    logger.info('Attempting automated fix', { component: issue.component });
    
    switch (issue.component) {
      case 'sync':
        await this.fixSyncEngine(issue);
        break;
      case 'workflow':
        await this.fixWorkflowEngine(issue);
        break;
      case 'workers':
        await this.fixWorkers(issue);
        break;
      case 'database':
        // Database issues require manual intervention
        await this.alertHuman('Database issue detected', issue);
        break;
      default:
        if (this.anthropic) {
          await this.diagnoseWithAI(issue);
        } else {
          logger.warn('No AI available for diagnosis, alerting human');
          await this.alertHuman('Unknown issue', issue);
        }
    }
  }
  
  async fixSyncEngine(issue) {
    const minutesSinceSync = issue.details?.minutesSince || 0;
    
    if (minutesSinceSync > 30) {
      logger.info('Sync stalled, triggering manual sync...');
      
      try {
        // Trigger manual sync
        const { runIncrementalSync } = await import('../sync/sync-orchestrator.js');
        await runIncrementalSync();
        
        logger.info('✅ Manual sync completed successfully');
      } catch (error) {
        logger.error('❌ Manual sync failed', { error: error.message });
        await this.alertHuman('Sync engine failure', { issue, error: error.message });
      }
    }
  }
  
  async fixWorkflowEngine(issue) {
    const stalledCount = issue.details?.stalledInstances || 0;
    
    if (stalledCount > 0) {
      logger.info(`Found ${stalledCount} stalled workflows, restarting...`);
      
      const client = await getPool().connect();
      try {
        // Reset stalled workflows
        const result = await client.query(`
          UPDATE workflow_instances 
          SET next_action_at = NOW()
          WHERE status = 'active' 
            AND next_action_at < NOW() - INTERVAL '1 hour'
          RETURNING id
        `);
        
        logger.info('✅ Stalled workflows restarted', {
          count: result.rowCount
        });
      } finally {
        client.release();
      }
    }
  }
  
  async fixWorkers(issue) {
    logger.info('Workers appear inactive, checking docker containers...');
    
    try {
      const { stdout } = await execAsync('docker ps --filter "name=worker" --format "{{.Names}}"');
      const runningWorkers = stdout.trim().split('\n').filter(Boolean);
      
      if (runningWorkers.length === 0) {
        logger.warn('No worker containers running, attempting restart...');
        
        try {
          await execAsync('docker-compose up -d sync-worker workflow-worker', {
            cwd: '/opt/docker/servicetitan-ai/perfect-catch-st-automation'
          });
          
          logger.info('✅ Workers restarted');
        } catch (restartError) {
          logger.error('Failed to restart workers', { error: restartError.message });
          await this.alertHuman('Worker restart failed', { issue, error: restartError.message });
        }
      } else {
        logger.info('Workers are running', { workers: runningWorkers });
      }
    } catch (error) {
      logger.error('❌ Could not check workers', { error: error.message });
      await this.alertHuman('Worker check failed', { issue, error: error.message });
    }
  }
  
  async diagnoseWithAI(issue) {
    if (!this.anthropic) {
      logger.warn('AI diagnosis unavailable - no API key');
      return;
    }
    
    try {
      logger.info('Using AI to diagnose issue', { component: issue.component });
      
      const systemContext = await this.getSystemContext();
      
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: `You are a diagnostic AI for Perfect Catch ST Automation.

Available actions you can recommend:
- restart_workers: Restart Docker worker containers
- trigger_sync: Run manual sync
- reset_workflows: Reset stalled workflows
- alert_human: Escalate to human operator

Analyze the issue and respond with a JSON object:
{
  "diagnosis": "Brief explanation of the issue",
  "action": "one of the available actions",
  "confidence": "high/medium/low"
}`,
        messages: [{
          role: 'user',
          content: `System issue detected:

Component: ${issue.component}
Status: ${issue.status}
Details: ${JSON.stringify(issue.details, null, 2)}

System Context:
${JSON.stringify(systemContext, null, 2)}

What's the likely cause and recommended action?`
        }]
      });
      
      const diagnosis = response.content[0].text;
      logger.info('AI diagnosis received', { diagnosis });
      
      // Try to parse JSON response
      try {
        const parsed = JSON.parse(diagnosis);
        
        if (parsed.confidence === 'high') {
          switch (parsed.action) {
            case 'restart_workers':
              await this.fixWorkers(issue);
              break;
            case 'trigger_sync':
              await this.fixSyncEngine(issue);
              break;
            case 'reset_workflows':
              await this.fixWorkflowEngine(issue);
              break;
            default:
              await this.alertHuman('AI recommended human intervention', { issue, diagnosis: parsed });
          }
        } else {
          logger.info('AI confidence too low, alerting human');
          await this.alertHuman('AI diagnosis uncertain', { issue, diagnosis: parsed });
        }
      } catch (parseError) {
        logger.warn('Could not parse AI response, alerting human');
        await this.alertHuman('AI diagnosis unparseable', { issue, rawDiagnosis: diagnosis });
      }
      
    } catch (error) {
      logger.error('AI diagnosis failed', { error: error.message });
    }
  }
  
  async getSystemContext() {
    const client = await getPool().connect();
    try {
      const [recentSyncs, entityCounts] = await Promise.all([
        client.query(`
          SELECT sync_type, status, error_message, started_at
          FROM raw_sync_state
          ORDER BY started_at DESC
          LIMIT 5
        `),
        client.query(`
          SELECT
            (SELECT COUNT(*) FROM customers) as customers,
            (SELECT COUNT(*) FROM jobs) as jobs,
            (SELECT COUNT(*) FROM raw_st_pricebook_services) as services,
            (SELECT COUNT(*) FROM raw_st_technicians) as technicians
        `)
      ]);

      return {
        recentSyncs: recentSyncs.rows,
        entityCounts: entityCounts.rows[0],
        timestamp: new Date()
      };
    } finally {
      client.release();
    }
  }
  
  async alertHuman(subject, details) {
    // Log critical alert
    logger.error('🚨 HUMAN INTERVENTION REQUIRED', {
      subject,
      details
    });
    
    // TODO: Implement actual alerting
    // - Email via SendGrid
    // - SMS via Twilio
    // - Slack webhook
    // - PagerDuty
    
    // For now, just log to a special alert table if it exists
    try {
      const client = await getPool().connect();
      try {
        await client.query(`
          INSERT INTO system_alerts (subject, details, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT DO NOTHING
        `, [subject, JSON.stringify(details)]);
      } catch (e) {
        // Table might not exist, that's okay
      } finally {
        client.release();
      }
    } catch (e) {
      // Ignore errors in alerting
    }
  }
}

// Export singleton
export const selfHealingAgent = new SelfHealingAgent();

export default SelfHealingAgent;
