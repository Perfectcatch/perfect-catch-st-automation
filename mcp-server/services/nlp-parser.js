/**
 * Natural Language Processing Parser
 * Extracts entities and intent from text
 */

import Anthropic from '@anthropic-ai/sdk';

let anthropic = null;

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

export class NLPParser {
  
  /**
   * Extract entities from text
   */
  async extractEntities(text) {
    const client = getAnthropicClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: `Extract entities from text.

Entities to find:
- equipment: (pump, heater, filter, panel, etc.)
- quantity: (numbers)
- units: (feet, hours, gallons, etc.)
- location: (roof, basement, yard, etc.)
- brand: (Hayward, Pentair, etc.)
- model: (model numbers)
- action: (install, repair, replace, inspect)

Return JSON object with found entities.`,
      messages: [{
        role: 'user',
        content: `Extract entities from:\n\n"${text}"\n\nReturn JSON.`
      }]
    });
    
    const jsonText = response.content[0].text;
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return {};
  }
  
  /**
   * Detect intent
   */
  async detectIntent(text) {
    const client = getAnthropicClient();
    
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: `Detect user intent from text.

Intents:
- create_estimate
- add_to_estimate
- search_pricebook
- find_customer
- schedule_job
- check_availability
- get_status
- send_message

Return JSON: { intent: "...", confidence: 0-1 }`,
      messages: [{
        role: 'user',
        content: `What is the intent?\n\n"${text}"\n\nReturn JSON.`
      }]
    });
    
    const jsonText = response.content[0].text;
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    return { intent: 'unknown', confidence: 0 };
  }
  
  /**
   * Parse natural language query into structured search
   */
  async parseQuery(text) {
    const entities = await this.extractEntities(text);
    const intent = await this.detectIntent(text);
    
    return {
      ...intent,
      entities,
      originalText: text
    };
  }
}

export const nlpParser = new NLPParser();
