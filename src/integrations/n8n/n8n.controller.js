/**
 * n8n Controller
 * HTTP API endpoints for n8n webhook integration
 */

import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('n8n-controller');

/**
 * Create n8n router
 * @param {import('./webhook-handler.js').N8nWebhookHandler} webhookHandler
 * @param {import('./webhook-sender.js').WebhookSender} webhookSender
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Router}
 */
export function createN8nRouter(webhookHandler, webhookSender, prisma) {
  const router = Router();

  /**
   * POST /api/n8n/webhook
   * Main webhook endpoint for n8n workflows
   */
  router.post('/webhook', async (req, res) => {
    try {
      const payload = req.body;

      logger.info({ action: payload.action, entity: payload.entity }, 'n8n webhook received');

      const result = await webhookHandler.handleWebhook(payload);

      res.json(result);
    } catch (error) {
      logger.error({ error: error.message }, 'n8n webhook processing failed');
      res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/n8n/batch-create
   * Batch create materials
   */
  router.post('/batch-create', async (req, res) => {
    try {
      const { entity, items, categoryId } = req.body;

      if (!entity || !items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'entity and items array are required',
        });
      }

      let result;

      if (entity === 'materials') {
        result = await webhookHandler.handleWebhook({
          action: 'create',
          entity: 'materials',
          data: { materials: items, categoryId },
        });
      } else {
        return res.status(400).json({
          success: false,
          error: `Batch create not supported for entity: ${entity}`,
        });
      }

      res.json(result);
    } catch (error) {
      logger.error({ error: error.message }, 'Batch create failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/n8n/subscribe
   * Subscribe a webhook URL to events
   */
  router.post('/subscribe', async (req, res) => {
    try {
      const { webhookUrl, events, name, secretKey, headers } = req.body;

      if (!webhookUrl || !events || !Array.isArray(events)) {
        return res.status(400).json({
          success: false,
          error: 'webhookUrl and events array are required',
        });
      }

      // Validate webhook URL
      try {
        new URL(webhookUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid webhook URL',
        });
      }

      // Check if already subscribed
      const existing = await prisma.webhookSubscription.findFirst({
        where: { webhookUrl },
      });

      if (existing) {
        // Update existing subscription
        const updated = await prisma.webhookSubscription.update({
          where: { id: existing.id },
          data: {
            events,
            name,
            secretKey,
            headers: headers || {},
            active: true,
            failureCount: 0,
          },
        });

        return res.json({
          success: true,
          message: 'Subscription updated',
          subscription: {
            id: updated.id,
            webhookUrl: updated.webhookUrl,
            events: updated.events,
          },
        });
      }

      // Create new subscription
      const subscription = await prisma.webhookSubscription.create({
        data: {
          webhookUrl,
          events,
          name,
          secretKey,
          headers: headers || {},
          active: true,
        },
      });

      logger.info({ webhookUrl, events }, 'Webhook subscription created');

      res.json({
        success: true,
        message: 'Subscription created',
        subscription: {
          id: subscription.id,
          webhookUrl: subscription.webhookUrl,
          events: subscription.events,
        },
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to create subscription');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/n8n/unsubscribe
   * Unsubscribe a webhook
   */
  router.post('/unsubscribe', async (req, res) => {
    try {
      const { webhookUrl, subscriptionId } = req.body;

      if (!webhookUrl && !subscriptionId) {
        return res.status(400).json({
          success: false,
          error: 'webhookUrl or subscriptionId is required',
        });
      }

      const where = subscriptionId ? { id: subscriptionId } : { webhookUrl };

      const subscription = await prisma.webhookSubscription.findFirst({ where });

      if (!subscription) {
        return res.status(404).json({
          success: false,
          error: 'Subscription not found',
        });
      }

      await prisma.webhookSubscription.delete({
        where: { id: subscription.id },
      });

      logger.info({ subscriptionId: subscription.id }, 'Webhook subscription deleted');

      res.json({
        success: true,
        message: 'Subscription removed',
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to unsubscribe');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/n8n/subscriptions
   * List all webhook subscriptions
   */
  router.get('/subscriptions', async (req, res) => {
    try {
      const subscriptions = await prisma.webhookSubscription.findMany({
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        count: subscriptions.length,
        subscriptions: subscriptions.map(s => ({
          id: s.id,
          webhookUrl: s.webhookUrl,
          events: s.events,
          name: s.name,
          active: s.active,
          lastTriggeredAt: s.lastTriggeredAt,
          lastStatusCode: s.lastStatusCode,
          failureCount: s.failureCount,
          createdAt: s.createdAt,
        })),
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to list subscriptions');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/n8n/test-webhook
   * Test a webhook URL
   */
  router.post('/test-webhook', async (req, res) => {
    try {
      const { webhookUrl, headers } = req.body;

      if (!webhookUrl) {
        return res.status(400).json({
          success: false,
          error: 'webhookUrl is required',
        });
      }

      const result = await webhookSender.testWebhook(webhookUrl, headers);

      res.json({
        success: result.success,
        ...result,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Webhook test failed');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/n8n/events
   * List available event types
   */
  router.get('/events', (req, res) => {
    res.json({
      success: true,
      events: [
        { type: 'material_created', description: 'Triggered when a material is created' },
        { type: 'material_updated', description: 'Triggered when a material is updated' },
        { type: 'material_deleted', description: 'Triggered when a material is deleted' },
        { type: 'service_created', description: 'Triggered when a service is created' },
        { type: 'service_updated', description: 'Triggered when a service is updated' },
        { type: 'service_deleted', description: 'Triggered when a service is deleted' },
        { type: 'category_created', description: 'Triggered when a category is created' },
        { type: 'sync_started', description: 'Triggered when a sync operation starts' },
        { type: 'sync_completed', description: 'Triggered when a sync operation completes' },
        { type: 'sync_failed', description: 'Triggered when a sync operation fails' },
        { type: 'conflict_detected', description: 'Triggered when a sync conflict is detected' },
        { type: 'conflict_resolved', description: 'Triggered when a conflict is resolved' },
      ],
    });
  });

  /**
   * POST /api/n8n/emit-event
   * Manually emit an event (for testing)
   */
  router.post('/emit-event', async (req, res) => {
    try {
      const { eventType, data } = req.body;

      if (!eventType) {
        return res.status(400).json({
          success: false,
          error: 'eventType is required',
        });
      }

      const result = await webhookSender.sendEvent(eventType, data || {});

      res.json({
        success: true,
        eventType,
        ...result,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to emit event');
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
}

export default createN8nRouter;
