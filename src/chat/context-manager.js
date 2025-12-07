/**
 * Context Manager
 * Manages conversation context and session state
 * Supports both in-memory and database-backed storage
 */

import { createLogger } from '../lib/logger.js';

const logger = createLogger('context-manager');

// In-memory cache for sessions (fallback when DB is unavailable)
const sessionCache = new Map();

// Maximum history length to keep
const MAX_HISTORY_LENGTH = 20;

// Session expiry time (24 hours)
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

export class ContextManager {
  /**
   * @param {import('@prisma/client').PrismaClient} prisma
   * @param {Object} options
   * @param {boolean} options.useDatabase - Force database mode (default: false for safety)
   */
  constructor(prisma, options = {}) {
    this.prisma = prisma;
    this.logger = logger;
    // Default to in-memory mode for safety (chatSession table may not exist)
    // Set useDatabase: true explicitly if the table exists
    this.useDatabase = options.useDatabase === true && !!prisma;
  }

  /**
   * Get or create conversation context
   * @param {string} sessionId - Unique session identifier
   * @returns {Promise<Object>} Conversation context
   */
  async getContext(sessionId) {
    try {
      if (this.useDatabase) {
        return await this.getContextFromDB(sessionId);
      }
      return this.getContextFromMemory(sessionId);
    } catch (error) {
      this.logger.error({ sessionId, error: error.message }, 'Failed to get context from DB, using memory');
      return this.getContextFromMemory(sessionId);
    }
  }

  /**
   * Save conversation context
   * @param {string} sessionId
   * @param {Object} context
   * @returns {Promise<void>}
   */
  async saveContext(sessionId, context) {
    try {
      // Trim history to max length
      if (context.history && context.history.length > MAX_HISTORY_LENGTH) {
        context.history = context.history.slice(-MAX_HISTORY_LENGTH);
      }

      if (this.useDatabase) {
        await this.saveContextToDB(sessionId, context);
      }
      
      // Always update memory cache
      this.saveContextToMemory(sessionId, context);
    } catch (error) {
      this.logger.error({ sessionId, error: error.message }, 'Failed to save context to DB');
      this.saveContextToMemory(sessionId, context);
    }
  }

  /**
   * Clear a session
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async clearContext(sessionId) {
    try {
      if (this.useDatabase) {
        await this.prisma.chatSession.delete({
          where: { sessionId },
        }).catch(() => {}); // Ignore if not found
      }
      sessionCache.delete(sessionId);
      this.logger.info({ sessionId }, 'Session cleared');
    } catch (error) {
      this.logger.error({ sessionId, error: error.message }, 'Failed to clear session');
    }
  }

  /**
   * Get context from database
   * @param {string} sessionId
   * @returns {Promise<Object>}
   */
  async getContextFromDB(sessionId) {
    let session = await this.prisma.chatSession.findUnique({
      where: { sessionId },
    });

    if (!session) {
      // Create new session
      session = await this.prisma.chatSession.create({
        data: {
          sessionId,
          history: [],
          pendingAction: null,
        },
      });
      this.logger.info({ sessionId }, 'Created new chat session');
    }

    // Check if session is expired
    if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
      // Reset expired session
      session = await this.prisma.chatSession.update({
        where: { sessionId },
        data: {
          history: [],
          pendingAction: null,
          lastCategoryId: null,
          lastCategoryStId: null,
          lastCategoryName: null,
          expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
        },
      });
      this.logger.info({ sessionId }, 'Reset expired session');
    }

