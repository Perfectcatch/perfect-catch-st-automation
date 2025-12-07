/**
 * Intent Classifier
 * Uses OpenAI GPT-4 to classify user intent from natural language
 */

import OpenAI from 'openai';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('intent-classifier');

// Intent types
const INTENTS = {
  QUERY_MATERIALS: 'query_materials',
  QUERY_SERVICES: 'query_services',
  QUERY_EQUIPMENT: 'query_equipment',
  QUERY_CATEGORIES: 'query_categories',
  CREATE_MATERIAL: 'create_material',
  CREATE_MULTIPLE_MATERIALS: 'create_multiple_materials',
  CREATE_SERVICE: 'create_service',
  UPDATE_MATERIAL: 'update_material',
  UPDATE_SERVICE: 'update_service',
  DELETE_MATERIAL: 'delete_material',
  SEARCH_PRICEBOOK: 'search_pricebook',
  // Job/Estimate intents
  SET_JOB: 'set_job',
  ADD_ITEMS: 'add_items',
  SHOW_ESTIMATE: 'show_estimate',
  SHOW_TOTAL: 'show_total',
  CREATE_ESTIMATE: 'create_estimate',
  CLEAR_ESTIMATE: 'clear_estimate',
  REMOVE_ITEM: 'remove_item',
  CONFIRM_YES: 'confirm_yes',
  CONFIRM_NO: 'confirm_no',
  HELP: 'help',
  UNKNOWN: 'unknown',
};

