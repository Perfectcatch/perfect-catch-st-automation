#!/usr/bin/env node

/**
 * Get GHL Custom Fields
 * Retrieves custom field configuration including option IDs for multi-select fields
 */

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ghlClient = axios.create({
  baseURL: 'https://services.leadconnectorhq.com',
  headers: {
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
    'Authorization': `Bearer ${process.env.GHL_API_KEY}`
  }
});

async function getCustomFields() {
  console.log('');
  console.log('='.repeat(60));
  console.log('  GHL CUSTOM FIELDS');
  console.log('='.repeat(60));
  console.log('');

  try {
    // Get custom fields for the location
    const resp = await ghlClient.get('/locations/kgnEweBlJ8Uq11kNc3Xs/customFields');

    const fields = resp.data.customFields || [];

    console.log(`Found ${fields.length} custom fields\n`);

    // Find opportunity fields (model = 'opportunity')
    const oppFields = fields.filter(f => f.model === 'opportunity');

    console.log('OPPORTUNITY CUSTOM FIELDS:');
    console.log('-'.repeat(40));

    for (const field of oppFields) {
      console.log(`\nField: ${field.name}`);
      console.log(`  ID: ${field.id}`);
      console.log(`  Key: ${field.fieldKey}`);
      console.log(`  Type: ${field.dataType}`);

      if (field.options && field.options.length > 0) {
        console.log(`  Options:`);
        for (const opt of field.options) {
          console.log(`    - ${opt.name}: ${opt.id}`);
        }
      }
    }

    // Look specifically for techs field
    const techsField = fields.find(f =>
      f.name.toLowerCase().includes('tech') && f.model === 'opportunity'
    );

    if (techsField) {
      console.log('\n');
      console.log('='.repeat(60));
      console.log('  TECHS FIELD DETAILS');
      console.log('='.repeat(60));
      console.log(JSON.stringify(techsField, null, 2));
    }

  } catch (err) {
    console.error('Error:', err.response?.data || err.message);
  }
}

getCustomFields();
