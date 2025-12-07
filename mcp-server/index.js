#!/usr/bin/env node
/**
 * Pricebook MCP Server
 * 
 * Model Context Protocol server exposing ServiceTitan Pricebook Engine capabilities.
 * Provides tools for:
 * - Searching pricebook (materials, services, equipment)
 * - Building job estimates
 * - Managing sync operations
 * - n8n webhook integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Configuration
const API_BASE_URL = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
const DEFAULT_SESSION_ID = process.env.MCP_SESSION_ID || 'mcp-default-session';

/**
 * Make HTTP request to the Pricebook API
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });
  
  return response.json();
}

/**
 * Chat with the pricebook agent
 */
async function chatWithAgent(sessionId, message) {
  return apiRequest('/chat/pricebook', {
    method: 'POST',
    body: JSON.stringify({ sessionId, message }),
  });
}

// Create MCP Server
const server = new Server(
  {
    name: 'pricebook-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================
// TOOLS
// ============================================

const TOOLS = [
  // Chat/Search Tools
  {
    name: 'search_pricebook',
    description: 'Search the ServiceTitan pricebook for materials, services, and equipment. Returns matching items with prices.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "transformer", "pool pump", "breaker")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_categories',
    description: 'List all pricebook categories. Use this to see what categories are available.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_materials',
    description: 'Get materials from a specific category or all materials.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name to filter by (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 25)',
        },
      },
    },
  },
  {
    name: 'get_services',
    description: 'Get services from the pricebook.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: 'Category name to filter by (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 25)',
        },
      },
    },
  },
  {
    name: 'get_equipment',
    description: 'Get equipment from the pricebook.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 25)',
        },
      },
    },
  },

  // Estimate Building Tools
  {
    name: 'start_estimate',
    description: 'Start a new estimate for a job. Use job ID or job name.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'ServiceTitan job ID (e.g., "12345")',
        },
        jobName: {
          type: 'string',
          description: 'Job name/description (e.g., "Smith pool installation")',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for tracking (optional, auto-generated if not provided)',
        },
      },
    },
  },
  {
    name: 'add_to_estimate',
    description: 'Add items to the current estimate. Items are searched by name or code.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'string',
          description: 'Items to add (e.g., "chlorinator hookup and transformer")',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID (use same as start_estimate)',
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'show_estimate',
    description: 'Show the current estimate with all items and total.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID',
        },
      },
    },
  },
  {
    name: 'remove_from_estimate',
    description: 'Remove an item from the current estimate.',
    inputSchema: {
      type: 'object',
      properties: {
        item: {
          type: 'string',
          description: 'Item name or number to remove',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID',
        },
      },
      required: ['item'],
    },
  },
  {
    name: 'create_estimate',
    description: 'Create/push the estimate to ServiceTitan. Requires confirmation.',
    inputSchema: {
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          description: 'Set to true to confirm creation',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID',
        },
      },
      required: ['confirm'],
    },
  },
  {
    name: 'clear_estimate',
    description: 'Clear the current estimate and start fresh.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session ID',
        },
      },
    },
  },

  // Sync Tools
  {
    name: 'get_sync_status',
    description: 'Get the current pricebook sync status, statistics, and scheduler info.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'trigger_sync',
    description: 'Trigger a pricebook sync with ServiceTitan.',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['full', 'incremental'],
          description: 'Type of sync to trigger',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'get_sync_logs',
    description: 'Get recent sync operation logs.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of logs to return (default: 10)',
        },
      },
    },
  },

  // ServiceTitan Direct Access
  {
    name: 'get_service_details',
    description: 'Get detailed information about a specific service including linked materials.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Service ID',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'get_material_details',
    description: 'Get detailed information about a material including vendor pricing.',
    inputSchema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description: 'Material ID',
        },
      },
      required: ['materialId'],
    },
  },
  {
    name: 'update_service',
    description: 'Update a service in ServiceTitan (price, materials, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: {
          type: 'string',
          description: 'Service ID to update',
        },
        price: {
          type: 'number',
          description: 'New price',
        },
        memberPrice: {
          type: 'number',
          description: 'New member price',
        },
        addOnPrice: {
          type: 'number',
          description: 'New add-on price',
        },
      },
      required: ['serviceId'],
    },
  },
  {
    name: 'update_material',
    description: 'Update a material in ServiceTitan.',
    inputSchema: {
      type: 'object',
      properties: {
        materialId: {
          type: 'string',
          description: 'Material ID to update',
        },
        price: {
          type: 'number',
          description: 'New price',
        },
        cost: {
          type: 'number',
          description: 'New cost',
        },
      },
      required: ['materialId'],
    },
  },

  // n8n Integration
  {
    name: 'list_webhook_events',
    description: 'List available webhook events for n8n integration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'list_webhook_subscriptions',
    description: 'List active webhook subscriptions.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'subscribe_webhook',
    description: 'Subscribe to webhook events.',
    inputSchema: {
      type: 'object',
      properties: {
        webhookUrl: {
          type: 'string',
          description: 'URL to receive webhook events',
        },
        events: {
          type: 'array',
          items: { type: 'string' },
          description: 'Events to subscribe to (e.g., ["material_created", "sync_completed"])',
        },
        name: {
          type: 'string',
          description: 'Name for this subscription',
        },
      },
      required: ['webhookUrl', 'events'],
    },
  },

  // Chat Agent (Natural Language)
  {
    name: 'chat',
    description: 'Send a natural language message to the pricebook chat agent. Supports complex queries and conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Natural language message (e.g., "What pool pump parts do you have under $200?")',
        },
        sessionId: {
          type: 'string',
          description: 'Session ID for conversation context',
        },
      },
      required: ['message'],
    },
  },
];

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const sessionId = args?.sessionId || DEFAULT_SESSION_ID;

  try {
    let result;

    switch (name) {
      // Search/Query Tools
      case 'search_pricebook':
        result = await chatWithAgent(sessionId, `search ${args.query}`);
        break;

      case 'list_categories':
        result = await chatWithAgent(sessionId, 'show categories');
        break;

      case 'get_materials':
        if (args.category) {
          result = await chatWithAgent(sessionId, `show ${args.category} materials`);
        } else {
          result = await apiRequest(`/pricebook/materials?pageSize=${args.limit || 25}`);
        }
        break;

      case 'get_services':
        if (args.category) {
          result = await chatWithAgent(sessionId, `show ${args.category} services`);
        } else {
          result = await apiRequest(`/pricebook/services?pageSize=${args.limit || 25}`);
        }
        break;

      case 'get_equipment':
        result = await apiRequest(`/pricebook/equipment?pageSize=${args.limit || 25}`);
        break;

      // Estimate Tools
      case 'start_estimate':
        const jobRef = args.jobId ? `job ${args.jobId}` : args.jobName || 'new job';
        result = await chatWithAgent(sessionId, `start estimate for ${jobRef}`);
        break;

      case 'add_to_estimate':
        result = await chatWithAgent(sessionId, `add ${args.items}`);
        break;

      case 'show_estimate':
        result = await chatWithAgent(sessionId, 'show estimate');
        break;

      case 'remove_from_estimate':
        result = await chatWithAgent(sessionId, `remove ${args.item}`);
        break;

      case 'create_estimate':
        if (args.confirm) {
          // First request creation, then confirm
          await chatWithAgent(sessionId, 'create estimate');
          result = await chatWithAgent(sessionId, 'yes');
        } else {
          result = await chatWithAgent(sessionId, 'create estimate');
        }
        break;

      case 'clear_estimate':
        result = await chatWithAgent(sessionId, 'clear estimate');
        break;

      // Sync Tools
      case 'get_sync_status':
        result = await apiRequest('/api/sync/pricebook/status');
        break;

      case 'trigger_sync':
        result = await apiRequest(`/api/sync/pricebook/${args.type}`, { method: 'POST' });
        break;

      case 'get_sync_logs':
        result = await apiRequest(`/api/sync/pricebook/logs?limit=${args.limit || 10}`);
        break;

      // Direct ServiceTitan Access
      case 'get_service_details':
        result = await apiRequest(`/pricebook/services/${args.serviceId}`);
        break;

      case 'get_material_details':
        result = await apiRequest(`/pricebook/materials/${args.materialId}`);
        break;

      case 'update_service':
        const serviceUpdate = {};
        if (args.price !== undefined) serviceUpdate.price = args.price;
        if (args.memberPrice !== undefined) serviceUpdate.memberPrice = args.memberPrice;
        if (args.addOnPrice !== undefined) serviceUpdate.addOnPrice = args.addOnPrice;
        result = await apiRequest(`/pricebook/services/${args.serviceId}`, {
          method: 'PATCH',
          body: JSON.stringify(serviceUpdate),
        });
        break;

      case 'update_material':
        const materialUpdate = {};
        if (args.price !== undefined) materialUpdate.price = args.price;
        if (args.cost !== undefined) materialUpdate.cost = args.cost;
        result = await apiRequest(`/pricebook/materials/${args.materialId}`, {
          method: 'PATCH',
          body: JSON.stringify(materialUpdate),
        });
        break;

      // n8n Integration
      case 'list_webhook_events':
        result = await apiRequest('/api/n8n/events');
        break;

      case 'list_webhook_subscriptions':
        result = await apiRequest('/api/n8n/subscriptions');
        break;

      case 'subscribe_webhook':
        result = await apiRequest('/api/n8n/subscribe', {
          method: 'POST',
          body: JSON.stringify({
            webhookUrl: args.webhookUrl,
            events: args.events,
            name: args.name,
          }),
        });
        break;

      // Natural Language Chat
      case 'chat':
        result = await chatWithAgent(sessionId, args.message);
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    // Format response
    let content;
    if (result?.message) {
      content = result.message;
      if (result.context?.estimateTotal) {
        content += `\n\n[Estimate: ${result.context.estimateItemCount} items, $${result.context.estimateTotal}]`;
      }
    } else if (result?.data) {
      content = JSON.stringify(result.data, null, 2);
    } else {
      content = JSON.stringify(result, null, 2);
    }

    return {
      content: [{ type: 'text', text: content }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ============================================
// RESOURCES
// ============================================

const RESOURCES = [
  {
    uri: 'pricebook://status',
    name: 'Pricebook Status',
    description: 'Current pricebook sync status and statistics',
    mimeType: 'application/json',
  },
  {
    uri: 'pricebook://categories',
    name: 'Pricebook Categories',
    description: 'List of all pricebook categories',
    mimeType: 'application/json',
  },
  {
    uri: 'pricebook://webhook-events',
    name: 'Webhook Events',
    description: 'Available webhook events for n8n integration',
    mimeType: 'application/json',
  },
];

// List Resources Handler
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: RESOURCES };
});

// Read Resource Handler
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    let data;

    switch (uri) {
      case 'pricebook://status':
        data = await apiRequest('/api/sync/pricebook/status');
        break;

      case 'pricebook://categories':
        const chatResult = await chatWithAgent(DEFAULT_SESSION_ID, 'show categories');
        data = chatResult.data || chatResult;
        break;

      case 'pricebook://webhook-events':
        data = await apiRequest('/api/n8n/events');
        break;

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }

    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (error) {
    throw new Error(`Failed to read resource ${uri}: ${error.message}`);
  }
});

// ============================================
// START SERVER
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Pricebook MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
