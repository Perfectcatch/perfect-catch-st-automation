#!/usr/bin/env python3
"""
Pricebook MCP Server (Python)

Model Context Protocol server exposing ServiceTitan Pricebook Engine capabilities.
"""

import os
import json
import asyncio
import httpx
from typing import Any
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import (
    Tool,
    TextContent,
    Resource,
    INVALID_PARAMS,
    INTERNAL_ERROR,
)

# Configuration
API_BASE_URL = os.getenv("PRICEBOOK_API_URL", "http://localhost:3001")
DEFAULT_SESSION_ID = os.getenv("MCP_SESSION_ID", "mcp-python-session")

# Create server
server = Server("pricebook-mcp-server")

# HTTP client
http_client = httpx.AsyncClient(timeout=30.0)


async def api_request(endpoint: str, method: str = "GET", body: dict = None) -> dict:
    """Make HTTP request to the Pricebook API."""
    url = f"{API_BASE_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    
    if method == "GET":
        response = await http_client.get(url, headers=headers)
    elif method == "POST":
        response = await http_client.post(url, headers=headers, json=body or {})
    elif method == "PATCH":
        response = await http_client.patch(url, headers=headers, json=body or {})
    else:
        raise ValueError(f"Unsupported method: {method}")
    
    return response.json()


async def chat_with_agent(session_id: str, message: str) -> dict:
    """Chat with the pricebook agent."""
    return await api_request("/chat/pricebook", "POST", {
        "sessionId": session_id,
        "message": message
    })


# ============================================
# TOOLS
# ============================================

