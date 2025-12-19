/**
 * Slack Client
 * Core Slack integration client for Perfect Catch
 */

import { WebClient } from '@slack/web-api';

class SlackClient {
  constructor() {
    this.web = null;
    this.eventHandlers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the Slack client
   */
  init() {
    if (this.initialized) return;
    
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      console.warn('SLACK_BOT_TOKEN not set - Slack integration disabled');
      return;
    }
    
    this.web = new WebClient(token);
    this.initialized = true;
    console.log('Slack client initialized');
  }

  /**
   * Ensure client is initialized
   */
  ensureInitialized() {
    if (!this.initialized) {
      this.init();
    }
    if (!this.web) {
      throw new Error('Slack client not initialized - check SLACK_BOT_TOKEN');
    }
  }

  /**
   * Register event handler
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType).push(handler);
  }

  /**
   * Emit event to handlers
   */
  async emit(eventType, event) {
    const handlers = this.eventHandlers.get(eventType) || [];
    for (const handler of handlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`Slack event handler error (${eventType}):`, error);
      }
    }
  }

  /**
   * Handle app mention (@bot)
   */
  async handleMention(event) {
    const { user, text, channel } = event;
    
    // Remove bot mention from text
    const query = text.replace(/<@[A-Z0-9]+>/gi, '').trim();
    
    // Use conversational AI to understand and respond
    const { conversationalBot } = await import('./conversational-bot.js');
    const response = await conversationalBot.process(query, { user, channel });
    
    await this.sendMessage(channel, response);
  }

  /**
   * Handle direct message
   */
  async handleDirectMessage(event) {
    const { user, text, channel } = event;
    
    // Ignore bot's own messages
    if (event.bot_id) return;
    
    // Process as conversational query
    const { conversationalBot } = await import('./conversational-bot.js');
    const response = await conversationalBot.process(text, { user, channel });
    
    await this.sendMessage(channel, response);
  }

  /**
   * Send message to channel
   */
  async sendMessage(channel, content) {
    this.ensureInitialized();
    
    const options = typeof content === 'string' 
      ? { text: content }
      : content;
    
    try {
      const result = await this.web.chat.postMessage({
        channel,
        ...options
      });
      return result;
    } catch (error) {
      console.error('Slack sendMessage error:', error);
      throw error;
    }
  }

  /**
   * Send ephemeral message (only visible to one user)
   */
  async sendEphemeral(channel, user, content) {
    this.ensureInitialized();
    
    const options = typeof content === 'string'
      ? { text: content }
      : content;
    
    try {
      const result = await this.web.chat.postEphemeral({
        channel,
        user,
        ...options
      });
      return result;
    } catch (error) {
      console.error('Slack sendEphemeral error:', error);
      throw error;
    }
  }

  /**
   * Update existing message
   */
  async updateMessage(channel, ts, content) {
    this.ensureInitialized();
    
    const options = typeof content === 'string'
      ? { text: content }
      : content;
    
    try {
      const result = await this.web.chat.update({
        channel,
        ts,
        ...options
      });
      return result;
    } catch (error) {
      console.error('Slack updateMessage error:', error);
      throw error;
    }
  }

  /**
   * Delete message
   */
  async deleteMessage(channel, ts) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.chat.delete({
        channel,
        ts
      });
      return result;
    } catch (error) {
      console.error('Slack deleteMessage error:', error);
      throw error;
    }
  }

  /**
   * Open modal
   */
  async openModal(triggerId, view) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.views.open({
        trigger_id: triggerId,
        view
      });
      return result;
    } catch (error) {
      console.error('Slack openModal error:', error);
      throw error;
    }
  }

  /**
   * Update modal
   */
  async updateModal(viewId, view) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.views.update({
        view_id: viewId,
        view
      });
      return result;
    } catch (error) {
      console.error('Slack updateModal error:', error);
      throw error;
    }
  }

  /**
   * Get user info
   */
  async getUserInfo(userId) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.users.info({ user: userId });
      return result.user;
    } catch (error) {
      console.error('Slack getUserInfo error:', error);
      throw error;
    }
  }

  /**
   * Get channel info
   */
  async getChannelInfo(channelId) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.conversations.info({ channel: channelId });
      return result.channel;
    } catch (error) {
      console.error('Slack getChannelInfo error:', error);
      throw error;
    }
  }

  /**
   * List channels
   */
  async listChannels() {
    this.ensureInitialized();
    
    try {
      const result = await this.web.conversations.list({
        types: 'public_channel,private_channel'
      });
      return result.channels;
    } catch (error) {
      console.error('Slack listChannels error:', error);
      throw error;
    }
  }

  /**
   * Add reaction to message
   */
  async addReaction(channel, timestamp, emoji) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.reactions.add({
        channel,
        timestamp,
        name: emoji
      });
      return result;
    } catch (error) {
      console.error('Slack addReaction error:', error);
      throw error;
    }
  }

  /**
   * Upload file
   */
  async uploadFile(channels, filename, content, title) {
    this.ensureInitialized();
    
    try {
      const result = await this.web.files.uploadV2({
        channels,
        filename,
        content,
        title
      });
      return result;
    } catch (error) {
      console.error('Slack uploadFile error:', error);
      throw error;
    }
  }
}

export const slackClient = new SlackClient();
