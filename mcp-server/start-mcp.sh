#!/bin/bash
# MCP Server Startup Script

cd /opt/docker/servicetitan-ai/perfect-catch-st-automation

# Load required variables from .env
export SERVICE_TITAN_CLIENT_ID=$(grep "^SERVICE_TITAN_CLIENT_ID=" .env | cut -d'=' -f2)
export SERVICE_TITAN_CLIENT_SECRET=$(grep "^SERVICE_TITAN_CLIENT_SECRET=" .env | cut -d'=' -f2)
export SERVICE_TITAN_TENANT_ID=$(grep "^SERVICE_TITAN_TENANT_ID=" .env | cut -d'=' -f2)
export SERVICE_TITAN_APP_KEY=$(grep "^SERVICE_TITAN_APP_KEY=" .env | cut -d'=' -f2)
export ANTHROPIC_API_KEY=$(grep "^ANTHROPIC_API_KEY=" .env | cut -d'=' -f2)

# Database - use MCP_DB_HOST if set, otherwise localhost
DB_HOST="${MCP_DB_HOST:-localhost}"
export DATABASE_URL="postgresql://postgres:Catchadmin%402025@${DB_HOST}:6432/perfectcatch_automation"
export SERVICETITAN_DATABASE_URL="$DATABASE_URL"
export PRICEBOOK_API_URL="${PRICEBOOK_API_URL:-http://localhost:3001}"

exec node /opt/docker/servicetitan-ai/perfect-catch-st-automation/mcp-server/index.js