    return this.sessionToContext(session);
  }

  /**
   * Save context to database
   * @param {string} sessionId
   * @param {Object} context
   */
  async saveContextToDB(sessionId, context) {
    await this.prisma.chatSession.upsert({
      where: { sessionId },
      create: {
        sessionId,
        history: context.history || [],
        pendingAction: context.pendingAction || null,
        lastCategoryId: context.lastCategory?.id || null,
        lastCategoryStId: context.lastCategory?.stId ? BigInt(context.lastCategory.stId) : null,
        lastCategoryName: context.lastCategory?.name || null,
        userId: context.userId || null,
        userName: context.userName || null,
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
      update: {
        history: context.history || [],
        pendingAction: context.pendingAction || null,
        lastCategoryId: context.lastCategory?.id || null,
        lastCategoryStId: context.lastCategory?.stId ? BigInt(context.lastCategory.stId) : null,
        lastCategoryName: context.lastCategory?.name || null,
        userId: context.userId || null,
        userName: context.userName || null,
        updatedAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
      },
    });
  }

  /**
   * Get context from memory cache
   * @param {string} sessionId
   * @returns {Object}
   */
  getContextFromMemory(sessionId) {
    let context = sessionCache.get(sessionId);

    if (!context) {
      context = this.createEmptyContext(sessionId);
      sessionCache.set(sessionId, context);
      this.logger.info({ sessionId }, 'Created new in-memory session');
    }

    // Check expiry
    if (context.expiresAt && new Date(context.expiresAt) < new Date()) {
      context = this.createEmptyContext(sessionId);
      sessionCache.set(sessionId, context);
      this.logger.info({ sessionId }, 'Reset expired in-memory session');
    }

    return context;
  }

  /**
   * Save context to memory cache
   * @param {string} sessionId
   * @param {Object} context
   */
  saveContextToMemory(sessionId, context) {
    context.expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS).toISOString();
    sessionCache.set(sessionId, context);
  }

  /**
   * Convert database session to context object
   * @param {Object} session
   * @returns {Object}
   */
  sessionToContext(session) {
    return {
      sessionId: session.sessionId,
      history: session.history || [],
      pendingAction: session.pendingAction || null,
      lastCategory: session.lastCategoryId ? {
        id: session.lastCategoryId,
        stId: session.lastCategoryStId?.toString(),
        name: session.lastCategoryName,
      } : null,
      userId: session.userId,
      userName: session.userName,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Create an empty context object
   * @param {string} sessionId
   * @returns {Object}
   */
  createEmptyContext(sessionId) {
    return {
      sessionId,
      history: [],
      pendingAction: null,
      lastCategory: null,
      // Job/Estimate context
      currentJob: null,        // { jobId, jobName, customerId }
      currentEstimate: {       // Running estimate
        items: [],             // [{ id, type, name, code, price, quantity }]
        total: 0,
        createdAt: null,
      },
      awaitingConfirmation: null, // 'create_estimate' | null
      userId: null,
      userName: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
    };
  }

  /**
   * Get session history
   * @param {string} sessionId
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async getHistory(sessionId, limit = 50) {
    const context = await this.getContext(sessionId);
    return context.history.slice(-limit);
  }

  /**
   * Add a message to history
   * @param {string} sessionId
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content
   * @returns {Promise<void>}
   */
  async addToHistory(sessionId, role, content) {
    const context = await this.getContext(sessionId);
    
    context.history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    await this.saveContext(sessionId, context);
  }

  /**
   * Set pending action
   * @param {string} sessionId
   * @param {Object} action
   * @returns {Promise<void>}
   */
  async setPendingAction(sessionId, action) {
    const context = await this.getContext(sessionId);
    context.pendingAction = action;
    await this.saveContext(sessionId, context);
  }

  /**
   * Clear pending action
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async clearPendingAction(sessionId) {
    const context = await this.getContext(sessionId);
    context.pendingAction = null;
    await this.saveContext(sessionId, context);
  }

  /**
   * Set last category
   * @param {string} sessionId
   * @param {Object} category
   * @returns {Promise<void>}
   */
  async setLastCategory(sessionId, category) {
    const context = await this.getContext(sessionId);
    context.lastCategory = category;
    await this.saveContext(sessionId, context);
  }

  /**
   * Get all active sessions (for admin)
   * @returns {Promise<Array>}
   */
  async getActiveSessions() {
    if (this.useDatabase) {
      return this.prisma.chatSession.findMany({
        where: {
          expiresAt: { gt: new Date() },
        },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });
    }

    // Return from memory cache
    const sessions = [];
    const now = new Date();
    
    for (const [sessionId, context] of sessionCache.entries()) {
      if (new Date(context.expiresAt) > now) {
        sessions.push({
          sessionId,
          historyLength: context.history?.length || 0,
          lastCategory: context.lastCategory?.name,
          updatedAt: context.updatedAt,
        });
      }
    }

    return sessions;
  }

  /**
   * Clean up expired sessions
   * @returns {Promise<number>} Number of sessions cleaned
   */
  async cleanupExpiredSessions() {
    let cleaned = 0;

    if (this.useDatabase) {
      const result = await this.prisma.chatSession.deleteMany({
        where: {
          expiresAt: { lt: new Date() },
        },
      });
      cleaned = result.count;
    }

    // Clean memory cache
    const now = new Date();
    for (const [sessionId, context] of sessionCache.entries()) {
      if (new Date(context.expiresAt) < now) {
        sessionCache.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.info({ cleaned }, 'Cleaned up expired sessions');
    }

    return cleaned;
  }
}

export default ContextManager;
