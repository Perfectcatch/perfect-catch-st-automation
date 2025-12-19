/**
 * Agent Executor
 * Executes workflow actions using Claude + MCP tools
 */

import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';
import { createLogger } from '../../lib/logger.js';

// Import MCP tools
import * as sendSmsTool from '../../../mcp-server/tools/send-sms.js';
import * as sendEmailTool from '../../../mcp-server/tools/send-email.js';

const { Pool } = pg;
const logger = createLogger('agent-executor');

let pool = null;
let anthropic = null;

function getPool() {
  if (!pool) {
    const connectionString = process.env.SERVICETITAN_DATABASE_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('Database connection string not configured');
    }
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

function getAnthropicClient() {
  if (!anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    anthropic = new Anthropic({ apiKey });
  }
  return anthropic;
}

export class AgentExecutor {
  async executeAction(actionDescription, context, workflowInstance) {
    logger.info('Executing action with agent', {
      action: actionDescription.substring(0, 100),
      instanceId: workflowInstance.id
    });

    // Get customer and entity data
    const customer = context.customer;
    const entity = await this.getEntity(
      workflowInstance.entity_type,
      workflowInstance.entity_id
    );

    // Build enriched context
    const enrichedContext = {
      ...context,
      customer,
      entity,
      workflow: {
        message_count: workflowInstance.message_count || 0
      }
    };

    try {
      // Call Claude with tools
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: `You are a workflow automation executor for Perfect Catch, a pool service company.

Context:
${JSON.stringify(enrichedContext, null, 2)}

Execute the requested action using available tools.
- Use send_sms to send text messages to the customer's phone
- Use send_email to send emails to the customer's email
- Be professional and friendly in all communications
- Personalize messages with customer name when available
- Keep messages concise and actionable

Report what you did after execution.`,
        tools: this.getAvailableTools(),
        messages: [{
          role: 'user',
          content: actionDescription
        }]
      });

      // Process tool uses
      const results = [];
      for (const content of response.content) {
        if (content.type === 'tool_use') {
          logger.info('Tool requested', {
            tool: content.name,
            input: content.input
          });

          // Execute the tool
          const toolResult = await this.executeTool(content.name, content.input);
          results.push({
            tool: content.name,
            input: content.input,
            result: toolResult
          });
        }
      }

      const textResponse = response.content.find(c => c.type === 'text')?.text;

      logger.info('Action executed', {
        instanceId: workflowInstance.id,
        toolsUsed: results.length,
        response: textResponse?.substring(0, 100)
      });

      return {
        text: textResponse,
        tools_used: results
      };

    } catch (error) {
      logger.error('Agent execution failed', {
        instanceId: workflowInstance.id,
        error: error.message
      });

      // Fallback: try direct tool execution based on action keywords
      return this.fallbackExecution(actionDescription, enrichedContext);
    }
  }

  async executeTool(toolName, input) {
    switch (toolName) {
      case 'send_sms':
        return sendSmsTool.sendSMS(input.to, input.message);
      
      case 'send_email':
        return sendEmailTool.sendEmail(input.to, input.subject, input.body);
      
      default:
        logger.warn('Unknown tool requested', { toolName });
        return { error: `Unknown tool: ${toolName}` };
    }
  }

  async fallbackExecution(actionDescription, context) {
    logger.info('Using fallback execution', { action: actionDescription.substring(0, 50) });

    const customer = context.customer;
    const actionLower = actionDescription.toLowerCase();

    // Detect SMS action
    if (actionLower.includes('sms') || actionLower.includes('text')) {
      if (customer?.phone) {
        // Extract or generate message
        const message = this.generateMessage(actionDescription, context);
        const result = await sendSmsTool.sendSMS(customer.phone, message);
        return {
          text: `Sent SMS to ${customer.phone}`,
          tools_used: [{ tool: 'send_sms', input: { to: customer.phone, message }, result }]
        };
      }
    }

    // Detect email action
    if (actionLower.includes('email')) {
      if (customer?.email) {
        const subject = this.generateSubject(actionDescription, context);
        const body = this.generateMessage(actionDescription, context);
        const result = await sendEmailTool.sendEmail(customer.email, subject, body);
        return {
          text: `Sent email to ${customer.email}`,
          tools_used: [{ tool: 'send_email', input: { to: customer.email, subject, body }, result }]
        };
      }
    }

    return {
      text: 'No action taken - could not determine action type or missing contact info',
      tools_used: []
    };
  }

  generateMessage(actionDescription, context) {
    const customer = context.customer;
    const firstName = customer?.name?.split(' ')[0] || 'there';

    // Template-based message generation
    if (actionDescription.toLowerCase().includes('follow-up') || 
        actionDescription.toLowerCase().includes('estimate')) {
      return `Hi ${firstName}, this is Perfect Catch Pool Service. We wanted to follow up on your recent estimate. Do you have any questions we can help with? Reply or call us anytime!`;
    }

    if (actionDescription.toLowerCase().includes('review')) {
      return `Hi ${firstName}, thank you for choosing Perfect Catch! We hope you're happy with our service. Would you mind leaving us a quick review? It really helps! Thank you!`;
    }

    if (actionDescription.toLowerCase().includes('reminder') || 
        actionDescription.toLowerCase().includes('payment')) {
      return `Hi ${firstName}, this is a friendly reminder from Perfect Catch Pool Service regarding your account. Please let us know if you have any questions!`;
    }

    // Default message
    return `Hi ${firstName}, this is Perfect Catch Pool Service. We're reaching out regarding your recent service. Please let us know if you have any questions!`;
  }

  generateSubject(actionDescription, context) {
    if (actionDescription.toLowerCase().includes('estimate')) {
      return 'Your Estimate from Perfect Catch Pool Service';
    }
    if (actionDescription.toLowerCase().includes('review')) {
      return 'How was your service? - Perfect Catch';
    }
    if (actionDescription.toLowerCase().includes('reminder')) {
      return 'Friendly Reminder - Perfect Catch Pool Service';
    }
    return 'Message from Perfect Catch Pool Service';
  }

  async getEntity(entityType, entityId) {
    const client = await getPool().connect();
    try {
      let result;
      switch (entityType) {
        case 'estimate':
          result = await client.query('SELECT * FROM st_estimates WHERE st_id = $1', [entityId]);
          break;
        case 'job':
          result = await client.query('SELECT * FROM st_jobs WHERE st_id = $1', [entityId]);
          break;
        case 'invoice':
          result = await client.query('SELECT * FROM st_invoices WHERE st_id = $1', [entityId]);
          break;
        default:
          return null;
      }
      return result.rows[0] || null;
    } finally {
      client.release();
    }
  }

  getAvailableTools() {
    return [
      {
        name: 'send_sms',
        description: 'Send SMS message to customer phone number',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Phone number to send to' },
            message: { type: 'string', description: 'Message text to send' }
          },
          required: ['to', 'message']
        }
      },
      {
        name: 'send_email',
        description: 'Send email to customer email address',
        input_schema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Email address to send to' },
            subject: { type: 'string', description: 'Email subject line' },
            body: { type: 'string', description: 'Email body content' }
          },
          required: ['to', 'subject', 'body']
        }
      }
    ];
  }
}

export const agentExecutor = new AgentExecutor();

export default AgentExecutor;
