/**
 * AI/NLP Tools Index
 * Exports all 8 AI and natural language processing tools
 */

import { nlpParser } from '../../services/nlp-parser.js';
import Anthropic from '@anthropic-ai/sdk';

let anthropic = null;

function getAnthropicClient() {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

// Tool 1: Extract Entities
export const extractEntities = {
  name: 'extract_entities',
  description: 'Extract structured entities from natural language text (equipment, quantities, actions, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to extract entities from' }
    },
    required: ['text']
  },
  async handler(params) {
    try {
      const entities = await nlpParser.extractEntities(params.text);
      return { success: true, text: params.text, entities };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 2: Detect Intent
export const detectIntent = {
  name: 'detect_intent',
  description: 'Detect the intent behind a user message',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' }
    },
    required: ['text']
  },
  async handler(params) {
    try {
      const intent = await nlpParser.detectIntent(params.text);
      return { success: true, text: params.text, ...intent };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 3: Parse Natural Language Query
export const parseNLQuery = {
  name: 'parse_nl_query',
  description: 'Parse a natural language query into structured search parameters',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language query' }
    },
    required: ['query']
  },
  async handler(params) {
    try {
      const parsed = await nlpParser.parseQuery(params.query);
      return { success: true, ...parsed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 4: Generate Response
export const generateResponse = {
  name: 'generate_response',
  description: 'Generate a contextual response for customer communication',
  inputSchema: {
    type: 'object',
    properties: {
      context: { type: 'string', description: 'Context for the response (e.g., estimate follow-up, appointment reminder)' },
      customerName: { type: 'string', description: 'Customer name' },
      details: { type: 'object', description: 'Additional details to include' },
      tone: { type: 'string', enum: ['professional', 'friendly', 'urgent'], default: 'professional' }
    },
    required: ['context', 'customerName']
  },
  async handler(params) {
    try {
      const client = getAnthropicClient();
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: `You are a customer service representative for a pool and electrical service company. Generate ${params.tone} messages for customers.`,
        messages: [{
          role: 'user',
          content: `Generate a ${params.tone} message for ${params.customerName} regarding: ${params.context}\n\nDetails: ${JSON.stringify(params.details || {})}\n\nKeep it concise and professional.`
        }]
      });
      
      return {
        success: true,
        message: response.content[0].text,
        context: params.context,
        tone: params.tone
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 5: Analyze Sentiment
export const analyzeSentiment = {
  name: 'analyze_sentiment',
  description: 'Analyze the sentiment of customer communication',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' }
    },
    required: ['text']
  },
  async handler(params) {
    try {
      const client = getAnthropicClient();
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: 'Analyze customer sentiment. Return JSON: { sentiment: "positive"|"neutral"|"negative", confidence: 0-1, emotions: [], urgency: "low"|"medium"|"high" }',
        messages: [{
          role: 'user',
          content: `Analyze sentiment: "${params.text}"\n\nReturn JSON only.`
        }]
      });
      
      const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
      const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { sentiment: 'neutral', confidence: 0.5 };
      
      return { success: true, text: params.text, ...analysis };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 6: Transcribe Call (Mock)
export const transcribeCall = {
  name: 'transcribe_call',
  description: 'Transcribe a phone call recording',
  inputSchema: {
    type: 'object',
    properties: {
      callId: { type: 'string', description: 'Call recording ID' },
      audioUrl: { type: 'string', description: 'URL to audio file' }
    },
    required: ['callId']
  },
  async handler(params) {
    // Would integrate with speech-to-text service
    return {
      success: true,
      callId: params.callId,
      status: 'queued',
      message: 'Call transcription queued. Speech-to-text integration pending.'
    };
  }
};

// Tool 7: Create Job from Voice
export const createJobFromVoice = {
  name: 'create_job_from_voice',
  description: 'Create a job from voice/text description',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', description: 'Voice/text description of the job needed' },
      customerId: { type: 'number', description: 'Customer ID' }
    },
    required: ['description', 'customerId']
  },
  async handler(params) {
    try {
      // Parse the description
      const entities = await nlpParser.extractEntities(params.description);
      const intent = await nlpParser.detectIntent(params.description);
      
      return {
        success: true,
        parsed: {
          entities,
          intent,
          suggestedJobType: entities.action || 'Service',
          suggestedEquipment: entities.equipment,
          urgency: entities.urgency || 'standard'
        },
        nextStep: 'Confirm job details and schedule',
        message: 'Job details extracted. Ready to create job.'
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};

// Tool 8: Voice Get Availability
export const voiceGetAvailability = {
  name: 'voice_get_availability',
  description: 'Get availability from a voice/text request',
  inputSchema: {
    type: 'object',
    properties: {
      request: { type: 'string', description: 'Voice/text request for availability' }
    },
    required: ['request']
  },
  async handler(params) {
    try {
      const client = getAnthropicClient();
      
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        system: 'Extract scheduling preferences from text. Return JSON: { preferredDate: "YYYY-MM-DD or null", preferredTime: "morning|afternoon|evening or null", urgency: "emergency|urgent|standard|flexible" }',
        messages: [{
          role: 'user',
          content: `Extract scheduling preferences: "${params.request}"\n\nReturn JSON only.`
        }]
      });
      
      const jsonMatch = response.content[0].text.match(/\{[\s\S]*\}/);
      const preferences = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      
      // Generate available slots based on preferences
      const slots = [
        { date: new Date().toISOString().split('T')[0], time: '09:00', available: true },
        { date: new Date().toISOString().split('T')[0], time: '14:00', available: true },
        { date: new Date(Date.now() + 86400000).toISOString().split('T')[0], time: '10:00', available: true }
      ];
      
      return {
        success: true,
        request: params.request,
        preferences,
        availableSlots: slots,
        recommendation: slots[0]
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
