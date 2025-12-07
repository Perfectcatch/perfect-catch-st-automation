/**
 * Pricebook Chat Routes
 * Conversational AI endpoint for pricebook management
 */

import { Router } from 'express';
import { getPrismaClient } from '../db/prisma.js';
import { stRequest } from '../services/stClient.js';
import { PricebookChatAgent } from '../chat/pricebook-chat.agent.js';
import { createLogger } from '../lib/logger.js';

const router = Router();
const logger = createLogger('pricebook-chat-route');

// Lazy-initialized chat agent (initialized on first request)
let chatAgent = null;

/**
 * Get or initialize the chat agent
 * Uses existing Prisma client and ST client from the project
 */
function getChatAgent() {
  if (!chatAgent) {
    const openaiApiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for chat agent');
    }

    const prisma = getPrismaClient();
    const stClient = { stRequest };
    
    chatAgent = new PricebookChatAgent(prisma, stClient, openaiApiKey);
    logger.info('Pricebook chat agent initialized');
  }
  
  return chatAgent;
}

/**
 * POST /chat/pricebook
 * Send a message to the pricebook chat agent
 * 
 * Body: { sessionId: string, message: string }
 * Returns: { success: boolean, sessionId: string, message: string, data?: object, suggestions?: string[] }
 */
router.post('/pricebook', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    // Validate required fields
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'sessionId is required',
      });
    }

    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message is required and must be a string',
      });
    }

    logger.info({ sessionId, messageLength: message.length }, 'Chat message received');

    // Get the chat agent and process the message
    const agent = getChatAgent();
    const response = await agent.processMessage(sessionId, message);

    res.json({
      success: true,
      sessionId,
      ...response,
    });
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Chat message processing failed');
    
    // Handle specific error types
    if (error.message.includes('OPENAI_API_KEY')) {
      return res.status(503).json({
        success: false,
        error: 'Chat agent not configured. OPENAI_API_KEY is required.',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to process message',
      details: error.message,
    });
  }
});

/**
 * GET /chat/pricebook/health
 * Health check for the chat agent
 */
router.get('/pricebook/health', (req, res) => {
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasDatabase = !!process.env.DATABASE_URL;
  
  res.json({
    success: true,
    status: hasOpenAI && hasDatabase ? 'ready' : 'not_configured',
    checks: {
      openai: hasOpenAI ? 'configured' : 'missing OPENAI_API_KEY',
      database: hasDatabase ? 'configured' : 'missing DATABASE_URL',
    },
  });
});

export default router;
