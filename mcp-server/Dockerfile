# Pricebook MCP Server
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Make executable
RUN chmod +x index.js

# Run MCP server
CMD ["node", "index.js"]
