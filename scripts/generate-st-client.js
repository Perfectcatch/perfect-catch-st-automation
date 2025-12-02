#!/usr/bin/env node

/**
 * ServiceTitan Client Generator
 * 
 * Generates typed client code from OpenAPI specifications.
 * 
 * Usage:
 *   node scripts/generate-st-client.js [--dry-run] [--verbose]
 * 
 * Options:
 *   --dry-run   Preview changes without writing files
 *   --verbose   Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const SRC_DIR = path.join(__dirname, '..', 'src');
const ENDPOINT_MAP_FILE = path.join(DOCS_DIR, 'endpoint-map.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

/**
 * Load the endpoint map
 */
function loadEndpointMap() {
  if (!fs.existsSync(ENDPOINT_MAP_FILE)) {
    console.error('❌ endpoint-map.json not found. Run parse-openapi.js first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(ENDPOINT_MAP_FILE, 'utf8'));
}

/**
 * Convert path to camelCase function name
 */
function pathToFunctionName(path, method) {
  // Remove tenant placeholder and clean up
  const cleanPath = path
    .replace('/tenant/{tenant}/', '')
    .replace(/\{[^}]+\}/g, 'ById')
    .replace(/[/-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  
  const prefix = method.toLowerCase();
  const name = cleanPath
    .split('_')
    .map((part, i) => i === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  
  return `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * Generate TypeScript-style JSDoc for an endpoint
 */
function generateJSDoc(endpoint) {
  const lines = ['/**'];
  lines.push(` * ${endpoint.summary || endpoint.operationId}`);
  
  if (endpoint.description && endpoint.description !== endpoint.summary) {
    lines.push(` * ${endpoint.description}`);
  }
  
  lines.push(` * @method ${endpoint.method}`);
  lines.push(` * @path ${endpoint.path}`);
  
  if (endpoint.pathParams?.length > 0) {
    endpoint.pathParams.forEach(p => {
      lines.push(` * @param {${p.type}} ${p.name} - ${p.description || 'Path parameter'}`);
    });
  }
  
  if (endpoint.queryParams?.length > 0) {
    lines.push(` * @param {Object} [query] - Query parameters`);
  }
  
  if (endpoint.requestBody) {
    lines.push(` * @param {Object} body - Request body`);
  }
  
  lines.push(' */');
  return lines.join('\n');
}

/**
 * Generate endpoint summary report
 */
function generateReport(registry) {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   ServiceTitan Client Generator                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  console.log(`📁 Endpoint Map: ${ENDPOINT_MAP_FILE}`);
  console.log(`📅 Generated: ${registry.generatedAt}`);
  console.log(`📊 Total Endpoints: ${registry.summary.totalEndpoints}`);
  console.log(`📦 Total Modules: ${registry.summary.totalModules}\n`);
  
  console.log('Modules:');
  Object.entries(registry.modules).forEach(([name, info]) => {
    console.log(`  • ${info.title} (${name}): ${info.endpointCount} endpoints`);
  });
  
  console.log('\nEndpoints by Method:');
  Object.entries(registry.summary.byMethod).forEach(([method, count]) => {
    console.log(`  ${method}: ${count}`);
  });
  
  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN MODE - No files will be written\n');
  }
}

/**
 * Generate route file content for a module
 */
function generateRouteFile(moduleName, endpoints) {
  const moduleEndpoints = endpoints.filter(e => e.module === moduleName);
  
  if (moduleEndpoints.length === 0) {
    return null;
  }
  
  // Group by tag
  const byTag = {};
  moduleEndpoints.forEach(ep => {
    const tag = ep.tags[0] || 'default';
    if (!byTag[tag]) byTag[tag] = [];
    byTag[tag].push(ep);
  });
  
  let content = `/**
 * Auto-generated routes for ${moduleName}
 * Generated: ${new Date().toISOString()}
 * Endpoints: ${moduleEndpoints.length}
 */

import { Router } from 'express';
import { stRequest } from '../services/stClient.js';

const router = Router();

`;

  Object.entries(byTag).forEach(([tag, eps]) => {
    content += `// ═══════════════════════════════════════════════════════════════\n`;
    content += `// ${tag.toUpperCase()}\n`;
    content += `// ═══════════════════════════════════════════════════════════════\n\n`;
    
    eps.forEach(ep => {
      const routePath = ep.path
        .replace('/tenant/{tenant}', '')
        .replace(/\{([^}]+)\}/g, ':$1');
      
      content += `// ${ep.summary || ep.operationId}\n`;
      content += `router.${ep.method.toLowerCase()}('${routePath}', async (req, res, next) => {\n`;
      content += `  try {\n`;
      content += `    const result = await stRequest('${ep.fullUrl}', {\n`;
      content += `      method: '${ep.method}',\n`;
      content += `      query: req.query,\n`;
      if (ep.requestBody) {
        content += `      body: req.body,\n`;
      }
      content += `    });\n`;
      content += `    res.status(result.status).json(result.data);\n`;
      content += `  } catch (error) {\n`;
      content += `    next(error);\n`;
      content += `  }\n`;
      content += `});\n\n`;
    });
  });
  
  content += `export default router;\n`;
  
  return content;
}

/**
 * Main function
 */
function main() {
  const registry = loadEndpointMap();
  generateReport(registry);
  
  if (VERBOSE) {
    console.log('\nEndpoint Details:');
    registry.endpoints.slice(0, 10).forEach(ep => {
      console.log(`  ${ep.method} ${ep.path}`);
      console.log(`    → ${ep.operationId}`);
    });
    if (registry.endpoints.length > 10) {
      console.log(`  ... and ${registry.endpoints.length - 10} more`);
    }
  }
  
  console.log('\n✅ Client generation complete!');
  console.log('\nTo use the new endpoints:');
  console.log('  1. Import from src/lib/stEndpoints.js');
  console.log('  2. Use stRequest() from src/services/stClient.js');
  console.log('  3. Routes are available at /accounting, /dispatch, /pricebook, etc.');
  
  console.log('\nExample:');
  console.log(`  import { stEndpoints } from './lib/stEndpoints.js';`);
  console.log(`  import { stRequest } from './services/stClient.js';`);
  console.log(`  `);
  console.log(`  const result = await stRequest(stEndpoints.invoices.list(), {`);
  console.log(`    method: 'GET',`);
  console.log(`    query: { page: 1, pageSize: 50 }`);
  console.log(`  });`);
}

main();
