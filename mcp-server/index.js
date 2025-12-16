#!/usr/bin/env node
/**
 * Perfect Catch MCP Server - Complete Edition
 * 
 * Model Context Protocol server with 57 AI-powered tools for field service automation.
 * 
 * Tool Categories:
 * - Estimates (15 tools)
 * - Customers (8 tools)
 * - Scheduling (15 tools)
 * - Jobs (10 tools)
 * - Invoicing (6 tools)
 * - Analytics (8 tools)
 * - Messaging (6 tools)
 * - Workflows (7 tools)
 * - Equipment (5 tools)
 * - Technicians (6 tools)
 * - Integrations (4 tools)
 * - AI/NLP (8 tools)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Import existing tools
import * as queryDatabaseTool from './tools/query-database.js';
import * as callStApiTool from './tools/call-st-api.js';
import * as sendSmsTool from './tools/send-sms.js';
import * as sendEmailTool from './tools/send-email.js';
import * as createJobTool from './tools/create-job.js';
import * as scheduleAppointmentTool from './tools/schedule-appointment.js';

// Import new tool categories
import * as estimateTools from './tools/estimates/index.js';
import * as customerTools from './tools/customers/index.js';
import * as schedulingTools from './tools/scheduling/index.js';
import * as jobTools from './tools/jobs/index.js';
import * as invoicingTools from './tools/invoicing/index.js';
import * as analyticsTools from './tools/analytics/index.js';
import * as messagingTools from './tools/messaging/index.js';
import * as workflowTools from './tools/workflows/index.js';
import * as equipmentTools from './tools/equipment/index.js';
import * as technicianTools from './tools/technicians/index.js';
import * as integrationTools from './tools/integrations/index.js';
import * as aiTools from './tools/ai/index.js';

// Configuration
const API_BASE_URL = process.env.PRICEBOOK_API_URL || 'http://localhost:3001';
const DEFAULT_SESSION_ID = process.env.MCP_SESSION_ID || 'mcp-default-session';

/**
 * Make HTTP request to the API
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
    name: 'perfectcatch-mcp-server',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ============================================
// TOOL DEFINITIONS
// ============================================

// Collect all tools from imported modules
function collectTools(module) {
  return Object.values(module).filter(t => t && t.name && t.inputSchema && t.handler);
}

const ALL_TOOLS = [
  // Estimate Tools (15)
  ...collectTools(estimateTools),
  
  // Customer Tools (8)
  ...collectTools(customerTools),
  
  // Scheduling Tools (12)
  ...collectTools(schedulingTools),
  
  // Job Tools (10)
  ...collectTools(jobTools),
  
  // Invoicing Tools (6)
  ...collectTools(invoicingTools),
  
  // Analytics Tools (8)
  ...collectTools(analyticsTools),
  
  // Messaging Tools (6)
  ...collectTools(messagingTools),
  
  // Workflow Tools (7)
  ...collectTools(workflowTools),
  
  // Equipment Tools (5)
  ...collectTools(equipmentTools),
  
  // Technician Tools (6)
  ...collectTools(technicianTools),
  
  // Integration Tools (4)
  ...collectTools(integrationTools),
  
  // AI/NLP Tools (8)
  ...collectTools(aiTools),
];

// Legacy tools (keep for backwards compatibility)
const LEGACY_TOOLS = [
  {
    name: 'search_pricebook_legacy',
    description: 'Legacy: Search the ServiceTitan pricebook for materials, services, and equipment.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_categories',
    description: 'List all pricebook categories.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_materials',
    description: 'Get materials from a specific category or all materials.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category name to filter by' },
        limit: { type: 'number', description: 'Maximum results (default: 25)' },
      },
    },
  },
  {
    name: 'get_services',
    description: 'Get services from the pricebook.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'Category name to filter by' },
        limit: { type: 'number', description: 'Maximum results (default: 25)' },
      },
    },
  },
  {
    name: 'get_equipment',
    description: 'Get equipment from the pricebook.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum results (default: 25)' },
      },
    },
  },
  {
    name: 'get_sync_status',
    description: 'Get the current pricebook sync status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'trigger_sync',
    description: 'Trigger a pricebook sync with ServiceTitan.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['full', 'incremental'], description: 'Type of sync' },
      },
      required: ['type'],
    },
  },
  // Database and API tools
  queryDatabaseTool.definition,
  callStApiTool.definition,
  sendSmsTool.definition,
  sendEmailTool.definition,
  createJobTool.definition,
  scheduleAppointmentTool.definition,
].filter(Boolean);

// Combine all tools
const COMBINED_TOOLS = [...ALL_TOOLS, ...LEGACY_TOOLS];

// Create tool map for handler lookup
const TOOL_MAP = {};
ALL_TOOLS.forEach(tool => {
  TOOL_MAP[tool.name] = tool;
});

// Add legacy tool handlers
TOOL_MAP['query_database'] = queryDatabaseTool;
TOOL_MAP['call_st_api'] = callStApiTool;
TOOL_MAP['send_sms'] = sendSmsTool;
TOOL_MAP['send_email'] = sendEmailTool;
TOOL_MAP['create_job'] = createJobTool;
TOOL_MAP['schedule_appointment'] = scheduleAppointmentTool;

// List Tools Handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools = COMBINED_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));
  
  console.error(`MCP Server: Listing ${tools.length} tools`);
  return { tools };
});

// Call Tool Handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  console.error(`MCP Server: Calling tool ${name}`);
  
  try {
    // Check for new tools first
    const tool = TOOL_MAP[name];
    if (tool && tool.handler) {
      const result = await tool.handler(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    
    // Handle legacy tools via chat agent
    const legacyToolHandlers = {
      'search_pricebook_legacy': async () => chatWithAgent(args.sessionId || DEFAULT_SESSION_ID, `search ${args.query}`),
      'list_categories': async () => chatWithAgent(DEFAULT_SESSION_ID, 'show categories'),
      'get_materials': async () => apiRequest(`/api/pricebook/materials?category=${args.category || ''}&limit=${args.limit || 25}`),
      'get_services': async () => apiRequest(`/api/pricebook/services?category=${args.category || ''}&limit=${args.limit || 25}`),
      'get_equipment': async () => apiRequest(`/api/pricebook/equipment?limit=${args.limit || 25}`),
      'get_sync_status': async () => apiRequest('/api/sync/pricebook/status'),
      'trigger_sync': async () => apiRequest(`/api/sync/pricebook/${args.type}`, { method: 'POST' }),
    };
    
    if (legacyToolHandlers[name]) {
      const result = await legacyToolHandlers[name]();
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    }
    
    throw new Error(`Unknown tool: ${name}`);
    
  } catch (error) {
    console.error(`MCP Server: Error in tool ${name}:`, error.message);
    return {
      content: [{ type: 'text', text: JSON.stringify({ success: false, error: error.message }) }],
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
    uri: 'pricebook://tools',
    name: 'Available Tools',
    description: 'List of all available MCP tools',
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

      case 'pricebook://tools':
        data = {
          totalTools: COMBINED_TOOLS.length,
          categories: {
            estimates: collectTools(estimateTools).length,
            customers: collectTools(customerTools).length,
            scheduling: collectTools(schedulingTools).length,
            jobs: collectTools(jobTools).length,
            invoicing: collectTools(invoicingTools).length,
            analytics: collectTools(analyticsTools).length,
            messaging: collectTools(messagingTools).length,
            workflows: collectTools(workflowTools).length,
            equipment: collectTools(equipmentTools).length,
            technicians: collectTools(technicianTools).length,
            integrations: collectTools(integrationTools).length,
            ai: collectTools(aiTools).length,
          },
          tools: COMBINED_TOOLS.map(t => ({ name: t.name, description: t.description })),
        };
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
  console.error('Perfect Catch MCP Server v2.0.0');
  console.error(`Loaded ${COMBINED_TOOLS.length} tools across 12 categories`);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
