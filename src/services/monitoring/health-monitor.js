/**
 * Health Monitor Service
 * Provides system health checks for all components
 */

import pg from 'pg';
import { createLogger } from '../../lib/logger.js';

const { Pool } = pg;
const logger = createLogger('health-monitor');

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

export class HealthMonitor {
  async getSystemHealth() {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkSyncEngine(),
      this.checkWorkflowEngine(),
      this.checkWorkers(),
      this.checkIntegrations()
    ]);
    
    const names = ['database', 'sync', 'workflow', 'workers', 'integrations'];
    const results = checks.map((check, index) => ({
      component: names[index],
      status: check.status === 'fulfilled' ? check.value.status : 'error',
      details: check.status === 'fulfilled' ? check.value.details : { error: check.reason?.message }
    }));
    
    const overallStatus = results.every(r => r.status === 'healthy') ? 'healthy' : 
                         results.some(r => r.status === 'critical') ? 'critical' : 'degraded';
    
    return {
      timestamp: new Date(),
      status: overallStatus,
      checks: results
    };
  }
  
  async checkDatabase() {
    const client = await getPool().connect();
    try {
      await client.query('SELECT 1');
      
      const tableResult = await client.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
      `);
      
      const recordCounts = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM customers) as customers,
          (SELECT COUNT(*) FROM jobs) as jobs,
          (SELECT COUNT(*) FROM pricebook_services) as services,
          (SELECT COUNT(*) FROM scheduling_technicians) as technicians
      `);
      
      return {
        status: 'healthy',
        details: {
          connected: true,
          tables: Number(tableResult.rows[0].count),
          records: recordCounts.rows[0]
        }
      };
    } catch (error) {
      return {
        status: 'critical',
        details: { error: error.message }
      };
    } finally {
      client.release();
    }
  }
  
  async checkSyncEngine() {
    const client = await getPool().connect();
    try {
      const lastSyncResult = await client.query(`
        SELECT * FROM pricebook_sync_log
        ORDER BY started_at DESC
        LIMIT 1
      `);
      
      const lastSync = lastSyncResult.rows[0];
      
      if (!lastSync) {
        return {
          status: 'warning',
          details: { message: 'No sync logs found' }
        };
      }
      
      const minutesSinceSync = (Date.now() - new Date(lastSync.started_at).getTime()) / 60000;
      
      return {
        status: minutesSinceSync > 15 ? 'warning' : 'healthy',
        details: {
          lastSync: lastSync.started_at,
          minutesSince: Math.floor(minutesSinceSync),
          lastStatus: lastSync.status,
          syncType: lastSync.sync_type
        }
      };
    } finally {
      client.release();
    }
  }
  
  async checkWorkflowEngine() {
    const client = await getPool().connect();
    try {
      // Check if workflow tables exist
      const tablesExist = await client.query(`
        SELECT COUNT(*) as count FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'workflow_definitions'
      `);

      if (Number(tablesExist.rows[0].count) === 0) {
        return {
          status: 'healthy',
          details: {
            message: 'Workflow engine not configured',
            definitions: 0,
            activeInstances: 0
          }
        };
      }

      const definitionsResult = await client.query(
        'SELECT COUNT(*) as count FROM workflow_definitions WHERE enabled = true'
      );

      const activeResult = await client.query(
        "SELECT COUNT(*) as count FROM workflow_instances WHERE status = 'active'"
      );

      const stalledResult = await client.query(`
        SELECT COUNT(*) as count FROM workflow_instances
        WHERE status = 'active'
          AND next_action_at < NOW() - INTERVAL '1 hour'
      `);

      const definitions = Number(definitionsResult.rows[0].count);
      const activeInstances = Number(activeResult.rows[0].count);
      const stalledInstances = Number(stalledResult.rows[0].count);

      return {
        status: stalledInstances > 0 ? 'warning' : 'healthy',
        details: {
          definitions,
          activeInstances,
          stalledInstances
        }
      };
    } finally {
      client.release();
    }
  }
  
  async checkWorkers() {
    const client = await getPool().connect();
    try {
      // Check if workers are running by looking at recent activity
      const recentSyncsResult = await client.query(`
        SELECT COUNT(*) as count FROM pricebook_sync_log
        WHERE started_at >= NOW() - INTERVAL '6 hours'
      `);
      
      const recentSyncs = Number(recentSyncsResult.rows[0].count);
      
      return {
        status: recentSyncs > 0 ? 'healthy' : 'warning',
        details: {
          recentActivity: recentSyncs > 0,
          recentSyncs
        }
      };
    } finally {
      client.release();
    }
  }
  
  async checkIntegrations() {
    const client = await getPool().connect();
    try {
      // Check pricebook sync health
      const pricebookResult = await client.query(`
        SELECT COUNT(*) as count FROM pricebook_services
      `);

      // Check scheduling data
      const schedulingResult = await client.query(`
        SELECT COUNT(*) as count FROM scheduling_technicians
      `);

      const pricebookServices = Number(pricebookResult.rows[0].count);
      const technicians = Number(schedulingResult.rows[0].count);

      return {
        status: pricebookServices > 0 && technicians > 0 ? 'healthy' : 'warning',
        details: {
          pricebookServices,
          technicians,
          status: pricebookServices > 0 ? 'synced' : 'empty'
        }
      };
    } finally {
      client.release();
    }
  }
}

export const healthMonitor = new HealthMonitor();

export default HealthMonitor;
