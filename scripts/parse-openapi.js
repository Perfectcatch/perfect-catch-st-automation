#!/usr/bin/env node

/**
 * OpenAPI Parser Script
 * Parses all ServiceTitan OpenAPI specification files and generates:
 * 1. endpoint-map.json - Complete endpoint registry
 * 2. Console report of all endpoints
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const OUTPUT_FILE = path.join(DOCS_DIR, 'endpoint-map.json');

/**
 * Parse a single OpenAPI file
 */
function parseOpenAPIFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Handle both JSON and YAML (basic YAML support)
  let spec;
  if (filePath.endsWith('.json')) {
    spec = JSON.parse(content);
  } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
    // Basic check - if it's our local openapi.yaml, skip it (it's our own API doc)
    if (content.includes('Perfect Catch ST Automation')) {
      return null;
    }
    // For now, skip YAML files that aren't our own
    return null;
  }
  
  // Skip non-OpenAPI files (like n8n workflows)
  if (!spec.openapi && !spec.swagger) {
    return null;
  }
  
  return spec;
}

/**
 * Extract module name from server URL or title
 */
function extractModuleName(spec) {
  const title = spec.info?.title || 'Unknown';
  const serverUrl = spec.servers?.[0]?.url || '';
  
  // Extract module from URL like https://api-integration.servicetitan.io/accounting/v2
  const urlMatch = serverUrl.match(/servicetitan\.io\/([^/]+)\/v\d+/);
  const moduleFromUrl = urlMatch ? urlMatch[1] : null;
  
  return {
    title,
    module: moduleFromUrl || title.toLowerCase().replace(/\s+/g, '-'),
    baseUrl: serverUrl,
    version: spec.info?.version || '1.0'
  };
}

/**
 * Extract parameter details
 */
function extractParameters(parameters = []) {
  const pathParams = [];
  const queryParams = [];
  
  parameters.forEach(param => {
    const paramInfo = {
      name: param.name,
      type: param.schema?.type || 'string',
      format: param.schema?.format,
      required: param.required || false,
      description: param.description || '',
      nullable: param.schema?.nullable || false
    };
    
    if (param.in === 'path') {
      pathParams.push(paramInfo);
    } else if (param.in === 'query') {
      queryParams.push(paramInfo);
    }
  });
  
  return { pathParams, queryParams };
}

/**
 * Extract request body schema
 */
function extractRequestBody(requestBody) {
  if (!requestBody) return null;
  
  const content = requestBody.content?.['application/json'];
  if (!content) return null;
  
  return {
    required: requestBody.required || false,
    schema: content.schema,
    example: content.example
  };
}

/**
 * Extract response schema
 */
function extractResponse(responses) {
  const successResponse = responses?.['200'] || responses?.['201'];
  if (!successResponse) return null;
  
  const content = successResponse.content?.['application/json'];
  if (!content) return null;
  
  return {
    description: successResponse.description,
    schema: content.schema,
    example: content.example
  };
}

/**
 * Parse all endpoints from a spec
 */
function parseEndpoints(spec, moduleInfo) {
  const endpoints = [];
  
  Object.entries(spec.paths || {}).forEach(([pathKey, methods]) => {
    Object.entries(methods).forEach(([method, details]) => {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
        return;
      }
      
      const { pathParams, queryParams } = extractParameters(details.parameters);
      
      endpoints.push({
        method: method.toUpperCase(),
        path: pathKey,
        fullUrl: `${moduleInfo.baseUrl}${pathKey}`,
        operationId: details.operationId || `${method}_${pathKey}`,
        summary: details.summary || '',
        description: details.description || '',
        tags: details.tags || [],
        module: moduleInfo.module,
        pathParams,
        queryParams,
        requestBody: extractRequestBody(details.requestBody),
        response: extractResponse(details.responses),
        deprecated: details.deprecated || false
      });
    });
  });
  
  return endpoints;
}

/**
 * Main function
 */
function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   ServiceTitan OpenAPI Parser                              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const files = fs.readdirSync(DOCS_DIR).filter(f => 
    (f.endsWith('.json') || f.endsWith('.yaml') || f.endsWith('.yml')) &&
    !f.includes('endpoint-map') &&
    !f.includes('New Customers') // Skip n8n workflow
  );
  
  console.log(`Found ${files.length} potential OpenAPI files\n`);
  
  const registry = {
    generatedAt: new Date().toISOString(),
    version: '1.0.0',
    modules: {},
    endpoints: [],
    summary: {
      totalModules: 0,
      totalEndpoints: 0,
      byMethod: {},
      byModule: {}
    }
  };
  
  const errors = [];
  
  files.forEach(file => {
    const filePath = path.join(DOCS_DIR, file);
    console.log(`Processing: ${file}`);
    
    try {
      const spec = parseOpenAPIFile(filePath);
      
      if (!spec) {
        console.log(`  ⏭️  Skipped (not an OpenAPI spec)\n`);
        return;
      }
      
      const moduleInfo = extractModuleName(spec);
      const endpoints = parseEndpoints(spec, moduleInfo);
      
      // Store module info
      registry.modules[moduleInfo.module] = {
        title: moduleInfo.title,
        baseUrl: moduleInfo.baseUrl,
        version: moduleInfo.version,
        sourceFile: file,
        endpointCount: endpoints.length,
        tags: [...new Set(endpoints.flatMap(e => e.tags))]
      };
      
      // Add endpoints to registry
      registry.endpoints.push(...endpoints);
      
      // Update summary
      registry.summary.totalModules++;
      registry.summary.byModule[moduleInfo.module] = endpoints.length;
      
      endpoints.forEach(ep => {
        registry.summary.byMethod[ep.method] = (registry.summary.byMethod[ep.method] || 0) + 1;
      });
      
      console.log(`  ✅ ${moduleInfo.title}: ${endpoints.length} endpoints`);
      console.log(`     Tags: ${registry.modules[moduleInfo.module].tags.join(', ')}\n`);
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}\n`);
      errors.push({ file, error: error.message });
    }
  });
  
  registry.summary.totalEndpoints = registry.endpoints.length;
  
  // Write output file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(registry, null, 2));
  
  // Print summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Total Modules: ${registry.summary.totalModules}`);
  console.log(`Total Endpoints: ${registry.summary.totalEndpoints}`);
  console.log('\nEndpoints by Method:');
  Object.entries(registry.summary.byMethod).forEach(([method, count]) => {
    console.log(`  ${method}: ${count}`);
  });
  console.log('\nEndpoints by Module:');
  Object.entries(registry.summary.byModule).forEach(([module, count]) => {
    console.log(`  ${module}: ${count}`);
  });
  
  if (errors.length > 0) {
    console.log('\n⚠️  Errors:');
    errors.forEach(e => console.log(`  - ${e.file}: ${e.error}`));
  }
  
  console.log(`\n✅ Output written to: ${OUTPUT_FILE}`);
  
  return registry;
}

// Run
const registry = main();
export default registry;
