/**
 * Chat Controller
 * HTTP API endpoints for the pricebook chat agent
 */

import { Router } from 'express';
import { createLogger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('chat-controller');

/**
 * Create chat router
 * @param {import('./pricebook-chat.agent.js').PricebookChatAgent} chatAgent
 * @returns {Router}
 */
export function createChatRouter(chatAgent) {
  const router = Router();

  /**
   * POST /api/chat/message
   * Send a message and get a response
   */
  router.post('/message', async (req, res) => {
    try {
      const { sessionId, message, userId, userName } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Message is required and must be a string',
        });
      }

      // Use provided sessionId or generate one
      const effectiveSessionId = sessionId || uuidv4();

      logger.info({ sessionId: effectiveSessionId, messageLength: message.length }, 'Chat message received');

      const response = await chatAgent.processMessage(effectiveSessionId, message, {
        userId,
        userName,
      });

      res.json({
        success: true,
        sessionId: effectiveSessionId,
        ...response,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Chat message processing failed');
      res.status(500).json({
        success: false,
        error: 'Failed to process message',
        details: error.message,
      });
    }
  });

  /**
   * GET /api/chat/history/:sessionId
   * Get conversation history for a session
   */
  router.get('/history/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { limit = 50 } = req.query;

      const history = await chatAgent.contextManager.getHistory(sessionId, parseInt(limit, 10));

      res.json({
        success: true,
        sessionId,
        count: history.length,
        history,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get chat history');
      res.status(500).json({
        success: false,
        error: 'Failed to get history',
      });
    }
  });

  /**
   * DELETE /api/chat/session/:sessionId
   * Clear a chat session
   */
  router.delete('/session/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      await chatAgent.contextManager.clearContext(sessionId);

      res.json({
        success: true,
        message: 'Session cleared',
        sessionId,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to clear session');
      res.status(500).json({
        success: false,
        error: 'Failed to clear session',
      });
    }
  });

  /**
   * GET /api/chat/session/:sessionId
   * Get session context
   */
  router.get('/session/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;

      const context = await chatAgent.contextManager.getContext(sessionId);

      res.json({
        success: true,
        sessionId,
        context: {
          historyLength: context.history?.length || 0,
          lastCategory: context.lastCategory,
          hasPendingAction: !!context.pendingAction,
          pendingActionType: context.pendingAction?.type,
          createdAt: context.createdAt,
          updatedAt: context.updatedAt,
        },
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get session');
      res.status(500).json({
        success: false,
        error: 'Failed to get session',
      });
    }
  });

  /**
   * POST /api/chat/session/:sessionId/cancel
   * Cancel pending action in a session
   */
  router.post('/session/:sessionId/cancel', async (req, res) => {
    try {
      const { sessionId } = req.params;

      await chatAgent.contextManager.clearPendingAction(sessionId);

      res.json({
        success: true,
        message: 'Pending action cancelled',
        sessionId,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to cancel pending action');
      res.status(500).json({
        success: false,
        error: 'Failed to cancel pending action',
      });
    }
  });

  /**
   * GET /api/chat/sessions
   * Get all active sessions (admin endpoint)
   */
  router.get('/sessions', async (req, res) => {
    try {
      const sessions = await chatAgent.contextManager.getActiveSessions();

      res.json({
        success: true,
        count: sessions.length,
        sessions,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get sessions');
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
      });
    }
  });

  /**
   * POST /api/chat/cleanup
   * Clean up expired sessions (admin endpoint)
   */
  router.post('/cleanup', async (req, res) => {
    try {
      const cleaned = await chatAgent.contextManager.cleanupExpiredSessions();

      res.json({
        success: true,
        message: `Cleaned ${cleaned} expired sessions`,
        cleaned,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to cleanup sessions');
      res.status(500).json({
        success: false,
        error: 'Failed to cleanup sessions',
      });
    }
  });

  /**
   * POST /api/chat/quick-query
   * Quick query without maintaining session (stateless)
   */
  router.post('/quick-query', async (req, res) => {
    try {
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Query is required',
        });
      }

      // Use a temporary session
      const tempSessionId = `temp-${uuidv4()}`;
      
      const response = await chatAgent.processMessage(tempSessionId, query);

      // Clean up temp session
      await chatAgent.contextManager.clearContext(tempSessionId);

      res.json({
        success: true,
        ...response,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Quick query failed');
      res.status(500).json({
        success: false,
        error: 'Query failed',
      });
    }
  });

  /**
   * GET /api/chat/suggestions
   * Get suggested queries based on pricebook state
   */
  router.get('/suggestions', async (req, res) => {
    try {
      const prisma = chatAgent.prisma;

      // Get some category names for suggestions
      const categories = await prisma.pricebookCategory.findMany({
        where: { active: true, deletedAt: null, parentId: null },
        select: { name: true },
        take: 5,
      });

      const suggestions = [
        'Show all categories',
        'Help',
        ...categories.map(c => `Show ${c.name} materials`),
        'Search for EMT',
        'Create a new material',
      ];

      res.json({
        success: true,
        suggestions,
      });
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to get suggestions');
      res.status(500).json({
        success: false,
        error: 'Failed to get suggestions',
      });
    }
  });

  return router;
}

export default createChatRouter;
