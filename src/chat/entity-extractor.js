/**
 * Entity Extractor
 * Uses OpenAI GPT-4 to extract structured data from natural language
 */

import OpenAI from 'openai';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('entity-extractor');

export class EntityExtractor {
  /**
   * @param {string} apiKey - OpenAI API key
   */
  constructor(apiKey) {
    this.openai = new OpenAI({ apiKey });
    this.logger = logger;
  }

  /**
   * Extract materials from natural language
   * @param {string} message - User message
   * @returns {Promise<Array>} Array of extracted materials
   */
  async extractMaterials(message) {
    // Try rule-based extraction first
    const ruleBasedMaterials = this.extractMaterialsByRules(message);
    if (ruleBasedMaterials.length > 0) {
      return ruleBasedMaterials;
    }

    // Use GPT for complex extraction
    try {
      return await this.extractMaterialsWithGPT(message);
    } catch (error) {
      this.logger.error({ error: error.message }, 'GPT extraction failed');
      return [];
    }
  }

  /**
   * Rule-based material extraction
   * @param {string} message
   * @returns {Array}
   */
  extractMaterialsByRules(message) {
    const materials = [];

    // Pattern: "X-inch Ys" or "X" Ys"
    // Examples: "1-inch 90s", "3/4" elbows", "1/2-inch tees"
    const sizePattern = /(\d+(?:\/\d+)?(?:-|\s)?(?:inch|"|')?\s*)/gi;
    const sizeMatch = message.match(sizePattern);
    const size = sizeMatch ? sizeMatch[0].trim() : null;

    // Common electrical/plumbing items
    const itemPatterns = [
      { pattern: /\b90s?\b|90[\s-]?degree[\s-]?(?:elbow)?s?/gi, name: '90-degree Elbow', type: 'fitting' },
      { pattern: /\btees?\b|t[\s-]?fitting/gi, name: 'Tee', type: 'fitting' },
      { pattern: /\bcouplers?\b|coupling/gi, name: 'Coupler', type: 'fitting' },
      { pattern: /\belbows?\b/gi, name: 'Elbow', type: 'fitting' },
      { pattern: /\bconnectors?\b/gi, name: 'Connector', type: 'fitting' },
      { pattern: /\bstraps?\b/gi, name: 'Strap', type: 'hardware' },
      { pattern: /\bclamps?\b/gi, name: 'Clamp', type: 'hardware' },
      { pattern: /\bbushings?\b/gi, name: 'Bushing', type: 'fitting' },
      { pattern: /\bnipples?\b/gi, name: 'Nipple', type: 'fitting' },
      { pattern: /\breducers?\b/gi, name: 'Reducer', type: 'fitting' },
      { pattern: /\badapters?\b/gi, name: 'Adapter', type: 'fitting' },
      { pattern: /\bunions?\b/gi, name: 'Union', type: 'fitting' },
      { pattern: /\bcaps?\b/gi, name: 'Cap', type: 'fitting' },
      { pattern: /\bplugs?\b/gi, name: 'Plug', type: 'fitting' },
    ];

    for (const { pattern, name, type } of itemPatterns) {
      if (pattern.test(message)) {
        const materialName = size ? `${size} ${name}`.replace(/\s+/g, ' ').trim() : name;
        materials.push({
          name: materialName,
          description: `${materialName} ${type}`,
          size: size || null,
          type,
          unitOfMeasure: 'Each',
        });
      }
    }

    return materials;
  }

  /**
   * GPT-based material extraction
   * @param {string} message
   * @returns {Promise<Array>}
   */
  async extractMaterialsWithGPT(message) {
    const prompt = `Extract materials/items from this message: "${message}"

Return a JSON array of materials with these fields:
- name: Full descriptive name (e.g., "1-inch 90-degree Elbow")
- description: Brief description
- size: Size if mentioned (e.g., "1 inch", "3/4 inch")
- unitOfMeasure: Unit of measure (default "Each")

Examples:
Input: "Create 1-inch 90s and tees"
Output: [
  {"name": "1-inch 90-degree Elbow", "description": "90-degree elbow fitting", "size": "1 inch", "unitOfMeasure": "Each"},
  {"name": "1-inch Tee", "description": "Tee fitting", "size": "1 inch", "unitOfMeasure": "Each"}
]

Input: "Add 3/4" EMT connectors"
Output: [
  {"name": "3/4-inch EMT Connector", "description": "EMT connector fitting", "size": "3/4 inch", "unitOfMeasure": "Each"}
]

Return ONLY the JSON array, no other text.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content.trim();

    try {
      // Handle potential markdown code blocks
      const jsonContent = content.replace(/```json\n?|\n?```/g, '').trim();
      return JSON.parse(jsonContent);
    } catch (parseError) {
      this.logger.error({ content }, 'Failed to parse GPT material extraction');
      return [];
    }
  }

  /**
   * Extract a service from natural language
   * @param {string} message
   * @returns {Promise<Object|null>}
   */
  async extractService(message) {
    // Try rule-based first
    const ruleBasedService = this.extractServiceByRules(message);
    if (ruleBasedService) {
      return ruleBasedService;
    }

    try {
      const prompt = `Extract service details from: "${message}"

Return JSON with:
- name: Service name
- description: Brief description
- price: Price if mentioned (number only)
- durationHours: Duration in hours if mentioned

Example:
Input: "Create a service called Panel Upgrade for $2500"
Output: {"name": "Panel Upgrade", "description": "Electrical panel upgrade service", "price": 2500}

Return ONLY JSON, no other text. Return null if no service can be extracted.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
      });

      const content = response.choices[0].message.content.trim();
      if (content === 'null') return null;

      return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to extract service');
      return null;
    }
  }

  /**
   * Rule-based service extraction
   * @param {string} message
   * @returns {Object|null}
   */
  extractServiceByRules(message) {
    // Pattern: "service called X" or "service named X"
    const nameMatch = message.match(/service\s+(?:called|named)\s+["']?([^"']+?)["']?(?:\s+for|\s*$)/i);
    if (!nameMatch) return null;

    const name = nameMatch[1].trim();
    const priceMatch = message.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
    const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;

    return {
      name,
      description: `${name} service`,
      price,
    };
  }

  /**
   * Extract field values from a message
   * @param {string} message - User message
   * @param {Array<string>} fields - Fields to extract
   * @returns {Promise<Object>} Extracted field values
   */
  async extractFieldValues(message, fields) {
    const values = {};

    // Rule-based extraction for common fields
    if (fields.includes('price')) {
      const priceMatch = message.match(/(?:price|prices?)\s*(?:is|are|:)?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i) ||
                         message.match(/\$\s*([\d,]+(?:\.\d{2})?)/);
      if (priceMatch) {
        values.price = parseFloat(priceMatch[1].replace(',', ''));
      }
    }

    if (fields.includes('cost')) {
      const costMatch = message.match(/(?:cost|costs?)\s*(?:is|are|:)?\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
      if (costMatch) {
        values.cost = parseFloat(costMatch[1].replace(',', ''));
      }
    }

    if (fields.includes('unitOfMeasure')) {
      const unitPatterns = [
        { pattern: /\b(each|per\s+each|ea)\b/i, value: 'Each' },
        { pattern: /\b(box|per\s+box)\b/i, value: 'Box' },
        { pattern: /\b(foot|feet|per\s+foot|ft)\b/i, value: 'Foot' },
        { pattern: /\b(roll|per\s+roll)\b/i, value: 'Roll' },
        { pattern: /\b(bag|per\s+bag)\b/i, value: 'Bag' },
        { pattern: /\b(case|per\s+case)\b/i, value: 'Case' },
        { pattern: /\b(gallon|gal)\b/i, value: 'Gallon' },
        { pattern: /\b(hour|hr)\b/i, value: 'Hour' },
      ];

      for (const { pattern, value } of unitPatterns) {
        if (pattern.test(message)) {
          values.unitOfMeasure = value;
          break;
        }
      }

      // Check for "sold by X" or "by the X"
      const soldByMatch = message.match(/(?:sold|sell|by)\s+(?:the\s+)?(\w+)/i);
      if (soldByMatch && !values.unitOfMeasure) {
        const unit = soldByMatch[1].toLowerCase();
        const unitMap = {
          each: 'Each', box: 'Box', foot: 'Foot', feet: 'Foot',
          roll: 'Roll', bag: 'Bag', case: 'Case', gallon: 'Gallon',
        };
        values.unitOfMeasure = unitMap[unit] || soldByMatch[1];
      }
    }

    // If we couldn't extract all fields with rules, try GPT
    const missingFields = fields.filter(f => !(f in values));
    if (missingFields.length > 0 && Object.keys(values).length < fields.length) {
      try {
        const gptValues = await this.extractFieldValuesWithGPT(message, missingFields);
        Object.assign(values, gptValues);
      } catch (error) {
        this.logger.error({ error: error.message }, 'GPT field extraction failed');
      }
    }

    return values;
  }

  /**
   * GPT-based field value extraction
   * @param {string} message
   * @param {Array<string>} fields
   * @returns {Promise<Object>}
   */
  async extractFieldValuesWithGPT(message, fields) {
    const prompt = `Extract these fields from the message: ${fields.join(', ')}

Message: "${message}"

Return JSON with only the fields that can be extracted. Use these formats:
- price: number (e.g., 45.99)
- cost: number
- unitOfMeasure: string (e.g., "Each", "Box", "Foot")
- name: string
- description: string

Return ONLY JSON, no other text. Return {} if nothing can be extracted.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 150,
    });

    const content = response.choices[0].message.content.trim();

    try {
      return JSON.parse(content.replace(/```json\n?|\n?```/g, ''));
    } catch {
      return {};
    }
  }

  /**
   * Extract category name from message
   * @param {string} message
   * @returns {Promise<string|null>}
   */
  async extractCategoryName(message) {
    // Rule-based patterns
    const patterns = [
      /\b(?:in|for|from|to)\s+(?:the\s+)?["']?(\w+)["']?\s*(?:category)?/i,
      /["']?(\w+)["']?\s+(?:category|materials?|items?)/i,
      /(?:category|cat)\s*[:=]?\s*["']?(\w+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const word = match[1].toLowerCase();
        // Filter out common non-category words
        if (!['the', 'all', 'some', 'any', 'my', 'our', 'new', 'this', 'that', 'a', 'an'].includes(word)) {
          return match[1];
        }
      }
    }

    return null;
  }

  /**
   * Extract material name from message
   * @param {string} message
   * @returns {Promise<string|null>}
   */
  async extractMaterialName(message) {
    // Pattern: "update X" or "change X" or "the X"
    const patterns = [
      /(?:update|change|modify|edit)\s+(?:the\s+)?(?:price\s+of\s+)?["']?(.+?)["']?\s+(?:to|price|cost)/i,
      /(?:the|for)\s+["']?(.+?)["']?\s+(?:material|item)/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return null;
  }
}

export default EntityExtractor;
