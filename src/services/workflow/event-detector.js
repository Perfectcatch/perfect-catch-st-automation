/**
 * Event Detector
 * Polls ServiceTitan tables for changes and emits events
 */

import { EventEmitter } from 'events';
import pg from 'pg';
import { createLogger } from '../../lib/logger.js';

// GHL sync - lazy loaded to avoid circular dependencies
let syncEstimateToGHL = null;
let syncCustomerToGHL = null;

async function loadGHLSync() {
  if (!syncEstimateToGHL) {
    const module = await import('../../integrations/ghl/sync-estimate-to-ghl.js');
    syncEstimateToGHL = module.syncEstimateToGHL;
    syncCustomerToGHL = module.syncCustomerToGHL;
  }
}

const { Pool } = pg;
const logger = createLogger('event-detector');

// Database connection
let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export class EventDetector extends EventEmitter {
  constructor() {
    super();
    this.lastCheck = {
      estimates: new Date(Date.now() - 60000), // Start 1 minute ago
      jobs: new Date(Date.now() - 60000),
      invoices: new Date(Date.now() - 60000),
      appointments: new Date(Date.now() - 60000)
    };
    this.isRunning = false;
    this.interval = null;
    this.pollIntervalMs = parseInt(process.env.EVENT_POLL_INTERVAL_MS) || 30000;
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Event detector already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting event detector (polling every ${this.pollIntervalMs / 1000} seconds)...`);

    // Poll at configured interval
    this.interval = setInterval(() => this.detectChanges(), this.pollIntervalMs);

    // Run immediately
    await this.detectChanges();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
    logger.info('Event detector stopped');
  }

  async detectChanges() {
    try {
      await Promise.all([
        this.detectEstimateChanges(),
        this.detectJobChanges(),
        this.detectInvoiceChanges(),
        this.detectAppointmentChanges()
      ]);
    } catch (error) {
      logger.error('Error detecting changes', { error: error.message });
    }
  }

  async detectEstimateChanges() {
    const client = await getPool().connect();
    try {
      const lastCheck = this.lastCheck.estimates;

      logger.debug('Checking for estimate changes', {
        lastCheck: lastCheck.toISOString(),
        now: new Date().toISOString()
      });

      // Get estimates created or modified since last check
      const result = await client.query(`
        SELECT e.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM st_estimates e
        LEFT JOIN st_customers c ON e.customer_id = c.st_id
        WHERE e.st_created_on > $1 OR e.st_modified_on > $1
        ORDER BY e.st_created_on DESC
      `, [lastCheck]);

      if (result.rows.length > 0) {
        logger.info('Estimate changes detected', {
          count: result.rows.length,
          lastCheck: lastCheck.toISOString()
        });
      }

      for (const estimate of result.rows) {
        // New estimate created
        if (estimate.st_created_on > lastCheck) {
          this.emit('estimate_created', {
            estimateId: Number(estimate.st_id),
            customerId: Number(estimate.customer_id),
            jobId: Number(estimate.job_id),
            status: estimate.status,
            total: Number(estimate.total),
            customer: {
              name: estimate.customer_name,
              phone: estimate.customer_phone,
              email: estimate.customer_email
            },
            estimate
          });

          logger.info('🆕 NEW ESTIMATE DETECTED', {
            estimateId: Number(estimate.st_id),
            customerId: Number(estimate.customer_id),
            customerName: estimate.customer_name,
            total: Number(estimate.total),
            status: estimate.status,
            createdOn: estimate.st_created_on
          });

          // Auto-sync to GHL (replaces Airtable + n8n workflow)
          // BATCH 10 FIX: Changed to OPT-IN (both master switch AND individual flag must be 'true')
          if (process.env.GHL_SYNC_ENABLED === 'true' && process.env.GHL_AUTO_SYNC_ESTIMATES === 'true') {
            try {
              await loadGHLSync();
              logger.info('Syncing estimate to GHL', { estimateId: Number(estimate.st_id) });
              await syncEstimateToGHL(Number(estimate.st_id));
            } catch (ghlError) {
              logger.error('Failed to sync estimate to GHL', {
                estimateId: Number(estimate.st_id),
                error: ghlError.message
              });
            }
          } else {
            logger.debug('GHL sync disabled, skipping estimate sync', {
              estimateId: Number(estimate.st_id),
              GHL_SYNC_ENABLED: process.env.GHL_SYNC_ENABLED,
              GHL_AUTO_SYNC_ESTIMATES: process.env.GHL_AUTO_SYNC_ESTIMATES
            });
          }
        }

        // Estimate status changed to Sold
        if (estimate.st_modified_on > lastCheck && estimate.status === 'Sold') {
          this.emit('estimate_approved', {
            estimateId: Number(estimate.st_id),
            customerId: Number(estimate.customer_id),
            total: Number(estimate.total),
            soldOn: estimate.sold_on,
            estimate
          });

          logger.info('Event: estimate_approved', {
            estimateId: Number(estimate.st_id)
          });
        }

        // Estimate dismissed
        if (estimate.st_modified_on > lastCheck && estimate.status === 'Dismissed') {
          this.emit('estimate_rejected', {
            estimateId: Number(estimate.st_id),
            customerId: Number(estimate.customer_id),
            estimate
          });
        }
      }

      this.lastCheck.estimates = new Date();
    } finally {
      client.release();
    }
  }

  async detectJobChanges() {
    const client = await getPool().connect();
    try {
      const lastCheck = this.lastCheck.jobs;

      const result = await client.query(`
        SELECT j.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email,
               bu.name as business_unit_name
        FROM st_jobs j
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        LEFT JOIN st_business_units bu ON j.business_unit_id = bu.st_id
        WHERE j.st_created_on > $1 OR j.st_modified_on > $1
        ORDER BY j.st_created_on DESC
      `, [lastCheck]);

      for (const job of result.rows) {
        // New job created
        if (job.st_created_on > lastCheck) {
          this.emit('job_created', {
            jobId: Number(job.st_id),
            customerId: Number(job.customer_id),
            jobNumber: job.job_number,
            status: job.job_status,
            businessUnit: job.business_unit_name,
            customer: {
              name: job.customer_name,
              phone: job.customer_phone,
              email: job.customer_email
            },
            job
          });

          logger.info('Event: job_created', { jobId: Number(job.st_id), businessUnit: job.business_unit_name });

          // Detect Install jobs - emit special event
          if (job.business_unit_name && job.business_unit_name.includes('Install')) {
            this.emit('install_job_created', {
              jobId: Number(job.st_id),
              customerId: Number(job.customer_id),
              jobNumber: job.job_number,
              status: job.job_status,
              businessUnit: job.business_unit_name,
              customer: {
                name: job.customer_name,
                phone: job.customer_phone,
                email: job.customer_email
              },
              job
            });

            logger.info('🔧 INSTALL JOB DETECTED', {
              jobId: Number(job.st_id),
              jobNumber: job.job_number,
              customerName: job.customer_name,
              businessUnit: job.business_unit_name
            });
          }
        }

        // Job completed
        if (job.st_modified_on > lastCheck && job.job_status === 'Completed') {
          this.emit('job_completed', {
            jobId: Number(job.st_id),
            customerId: Number(job.customer_id),
            completedAt: job.job_completion_time,
            businessUnit: job.business_unit_name,
            customer: {
              name: job.customer_name,
              phone: job.customer_phone,
              email: job.customer_email
            },
            job
          });

          logger.info('Event: job_completed', { jobId: Number(job.st_id) });
        }
      }

      this.lastCheck.jobs = new Date();
    } finally {
      client.release();
    }
  }

  async detectInvoiceChanges() {
    const client = await getPool().connect();
    try {
      const lastCheck = this.lastCheck.invoices;

      const result = await client.query(`
        SELECT i.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM st_invoices i
        LEFT JOIN st_customers c ON i.customer_id = c.st_id
        WHERE i.st_created_on > $1 
           OR i.st_modified_on > $1
           OR (i.balance > 0 AND i.due_date < NOW() AND i.status != 'Paid')
        ORDER BY i.st_created_on DESC
      `, [lastCheck]);

      for (const invoice of result.rows) {
        // New invoice
        if (invoice.st_created_on > lastCheck) {
          this.emit('invoice_created', {
            invoiceId: Number(invoice.st_id),
            customerId: Number(invoice.customer_id),
            total: Number(invoice.total),
            balance: Number(invoice.balance),
            dueDate: invoice.due_date,
            customer: {
              name: invoice.customer_name,
              phone: invoice.customer_phone,
              email: invoice.customer_email
            },
            invoice
          });
        }

        // Invoice overdue
        if (invoice.balance > 0 && invoice.due_date && invoice.due_date < new Date()) {
          const daysPastDue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24));
          
          this.emit('invoice_overdue', {
            invoiceId: Number(invoice.st_id),
            customerId: Number(invoice.customer_id),
            balance: Number(invoice.balance),
            daysPastDue,
            customer: {
              name: invoice.customer_name,
              phone: invoice.customer_phone,
              email: invoice.customer_email
            },
            invoice
          });
        }
      }

      this.lastCheck.invoices = new Date();
    } finally {
      client.release();
    }
  }

  async detectAppointmentChanges() {
    const client = await getPool().connect();
    try {
      const lastCheck = this.lastCheck.appointments;

      const result = await client.query(`
        SELECT a.*, j.customer_id, c.name as customer_name, c.phone as customer_phone, c.email as customer_email
        FROM st_appointments a
        LEFT JOIN st_jobs j ON a.job_id = j.st_id
        LEFT JOIN st_customers c ON j.customer_id = c.st_id
        WHERE a.st_created_on > $1
        ORDER BY a.st_created_on DESC
      `, [lastCheck]);

      for (const appointment of result.rows) {
        this.emit('appointment_created', {
          appointmentId: Number(appointment.st_id),
          jobId: Number(appointment.job_id),
          customerId: Number(appointment.customer_id),
          startTime: appointment.start_on,
          customer: {
            name: appointment.customer_name,
            phone: appointment.customer_phone,
            email: appointment.customer_email
          },
          appointment
        });

        logger.info('Event: appointment_created', {
          appointmentId: Number(appointment.st_id)
        });
      }

      this.lastCheck.appointments = new Date();
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const eventDetector = new EventDetector();

export default EventDetector;
