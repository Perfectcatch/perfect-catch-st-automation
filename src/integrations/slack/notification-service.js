/**
 * Slack Notification Service
 * Real-time notifications to Slack channels
 */

import { slackClient } from './slack-client.js';
import pg from 'pg';

const { Pool } = pg;

let pool = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

class SlackNotificationService {
  
  /**
   * Get channel from environment
   */
  getChannel(type) {
    const channels = {
      dispatch: process.env.SLACK_DISPATCH_CHANNEL,
      sales: process.env.SLACK_SALES_CHANNEL,
      accounting: process.env.SLACK_ACCOUNTING_CHANNEL,
      emergency: process.env.SLACK_EMERGENCY_CHANNEL,
      reports: process.env.SLACK_REPORTS_CHANNEL
    };
    return channels[type];
  }
  
  /**
   * Notify new job created
   */
  async notifyNewJob(job) {
    const channel = this.getChannel('dispatch');
    if (!channel) return;
    
    try {
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🆕 New Job Created' }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Job #*\n${job.job_number}` },
              { type: 'mrkdwn', text: `*Customer*\n${job.customer?.name || 'Unknown'}` },
              { type: 'mrkdwn', text: `*Service*\n${job.summary || job.job_type_name}` },
              { type: 'mrkdwn', text: `*Priority*\n${job.priority || 'Standard'}` }
            ]
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Schedule Now' },
                style: 'primary',
                action_id: 'schedule_job',
                value: job.st_id?.toString()
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Details' },
                action_id: 'view_job',
                value: job.st_id?.toString()
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify new job:', error);
    }
  }
  
  /**
   * Notify estimate approved/sold
   */
  async notifyEstimateApproved(estimate) {
    const channel = this.getChannel('sales');
    if (!channel) return;
    
    try {
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '✅ Estimate Approved!' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${estimate.customer?.name || 'Customer'}* approved estimate #${estimate.estimate_number}\n\n💰 Amount: $${Number(estimate.total).toFixed(2)}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Create Job' },
                style: 'primary',
                action_id: 'create_job_from_estimate',
                value: estimate.st_id?.toString()
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify estimate approved:', error);
    }
  }
  
  /**
   * Notify emergency call
   */
  async notifyEmergencyCall(job) {
    const channel = this.getChannel('emergency');
    const oncallUser = process.env.SLACK_ONCALL_USER;
    if (!channel) return;
    
    try {
      const mention = oncallUser ? `<@${oncallUser}>` : '@here';
      
      await slackClient.sendMessage(channel, {
        text: `🚨 ${mention} Emergency Call!`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '🚨 EMERGENCY CALL' }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Customer:* ${job.customer?.name || 'Unknown'}\n*Location:* ${job.location?.address_line1 || job.address || 'Unknown'}\n*Issue:* ${job.summary || 'Emergency service needed'}\n\n${mention} Please respond immediately`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: "I'll Take It" },
                style: 'danger',
                action_id: 'accept_emergency',
                value: job.st_id?.toString()
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Call Customer' },
                action_id: 'call_customer',
                url: `tel:${job.customer?.phone || ''}`
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify emergency call:', error);
    }
  }
  
  /**
   * Notify job completed
   */
  async notifyJobCompleted(job) {
    const channel = this.getChannel('accounting');
    if (!channel) return;
    
    try {
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `✅ Job #${job.job_number} completed by ${job.technician?.name || 'technician'}\nReady for invoicing`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Create Invoice' },
                style: 'primary',
                action_id: 'create_invoice',
                value: job.st_id?.toString()
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify job completed:', error);
    }
  }
  
  /**
   * Notify payment received
   */
  async notifyPaymentReceived(payment) {
    const channel = this.getChannel('accounting');
    if (!channel) return;
    
    try {
      await slackClient.sendMessage(channel, {
        text: `💰 Payment received: $${Number(payment.amount).toFixed(2)} from ${payment.customer?.name || 'customer'}`
      });
    } catch (error) {
      console.error('Failed to notify payment received:', error);
    }
  }
  
  /**
   * Notify invoice overdue
   */
  async notifyInvoiceOverdue(invoice) {
    const channel = this.getChannel('accounting');
    if (!channel) return;
    
    try {
      const daysOverdue = invoice.due_date 
        ? Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86400000)
        : 0;
      
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⚠️ *Invoice Overdue*\n\nInvoice #${invoice.invoice_number} - $${Number(invoice.balance || invoice.total).toFixed(2)}\nCustomer: ${invoice.customer?.name || 'Unknown'}\n${daysOverdue} days overdue`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'Send Reminder' },
                action_id: 'send_invoice_reminder',
                value: invoice.st_id?.toString()
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify invoice overdue:', error);
    }
  }
  
  /**
   * Send daily report
   */
  async sendDailyReport() {
    const channel = this.getChannel('reports');
    if (!channel) return;
    
    const client = await getPool().connect();
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const [jobsResult, revenueResult, appointmentsResult] = await Promise.all([
        client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE job_status = 'Completed') as completed,
            COUNT(*) FILTER (WHERE job_status = 'Canceled') as canceled
          FROM st_jobs
          WHERE st_created_on >= $1
        `, [today]),
        client.query(`
          SELECT COALESCE(SUM(total), 0) as revenue
          FROM st_invoices
          WHERE st_created_on >= $1
        `, [today]),
        client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE status = 'Completed') as completed
          FROM st_appointments
          WHERE DATE(start_on) = $1
        `, [today.toISOString().split('T')[0]])
      ]);
      
      const jobs = jobsResult.rows[0];
      const revenue = Number(revenueResult.rows[0].revenue);
      const appointments = appointmentsResult.rows[0];
      
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `📊 Daily Report - ${today.toLocaleDateString()}` }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Jobs Created*\n${jobs.total}` },
              { type: 'mrkdwn', text: `*Jobs Completed*\n${jobs.completed}` },
              { type: 'mrkdwn', text: `*Revenue*\n$${revenue.toFixed(2)}` },
              { type: 'mrkdwn', text: `*Appointments*\n${appointments.completed}/${appointments.total}` }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'context',
            elements: [
              { type: 'mrkdwn', text: 'Generated automatically by Perfect Catch' }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send daily report:', error);
    } finally {
      client.release();
    }
  }
  
  /**
   * Send weekly summary
   */
  async sendWeeklySummary() {
    const channel = this.getChannel('reports');
    if (!channel) return;
    
    const client = await getPool().connect();
    try {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);
      
      const [jobsResult, revenueResult, topCustomers] = await Promise.all([
        client.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE job_status = 'Completed') as completed
          FROM st_jobs
          WHERE st_created_on >= $1
        `, [weekAgo]),
        client.query(`
          SELECT COALESCE(SUM(total), 0) as revenue
          FROM st_invoices
          WHERE st_created_on >= $1
        `, [weekAgo]),
        client.query(`
          SELECT c.name, SUM(i.total) as total
          FROM st_invoices i
          JOIN st_jobs j ON i.job_id = j.st_id
          JOIN st_customers c ON j.customer_id = c.st_id
          WHERE i.st_created_on >= $1
          GROUP BY c.st_id, c.name
          ORDER BY total DESC
          LIMIT 5
        `, [weekAgo])
      ]);
      
      const jobs = jobsResult.rows[0];
      const revenue = Number(revenueResult.rows[0].revenue);
      
      let topCustomersList = topCustomers.rows.map((c, i) => 
        `${i + 1}. ${c.name} - $${Number(c.total).toFixed(2)}`
      ).join('\n');
      
      await slackClient.sendMessage(channel, {
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: '📈 Weekly Summary' }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Total Jobs*\n${jobs.total}` },
              { type: 'mrkdwn', text: `*Completed*\n${jobs.completed}` },
              { type: 'mrkdwn', text: `*Revenue*\n$${revenue.toFixed(2)}` },
              { type: 'mrkdwn', text: `*Completion Rate*\n${jobs.total > 0 ? ((jobs.completed / jobs.total) * 100).toFixed(1) : 0}%` }
            ]
          },
          {
            type: 'divider'
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Top Customers This Week*\n${topCustomersList || 'No data'}`
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to send weekly summary:', error);
    } finally {
      client.release();
    }
  }
  
  /**
   * Notify technician assignment
   */
  async notifyTechnicianAssignment(appointment, technician) {
    // Send DM to technician if we have their Slack ID
    const techSlackId = technician.slack_user_id;
    if (!techSlackId) return;
    
    try {
      await slackClient.sendMessage(techSlackId, {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📋 *New Assignment*\n\n*Time:* ${new Date(appointment.start_on).toLocaleString()}\n*Customer:* ${appointment.customer?.name || 'Unknown'}\n*Address:* ${appointment.address || 'See job details'}\n*Service:* ${appointment.summary || 'Service call'}`
            }
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View Details' },
                action_id: 'view_appointment',
                value: appointment.st_id?.toString()
              }
            ]
          }
        ]
      });
    } catch (error) {
      console.error('Failed to notify technician assignment:', error);
    }
  }
  
  /**
   * Send custom notification
   */
  async sendCustomNotification(channel, message, blocks) {
    const targetChannel = this.getChannel(channel) || channel;
    if (!targetChannel) return;
    
    try {
      await slackClient.sendMessage(targetChannel, blocks ? { blocks } : { text: message });
    } catch (error) {
      console.error('Failed to send custom notification:', error);
    }
  }
}

export const slackNotifications = new SlackNotificationService();