@server.list_tools()
async def list_tools() -> list[Tool]:
    """List available tools."""
    return [
        # Search Tools
        Tool(
            name="search_pricebook",
            description="Search the ServiceTitan pricebook for materials, services, and equipment.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Search query (e.g., 'transformer', 'pool pump')"
                    }
                },
                "required": ["query"]
            }
        ),
        Tool(
            name="list_categories",
            description="List all pricebook categories.",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="get_materials",
            description="Get materials from the pricebook.",
            inputSchema={
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Category name (optional)"},
                    "limit": {"type": "number", "description": "Max results (default: 25)"}
                }
            }
        ),
        Tool(
            name="get_services",
            description="Get services from the pricebook.",
            inputSchema={
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Category name (optional)"},
                    "limit": {"type": "number", "description": "Max results (default: 25)"}
                }
            }
        ),
        Tool(
            name="get_equipment",
            description="Get equipment from the pricebook.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {"type": "number", "description": "Max results (default: 25)"}
                }
            }
        ),
        
        # Estimate Tools
        Tool(
            name="start_estimate",
            description="Start a new estimate for a job.",
            inputSchema={
                "type": "object",
                "properties": {
                    "jobId": {"type": "string", "description": "ServiceTitan job ID"},
                    "jobName": {"type": "string", "description": "Job name/description"},
                    "sessionId": {"type": "string", "description": "Session ID (optional)"}
                }
            }
        ),
        Tool(
            name="add_to_estimate",
            description="Add items to the current estimate.",
            inputSchema={
                "type": "object",
                "properties": {
                    "items": {"type": "string", "description": "Items to add"},
                    "sessionId": {"type": "string", "description": "Session ID"}
                },
                "required": ["items"]
            }
        ),
        Tool(
            name="show_estimate",
            description="Show the current estimate with all items and total.",
            inputSchema={
                "type": "object",
                "properties": {
                    "sessionId": {"type": "string", "description": "Session ID"}
                }
            }
        ),
        Tool(
            name="remove_from_estimate",
            description="Remove an item from the current estimate.",
            inputSchema={
                "type": "object",
                "properties": {
                    "item": {"type": "string", "description": "Item name or number"},
                    "sessionId": {"type": "string", "description": "Session ID"}
                },
                "required": ["item"]
            }
        ),
        Tool(
            name="create_estimate",
            description="Create/push the estimate to ServiceTitan.",
            inputSchema={
                "type": "object",
                "properties": {
                    "confirm": {"type": "boolean", "description": "Confirm creation"},
                    "sessionId": {"type": "string", "description": "Session ID"}
                },
                "required": ["confirm"]
            }
        ),
        Tool(
            name="clear_estimate",
            description="Clear the current estimate.",
            inputSchema={
                "type": "object",
                "properties": {
                    "sessionId": {"type": "string", "description": "Session ID"}
                }
            }
        ),
        
        # Sync Tools
        Tool(
            name="get_sync_status",
            description="Get pricebook sync status and statistics.",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="trigger_sync",
            description="Trigger a pricebook sync.",
            inputSchema={
                "type": "object",
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["full", "incremental"],
                        "description": "Sync type"
                    }
                },
                "required": ["type"]
            }
        ),
        Tool(
            name="get_sync_logs",
            description="Get sync operation logs.",
            inputSchema={
                "type": "object",
                "properties": {
                    "limit": {"type": "number", "description": "Number of logs"}
                }
            }
        ),
        
        # ServiceTitan Direct
        Tool(
            name="get_service_details",
            description="Get detailed service information.",
            inputSchema={
                "type": "object",
                "properties": {
                    "serviceId": {"type": "string", "description": "Service ID"}
                },
                "required": ["serviceId"]
            }
        ),
        Tool(
            name="get_material_details",
            description="Get detailed material information with vendor pricing.",
            inputSchema={
                "type": "object",
                "properties": {
                    "materialId": {"type": "string", "description": "Material ID"}
                },
                "required": ["materialId"]
            }
        ),
        Tool(
            name="update_service",
            description="Update a service in ServiceTitan.",
            inputSchema={
                "type": "object",
                "properties": {
                    "serviceId": {"type": "string", "description": "Service ID"},
                    "price": {"type": "number", "description": "New price"},
                    "memberPrice": {"type": "number", "description": "Member price"},
                    "addOnPrice": {"type": "number", "description": "Add-on price"}
                },
                "required": ["serviceId"]
            }
        ),
        Tool(
            name="update_material",
            description="Update a material in ServiceTitan.",
            inputSchema={
                "type": "object",
                "properties": {
                    "materialId": {"type": "string", "description": "Material ID"},
                    "price": {"type": "number", "description": "New price"},
                    "cost": {"type": "number", "description": "New cost"}
                },
                "required": ["materialId"]
            }
        ),
        
        # n8n Integration
        Tool(
            name="list_webhook_events",
            description="List available webhook events.",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="list_webhook_subscriptions",
            description="List active webhook subscriptions.",
            inputSchema={"type": "object", "properties": {}}
        ),
        Tool(
            name="subscribe_webhook",
            description="Subscribe to webhook events.",
            inputSchema={
                "type": "object",
                "properties": {
                    "webhookUrl": {"type": "string", "description": "Webhook URL"},
                    "events": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Events to subscribe"
                    },
                    "name": {"type": "string", "description": "Subscription name"}
                },
                "required": ["webhookUrl", "events"]
            }
        ),
        
        # Natural Language
        Tool(
            name="chat",
            description="Send a natural language message to the pricebook AI agent.",
            inputSchema={
                "type": "object",
                "properties": {
                    "message": {"type": "string", "description": "Natural language message"},
                    "sessionId": {"type": "string", "description": "Session ID"}
                },
                "required": ["message"]
            }
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """Handle tool calls."""
    session_id = arguments.get("sessionId", DEFAULT_SESSION_ID)
    
    try:
        result = None
        
        # Search Tools
        if name == "search_pricebook":
            result = await chat_with_agent(session_id, f"search {arguments['query']}")
        
        elif name == "list_categories":
            result = await chat_with_agent(session_id, "show categories")
        
        elif name == "get_materials":
            if arguments.get("category"):
                result = await chat_with_agent(session_id, f"show {arguments['category']} materials")
            else:
                result = await api_request(f"/pricebook/materials?pageSize={arguments.get('limit', 25)}")
        
        elif name == "get_services":
            if arguments.get("category"):
                result = await chat_with_agent(session_id, f"show {arguments['category']} services")
            else:
                result = await api_request(f"/pricebook/services?pageSize={arguments.get('limit', 25)}")
        
        elif name == "get_equipment":
            result = await api_request(f"/pricebook/equipment?pageSize={arguments.get('limit', 25)}")
        
        # Estimate Tools
        elif name == "start_estimate":
            job_ref = f"job {arguments['jobId']}" if arguments.get("jobId") else arguments.get("jobName", "new job")
            result = await chat_with_agent(session_id, f"start estimate for {job_ref}")
        
        elif name == "add_to_estimate":
            result = await chat_with_agent(session_id, f"add {arguments['items']}")
        
        elif name == "show_estimate":
            result = await chat_with_agent(session_id, "show estimate")
        
        elif name == "remove_from_estimate":
            result = await chat_with_agent(session_id, f"remove {arguments['item']}")
        
        elif name == "create_estimate":
            if arguments.get("confirm"):
                await chat_with_agent(session_id, "create estimate")
                result = await chat_with_agent(session_id, "yes")
            else:
                result = await chat_with_agent(session_id, "create estimate")
        
        elif name == "clear_estimate":
            result = await chat_with_agent(session_id, "clear estimate")
        
        # Sync Tools
        elif name == "get_sync_status":
            result = await api_request("/api/sync/pricebook/status")
        
        elif name == "trigger_sync":
            result = await api_request(f"/api/sync/pricebook/{arguments['type']}", "POST")
        
        elif name == "get_sync_logs":
            result = await api_request(f"/api/sync/pricebook/logs?limit={arguments.get('limit', 10)}")
        
        # ServiceTitan Direct
        elif name == "get_service_details":
            result = await api_request(f"/pricebook/services/{arguments['serviceId']}")
        
        elif name == "get_material_details":
            result = await api_request(f"/pricebook/materials/{arguments['materialId']}")
        
        elif name == "update_service":
            update = {}
            if "price" in arguments: update["price"] = arguments["price"]
            if "memberPrice" in arguments: update["memberPrice"] = arguments["memberPrice"]
            if "addOnPrice" in arguments: update["addOnPrice"] = arguments["addOnPrice"]
            result = await api_request(f"/pricebook/services/{arguments['serviceId']}", "PATCH", update)
        
        elif name == "update_material":
            update = {}
            if "price" in arguments: update["price"] = arguments["price"]
            if "cost" in arguments: update["cost"] = arguments["cost"]
            result = await api_request(f"/pricebook/materials/{arguments['materialId']}", "PATCH", update)
        
        # n8n Integration
        elif name == "list_webhook_events":
            result = await api_request("/api/n8n/events")
        
        elif name == "list_webhook_subscriptions":
            result = await api_request("/api/n8n/subscriptions")
        
        elif name == "subscribe_webhook":
            result = await api_request("/api/n8n/subscribe", "POST", {
                "webhookUrl": arguments["webhookUrl"],
                "events": arguments["events"],
                "name": arguments.get("name")
            })
        
        # Natural Language
        elif name == "chat":
            result = await chat_with_agent(session_id, arguments["message"])
        
        else:
            return [TextContent(type="text", text=f"Unknown tool: {name}")]
        
        # Format response
        if result and result.get("message"):
            content = result["message"]
            ctx = result.get("context", {})
            if ctx.get("estimateTotal"):
                content += f"\n\n[Estimate: {ctx.get('estimateItemCount', 0)} items, ${ctx['estimateTotal']}]"
        else:
            content = json.dumps(result, indent=2, default=str)
        
        return [TextContent(type="text", text=content)]
    
    except Exception as e:
        return [TextContent(type="text", text=f"Error: {str(e)}")]


# ============================================
# RESOURCES
# ============================================

@server.list_resources()
async def list_resources() -> list[Resource]:
    """List available resources."""
    return [
        Resource(
            uri="pricebook://status",
            name="Pricebook Status",
            description="Current sync status and statistics",
            mimeType="application/json"
        ),
        Resource(
            uri="pricebook://categories",
            name="Pricebook Categories",
            description="All pricebook categories",
            mimeType="application/json"
        ),
        Resource(
            uri="pricebook://webhook-events",
            name="Webhook Events",
            description="Available webhook events",
            mimeType="application/json"
        ),
    ]


@server.read_resource()
async def read_resource(uri: str) -> str:
    """Read a resource."""
    if uri == "pricebook://status":
        data = await api_request("/api/sync/pricebook/status")
    elif uri == "pricebook://categories":
        result = await chat_with_agent(DEFAULT_SESSION_ID, "show categories")
        data = result.get("data", result)
    elif uri == "pricebook://webhook-events":
        data = await api_request("/api/n8n/events")
    else:
        raise ValueError(f"Unknown resource: {uri}")
    
    return json.dumps(data, indent=2, default=str)


# ============================================
# MAIN
# ============================================

async def main():
    """Run the MCP server."""
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
