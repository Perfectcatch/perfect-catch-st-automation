#!/usr/bin/env node
/**
 * Fetch GHL Pipeline Stages
 * Retrieves all pipeline and stage IDs from GoHighLevel
 *
 * Usage: node scripts/fetch-ghl-stages.js
 */

import 'dotenv/config';
import { getPipelines } from '../src/integrations/ghl/pipelines.js';

// Slugify stage name for env variable
function slugify(name) {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

async function main() {
  const locationId = process.env.GHL_LOCATION_ID;

  if (!locationId) {
    console.error('ERROR: GHL_LOCATION_ID not set in .env');
    process.exit(1);
  }

  if (!process.env.GHL_API_KEY) {
    console.error('ERROR: GHL_API_KEY not set in .env');
    process.exit(1);
  }

  console.log('\n=== Fetching GHL Pipelines & Stages ===\n');
  console.log(`Location ID: ${locationId}\n`);

  try {
    const pipelines = await getPipelines(locationId);

    if (!pipelines || pipelines.length === 0) {
      console.log('No pipelines found for this location.');
      return;
    }

    // Display all pipelines and stages
    for (const pipeline of pipelines) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`PIPELINE: ${pipeline.name}`);
      console.log(`ID: ${pipeline.id}`);
      console.log(`${'='.repeat(60)}`);
      console.log('\nStages:');

      for (let i = 0; i < pipeline.stages.length; i++) {
        const stage = pipeline.stages[i];
        console.log(`  ${i + 1}. ${stage.name}`);
        console.log(`     ID: ${stage.id}`);
      }
    }

    // Generate .env format for Sales Pipeline
    console.log('\n\n' + '='.repeat(60));
    console.log('=== COPY TO .env FILE ===');
    console.log('='.repeat(60) + '\n');

    const salesPipeline = pipelines.find(p =>
      p.name.toLowerCase().includes('sales')
    );

    if (salesPipeline) {
      console.log(`# GHL Sales Pipeline`);
      console.log(`GHL_PIPELINE_SALES_ID=${salesPipeline.id}\n`);
      console.log(`# Sales Pipeline Stages`);

      for (const stage of salesPipeline.stages) {
        const envKey = `GHL_STAGE_${slugify(stage.name)}`;
        console.log(`${envKey}=${stage.id}`);
      }
    }

    const installPipeline = pipelines.find(p =>
      p.name.toLowerCase().includes('install')
    );

    if (installPipeline) {
      console.log(`\n# GHL Install Pipeline`);
      console.log(`GHL_PIPELINE_INSTALL_ID=${installPipeline.id}\n`);
      console.log(`# Install Pipeline Stages`);

      for (const stage of installPipeline.stages) {
        const envKey = `GHL_STAGE_INSTALL_${slugify(stage.name)}`;
        console.log(`${envKey}=${stage.id}`);
      }
    }

    // Generate ghl-stages.js config format
    console.log('\n\n' + '='.repeat(60));
    console.log('=== ghl-stages.js CONFIG FORMAT ===');
    console.log('='.repeat(60) + '\n');

    console.log('// Updated Sales Pipeline stages');
    console.log('SALES_PIPELINE: {');
    console.log(`  id: '${salesPipeline?.id || 'PIPELINE_ID'}',`);
    console.log(`  name: '${salesPipeline?.name || 'SALES PIPELINE'}',`);
    console.log('  stages: {');

    if (salesPipeline) {
      for (const stage of salesPipeline.stages) {
        const key = slugify(stage.name);
        console.log(`    ${key}: '${stage.id}',`);
      }
    }

    console.log('  }');
    console.log('}');

    console.log('\n\nDone!');

  } catch (error) {
    console.error('Error fetching pipelines:', error.message);
    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main().catch(console.error);
