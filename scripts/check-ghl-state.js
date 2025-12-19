#!/usr/bin/env node

/**
 * Check GHL Pipeline State
 * Shows actual state from GHL API
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const STAGE_NAMES = {
  // Sales Pipeline
  '3dc14ef1-7883-40d4-9831-61a313a46e0a': 'New Lead',
  '56ab4d16-e629-4315-a755-7755677e03e1': 'Contacted',
  'e439d832-d8af-47a6-b459-26ed1f210f96': 'Appointment Scheduled',
  'a75d3c82-8e40-4624-a401-ccf1cc52cca7': 'Appointment Completed / Proposal Sent',
  'de5601ac-5dbe-4980-a960-b1699b9f4a74': 'Estimate Follow Up',
  '97703c8d-1dc6-46f3-a537-601678cedebd': 'Job Sold',
  'a7ca7df5-0d82-4bd6-9b79-27f4b124a1db': 'Estimate Lost',
  // Install Pipeline
  'acf34a4c-30c1-4511-85ed-d384f0dc8365': 'Estimate Approved / Job Created',
  'e8731690-0d3a-43a9-bed6-921c70027099': 'Pre-Install Planning',
  '67fb706b-9213-475c-a74f-6ce2f787a2cb': 'Scheduled / Ready for Install',
  '56e0e29a-61a9-4ec9-9e86-2ce22a256fbe': 'In Progress / On Site',
  '47780057-58fa-495f-80dc-e1f4cf8f4862': 'On Hold / Return Visit',
  'da971a59-2496-4b7c-9e32-0c0ee82fde76': 'Job Completed'
};

const PIPELINE_NAMES = {
  'fWJfnMsPzwOXgKdWxdjC': 'SALES PIPELINE',
  'bbsMqYClVMDN26Lr6HdV': 'INSTALL PIPELINE'
};

async function checkGHLState() {
  const client = axios.create({
    baseURL: 'https://services.leadconnectorhq.com',
    headers: {
      'Content-Type': 'application/json',
      'Version': '2021-07-28',
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`
    }
  });

  console.log('');
  console.log('='.repeat(60));
  console.log('  ACTUAL GHL PIPELINE STATE');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Check Sales Pipeline
    console.log('SALES PIPELINE:');
    console.log('-'.repeat(40));

    const salesResp = await client.get('/opportunities/search', {
      params: {
        location_id: 'kgnEweBlJ8Uq11kNc3Xs',
        pipeline_id: 'fWJfnMsPzwOXgKdWxdjC'
      }
    });

    const salesOpps = salesResp.data.opportunities || [];

    // Group by stage
    const salesByStage = {};
    salesOpps.forEach(o => {
      const stageName = STAGE_NAMES[o.pipelineStageId] || o.pipelineStageId;
      if (!salesByStage[stageName]) salesByStage[stageName] = [];
      salesByStage[stageName].push(o.name);
    });

    for (const [stage, names] of Object.entries(salesByStage)) {
      console.log(`\n${stage}: ${names.length}`);
      names.forEach(n => console.log(`  - ${n}`));
    }

    // Check Install Pipeline
    console.log('\n');
    console.log('INSTALL PIPELINE:');
    console.log('-'.repeat(40));

    const installResp = await client.get('/opportunities/search', {
      params: {
        location_id: 'kgnEweBlJ8Uq11kNc3Xs',
        pipeline_id: 'bbsMqYClVMDN26Lr6HdV'
      }
    });

    const installOpps = installResp.data.opportunities || [];

    if (installOpps.length === 0) {
      console.log('\n(No opportunities in Install Pipeline)');
    } else {
      const installByStage = {};
      installOpps.forEach(o => {
        const stageName = STAGE_NAMES[o.pipelineStageId] || o.pipelineStageId;
        if (!installByStage[stageName]) installByStage[stageName] = [];
        installByStage[stageName].push(o.name);
      });

      for (const [stage, names] of Object.entries(installByStage)) {
        console.log(`\n${stage}: ${names.length}`);
        names.forEach(n => console.log(`  - ${n}`));
      }
    }

    console.log('\n');
    console.log('='.repeat(60));
    console.log(`  TOTALS: Sales=${salesOpps.length}, Install=${installOpps.length}`);
    console.log('='.repeat(60));
    console.log('');

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

checkGHLState();
