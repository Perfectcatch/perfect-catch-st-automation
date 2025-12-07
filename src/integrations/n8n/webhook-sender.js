/**
 * n8n Webhook Sender
 * Sends events to subscribed n8n webhooks
 */

import fetch from 'node-fetch';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('n8n-webhook-sender');

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class WebhookSender {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   */
  constructor(prisma) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Send an event to all subscribed webhooks
   * @param {string} eventType - Type of event
   * @param {Object} data - Event data
   * @returns {Promise<Object>} Results of webhook calls
   */
  async sendEvent(eventType, data) {
    // Get all active subscriptions for this event
    const subscriptions = await this.prisma.webhookSubscription.findMany({
      where: {
        active: true,
        events: { has: eventType },
      },
    });

    if (subscriptions.length === 0) {
      this.logger.debug({ eventType }, 'No subscriptions for event');
      return { sent: 0, failed: 0 };
    }

    const results = {
      sent: 0,
      failed: 0,
      details: [],
    };

    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    for (const subscription of subscriptions) {
      try {
        await this.sendToWebhook(subscription, payload);
        results.sent++;
        results.details.push({
          webhookId: subscription.id,
          status: 'success',
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          webhookId: subscription.id,
          status: 'failed',
          error: error.message,
        });
      }
    }

    this.logger.info({ eventType, sent: results.sent, failed: results.failed }, 'Event sent to webhooks');

    return results;
  }

  /**
   * Send payload to a specific webhook
   * @param {Object} subscription - Webhook subscription
   * @param {Object} payload - Event payload
   * @returns {Promise<void>}
   */
  async sendToWebhook(subscription, payload) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': payload.event,
          'X-Webhook-Timestamp': payload.timestamp,
          ...(subscription.headers || {}),
        };

        // Add secret key if configured
        if (subscription.secretKey) {
          headers['X-Webhook-Secret'] = subscription.secretKey;
        }

        const response = await fetch(subscription.webhookUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          timeout: 10000, // 10 second timeout
        });

        // Update subscription status
        await this.prisma.webhookSubscription.update({
          where: { id: subscription.id },
          data: {
            lastTriggeredAt: new Date(),
            lastStatusCode: response.status,
            lastError: response.ok ? null : `HTTP ${response.status}`,
            failureCount: response.ok ? 0 : subscription.failureCount + 1,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        this.logger.debug(
          { webhookId: subscription.id, url: subscription.webhookUrl },
          'Webhook sent successfully'
        );

        return;
      } catch (error) {
        lastError = error;
        this.logger.warn(
          { webhookId: subscription.id, attempt, error: error.message },
          'Webhook send failed, retrying'
        );

        if (attempt < MAX_RETRIES) {
          await this.sleep(RETRY_DELAY_MS * attempt);
        }
      }
    }

    // All retries failed
    await this.prisma.webhookSubscription.update({
      where: { id: subscription.id },
      data: {
        lastTriggeredAt: new Date(),
        lastError: lastError.message,
        failureCount: subscription.failureCount + 1,
      },
    });

    // Disable webhook if too many failures
    if (subscription.failureCount >= 10) {
      await this.prisma.webhookSubscription.update({
        where: { id: subscription.id },
        data: { active: false },
      });
      this.logger.warn({ webhookId: subscription.id }, 'Webhook disabled due to repeated failures');
    }

    throw lastError;
  }

  /**
   * Send a test event to a webhook
   * @param {string} webhookUrl - URL to test
   * @param {Object} headers - Optional headers
   * @returns {Promise<Object>}
   */
  async testWebhook(webhookUrl, headers = {}) {
    const payload = {
      event: 'test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'This is a test webhook from Perfect Catch Pricebook Engine',
      },
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': 'test',
          ...headers,
        },
        body: JSON.stringify(payload),
        timeout: 10000,
      });

      return {
        success: response.ok,
        statusCode: response.status,
        body: await response.text(),
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Sleep utility
   * @param {number} ms
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default WebhookSender;
