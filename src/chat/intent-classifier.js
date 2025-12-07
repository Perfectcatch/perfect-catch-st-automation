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
    const systemPrompt = `You are an intent classifier for a pricebook management system.

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
- help: User wants help or instructions
- unknown: Cannot determine intent

Also extract any entities mentioned:
- category: Category name if mentioned
- materialName: Material name if mentioned
- searchTerm: Search term if searching

${context.lastCategory ? `Context: User was last looking at "${context.lastCategory.name}" category.` : ''}

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