export class IntentClassifier {
  /**
   * @param {string} apiKey - OpenAI API key
   */
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.logger = logger;
  }

  /**
   * Classify user intent
   * @param {string} message - User message
   * @param {Object} context - Conversation context
   * @returns {Promise<Object>} Intent classification result
   */
  async classify(message, context = {}) {
    // Try rule-based classification first (faster, no API call)
    const ruleBasedIntent = this.classifyByRules(message);
    if (ruleBasedIntent.confidence > 0.9) {
      return ruleBasedIntent;
    }

    // Fall back to GPT for complex cases
    try {
      return await this.classifyWithGPT(message, context);
    } catch (error) {
      this.logger.error({ error: error.message }, 'GPT classification failed, using rule-based');
      return ruleBasedIntent;
    }
  }

  /**
   * Rule-based intent classification
   * @param {string} message
   * @returns {Object}
   */
  classifyByRules(message) {
    const lowerMessage = message.toLowerCase().trim();

    // Help intent
    if (/^(help|what can you do|\?|commands|options)$/i.test(lowerMessage)) {
      return { type: INTENTS.HELP, confidence: 1.0, entities: {} };
    }

    // Query categories
    if (/\b(list|show|get|display|what)\b.*\b(categories|category)\b/i.test(lowerMessage) ||
        /^categories$/i.test(lowerMessage)) {
      return { type: INTENTS.QUERY_CATEGORIES, confidence: 0.95, entities: {} };
    }

    // Query materials
    if (/\b(show|list|get|display|what|view)\b.*\b(materials?|items?|products?)\b/i.test(lowerMessage) ||
        /\bmaterials?\s+(in|for|from)\b/i.test(lowerMessage)) {
      const category = this.extractCategoryFromMessage(lowerMessage);
      return { type: INTENTS.QUERY_MATERIALS, confidence: 0.9, entities: { category } };
    }

    // Query services
    if (/\b(show|list|get|display)\b.*\bservices?\b/i.test(lowerMessage)) {
      const category = this.extractCategoryFromMessage(lowerMessage);
      return { type: INTENTS.QUERY_SERVICES, confidence: 0.9, entities: { category } };
    }

    // Query equipment
    if (/\b(show|list|get|display)\b.*\bequipment\b/i.test(lowerMessage)) {
      const category = this.extractCategoryFromMessage(lowerMessage);
      return { type: INTENTS.QUERY_EQUIPMENT, confidence: 0.9, entities: { category } };
    }

    // Create materials (multiple)
    if (/\b(create|add|make|new)\b.*\b(and|,)\b/i.test(lowerMessage) &&
        !/\bservice\b/i.test(lowerMessage)) {
      return { type: INTENTS.CREATE_MULTIPLE_MATERIALS, confidence: 0.85, entities: {} };
    }

    // Create material (single)
    if (/\b(create|add|make|new)\b.*\b(material|item|product)\b/i.test(lowerMessage) ||
        /\b(create|add)\b\s+\d/i.test(lowerMessage)) {
      return { type: INTENTS.CREATE_MATERIAL, confidence: 0.85, entities: {} };
    }

    // Create service
    if (/\b(create|add|make|new)\b.*\bservice\b/i.test(lowerMessage)) {
      return { type: INTENTS.CREATE_SERVICE, confidence: 0.85, entities: {} };
    }

    // Update material
    if (/\b(update|change|modify|edit|set)\b.*\b(price|cost|name|material)\b/i.test(lowerMessage)) {
      return { type: INTENTS.UPDATE_MATERIAL, confidence: 0.85, entities: {} };
    }

    // Search
    if (/\b(search|find|look\s+for|locate)\b/i.test(lowerMessage)) {
      const searchTerm = lowerMessage.replace(/\b(search|find|look\s+for|locate)\b/gi, '').trim();
      return { type: INTENTS.SEARCH_PRICEBOOK, confidence: 0.9, entities: { searchTerm } };
    }

    // Job/Estimate intents
    // Set job context
    if (/\b(start|begin|new|for)\b.*\b(estimate|job|quote)\b/i.test(lowerMessage) ||
        /\bjob\s*#?\s*\d+/i.test(lowerMessage) ||
        /\bfor\s+(the\s+)?\w+.*\bjob\b/i.test(lowerMessage)) {
      const jobInfo = this.extractJobInfo(lowerMessage);
      return { type: INTENTS.SET_JOB, confidence: 0.95, entities: jobInfo };
    }

    // Add items to estimate
    if (/\b(add|include|put|throw\s+in)\b/i.test(lowerMessage) && 
        !/\b(material|service|category)\b/i.test(lowerMessage)) {
      return { type: INTENTS.ADD_ITEMS, confidence: 0.9, entities: { itemsText: lowerMessage } };
    }

    // Show current estimate
    if (/\b(show|view|see|what'?s)\b.*\b(estimate|quote|current|so\s+far)\b/i.test(lowerMessage) ||
        /\bcurrent\s+(estimate|total|items)\b/i.test(lowerMessage)) {
      return { type: INTENTS.SHOW_ESTIMATE, confidence: 0.95, entities: {} };
    }

    // Show total
    if (/\b(total|sum|how\s+much|price|cost)\b/i.test(lowerMessage) &&
        /\b(so\s+far|current|estimate|is\s+it)\b/i.test(lowerMessage)) {
      return { type: INTENTS.SHOW_TOTAL, confidence: 0.95, entities: {} };
    }

    // Create/push estimate to ServiceTitan
    if (/\b(create|push|submit|send|finalize)\b.*\b(estimate|quote)\b/i.test(lowerMessage) ||
        /\bpush\s+to\s+(st|servicetitan)\b/i.test(lowerMessage)) {
      return { type: INTENTS.CREATE_ESTIMATE, confidence: 0.95, entities: {} };
    }

    // Clear estimate
    if (/\b(clear|reset|start\s+over|cancel)\b.*\b(estimate|quote|items)\b/i.test(lowerMessage)) {
      return { type: INTENTS.CLEAR_ESTIMATE, confidence: 0.95, entities: {} };
    }

    // Remove item from estimate
    if (/\b(remove|delete|take\s+off)\b/i.test(lowerMessage)) {
      return { type: INTENTS.REMOVE_ITEM, confidence: 0.9, entities: { itemsText: lowerMessage } };
    }

    // Confirmation responses
    if (/^(yes|yeah|yep|sure|ok|okay|do\s+it|confirm|go\s+ahead|create\s+it)$/i.test(lowerMessage)) {
      return { type: INTENTS.CONFIRM_YES, confidence: 0.95, entities: {} };
    }

    if (/^(no|nope|nah|cancel|never\s*mind|not\s+yet)$/i.test(lowerMessage)) {
      return { type: INTENTS.CONFIRM_NO, confidence: 0.95, entities: {} };
    }

    // Default to unknown with low confidence
    return { type: INTENTS.UNKNOWN, confidence: 0.3, entities: {} };
  }

  /**
   * GPT-based intent classification
   * @param {string} message
   * @param {Object} context
   * @returns {Promise<Object>}
   */
  async classifyWithGPT(message, context) {
    const systemPrompt = `You are an intent classifier for a pricebook management system with job estimate building.

Classify the user's intent into ONE of these categories:
- query_materials: User wants to see/list materials (e.g., "show me conduit materials")
- query_services: User wants to see/list services
- query_equipment: User wants to see/list equipment
- query_categories: User wants to see categories (e.g., "list categories", "what categories are there")
- create_material: User wants to create a single material
- create_multiple_materials: User wants to create multiple materials (e.g., "create 1-inch 90s, tees, and couplers")
- create_service: User wants to create a service
- update_material: User wants to modify an existing material
- search_pricebook: User wants to search for something
- set_job: User wants to start an estimate for a job (e.g., "start estimate for job 12345", "for the Smith pool job")
- add_items: User wants to add items to current estimate (e.g., "add intermatic package", "include heat pump hookup")
- show_estimate: User wants to see current estimate items
- show_total: User wants to see the current total
- create_estimate: User wants to push/create estimate in ServiceTitan (e.g., "create the estimate", "push to ST")
- clear_estimate: User wants to clear/reset the current estimate
- remove_item: User wants to remove an item from estimate
- confirm_yes: User confirms an action (e.g., "yes", "ok", "do it")
- confirm_no: User declines an action (e.g., "no", "cancel")
- help: User wants help or instructions
- unknown: Cannot determine intent

Also extract any entities mentioned:
- category: Category name if mentioned
- materialName: Material name if mentioned
- searchTerm: Search term if searching
- jobId: Job number if mentioned (e.g., "12345" from "job 12345")
- jobName: Job name if mentioned (e.g., "Smith pool" from "the Smith pool job")
- itemNames: Array of item names to add

${context.lastCategory ? `Context: User was last looking at "${context.lastCategory.name}" category.` : ''}
${context.currentJob ? `Context: User is building an estimate for Job #${context.currentJob.jobId || context.currentJob.jobName}.` : ''}

Respond with JSON only:
{"intent": "query_materials", "confidence": 0.95, "entities": {"category": "conduit"}}`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.3,
      max_tokens: 150,
    });

    const content = response.choices[0].message.content.trim();
    
    try {
      const result = JSON.parse(content);
      return {
        type: result.intent || INTENTS.UNKNOWN,
        confidence: result.confidence || 0.5,
        entities: result.entities || {},
      };
    } catch (parseError) {
      this.logger.error({ content }, 'Failed to parse GPT response');
      return { type: INTENTS.UNKNOWN, confidence: 0.3, entities: {} };
    }
  }

  /**
   * Extract job information from message
   * @param {string} message
   * @returns {Object}
   */
  extractJobInfo(message) {
    const info = { jobId: null, jobName: null };

    // Extract job number: "job 12345", "job #12345", "job#12345"
    const jobIdMatch = message.match(/\bjob\s*#?\s*(\d+)/i);
    if (jobIdMatch) {
      info.jobId = jobIdMatch[1];
    }

    // Extract job name: "for the Smith pool job", "the Jones rewire"
    const jobNamePatterns = [
      /\bfor\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[a-z]+)*)\s+(?:job|project)/i,
      /\b(?:the\s+)?([A-Z][a-z]+)(?:'s)?\s+(?:pool|rewire|install|upgrade|repair)/i,
      /\bjob\s+(?:for\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
    ];

    for (const pattern of jobNamePatterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        info.jobName = match[1].trim();
        break;
      }
    }

    return info;
  }

  /**
   * Extract category name from message using simple patterns
   * @param {string} message
   * @returns {string|null}
   */
  extractCategoryFromMessage(message) {
    // Common patterns: "in conduit", "conduit materials", "for electrical"
    const patterns = [
      /\b(?:in|for|from)\s+(?:the\s+)?["']?(\w+)["']?\s*(?:category)?/i,
      /["']?(\w+)["']?\s+(?:materials?|items?|products?|services?|equipment)/i,
      /(?:category|cat)\s*[:=]?\s*["']?(\w+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        // Filter out common words that aren't categories
        const word = match[1].toLowerCase();
        if (!['the', 'all', 'some', 'any', 'my', 'our', 'new'].includes(word)) {
          return match[1];
        }
      }
    }

    return null;
  }
}

export default IntentClassifier;
