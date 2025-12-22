/**
 * Download Pricebook Images to PostgreSQL
 *
 * Downloads images from ServiceTitan and stores them directly in PostgreSQL.
 * Uses the /pricebook/images?path= endpoint which returns a 302 redirect to Azure Blob.
 *
 * Usage:
 *   node scripts/download-pricebook-images-to-db.js
 *   node scripts/download-pricebook-images-to-db.js --type services
 *   node scripts/download-pricebook-images-to-db.js --limit 100
 *   node scripts/download-pricebook-images-to-db.js --force  # Re-download existing
 *   node scripts/download-pricebook-images-to-db.js --active-only  # Only active items
 */

import pg from 'pg';
import config from '../src/config/index.js';
import { getAccessToken } from '../src/services/tokenManager.js';

const pool = new pg.Pool({ connectionString: config.database.url, max: 5 });
const tenantId = config.serviceTitan.tenantId;
const appKey = config.serviceTitan.appKey;

// Parse command line arguments
const args = process.argv.slice(2);
const typeFilter = args.includes('--type') ? args[args.indexOf('--type') + 1] : null;
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const force = args.includes('--force');
const activeOnly = args.includes('--active-only');

/**
 * Download an image from ServiceTitan
 */
async function downloadImage(imagePath) {
  const accessToken = await getAccessToken();

  // Use the images endpoint that returns a 302 redirect
  const url = `https://api.servicetitan.io/pricebook/v2/tenant/${tenantId}/images?path=${encodeURIComponent(imagePath)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'ST-App-Key': appKey,
    },
    redirect: 'manual',
  });

  if (response.status === 302) {
    const redirectUrl = response.headers.get('location');
    if (redirectUrl) {
      const imageResponse = await fetch(redirectUrl);
      if (imageResponse.ok) {
        const buffer = Buffer.from(await imageResponse.arrayBuffer());
        const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';
        return { buffer, contentType };
      }
    }
  }

  // Try direct response
  if (response.ok) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const contentTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif' };
    return { buffer, contentType: contentTypes[ext] || 'image/jpeg' };
  }

  throw new Error(`Failed to download: ${response.status}`);
}

/**
 * Process a single table
 */
async function processTable(tableName, type) {
  const client = await pool.connect();
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;

  try {
    console.log(`\n=== Processing ${tableName} ===`);

    // Get items with assets but no image_data
    let query;
    const activeFilter = activeOnly ? 'AND active = true' : '';

    if (type === 'categories') {
      // Categories use 'image' field instead of 'assets'
      query = `
        SELECT st_id, image as asset_url
        FROM ${tableName}
        WHERE image IS NOT NULL AND image != ''
        ${force ? '' : 'AND image_data IS NULL'}
        ${activeFilter}
        ${limit ? `LIMIT ${limit}` : ''}
      `;
    } else {
      // Services, materials, equipment use 'assets' array
      query = `
        SELECT st_id, assets->0->>'url' as asset_url
        FROM ${tableName}
        WHERE jsonb_array_length(COALESCE(assets, '[]'::jsonb)) > 0
        ${force ? '' : 'AND image_data IS NULL'}
        ${activeFilter}
        ${limit ? `LIMIT ${limit}` : ''}
      `;
    }

    const result = await client.query(query);
    console.log(`Found ${result.rows.length} items to process`);

    for (let i = 0; i < result.rows.length; i++) {
      const row = result.rows[i];
      const assetUrl = row.asset_url;

      if (!assetUrl) {
        skipped++;
        continue;
      }

      try {
        const { buffer, contentType } = await downloadImage(assetUrl);

        await client.query(`
          UPDATE ${tableName}
          SET image_data = $1, image_content_type = $2, image_downloaded_at = NOW()
          WHERE st_id = $3
        `, [buffer, contentType, row.st_id]);

        downloaded++;

        if (downloaded % 50 === 0) {
          console.log(`  Downloaded ${downloaded}/${result.rows.length} (${Math.round(buffer.length / 1024)}KB)`);
        }

        // Small delay to avoid rate limiting
        if (downloaded % 10 === 0) {
          await new Promise(r => setTimeout(r, 100));
        }
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`  Error downloading ${row.st_id}:`, err.message);
        }
      }
    }
  } finally {
    client.release();
  }

  return { downloaded, skipped, errors };
}

async function main() {
  console.log('=== Download Pricebook Images to PostgreSQL ===');
  console.log(`Force re-download: ${force}`);
  console.log(`Type filter: ${typeFilter || 'all'}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log(`Active only: ${activeOnly}`);

  const tables = [
    { name: 'raw_st_pricebook_services', type: 'services' },
    { name: 'raw_st_pricebook_materials', type: 'materials' },
    { name: 'raw_st_pricebook_equipment', type: 'equipment' },
    { name: 'raw_st_pricebook_categories', type: 'categories' },
  ];

  const results = {};

  for (const { name, type } of tables) {
    if (typeFilter && type !== typeFilter) {
      continue;
    }

    results[type] = await processTable(name, type);
  }

  console.log('\n=== Summary ===');
  for (const [type, stats] of Object.entries(results)) {
    console.log(`${type}: ${stats.downloaded} downloaded, ${stats.skipped} skipped, ${stats.errors} errors`);
  }

  // Show database size impact
  const client = await pool.connect();
  try {
    const sizeResult = await client.query(`
      SELECT
        relname as table_name,
        pg_size_pretty(pg_total_relation_size(relid)) as total_size
      FROM pg_catalog.pg_statio_user_tables
      WHERE relname LIKE 'raw_st_pricebook%'
      ORDER BY pg_total_relation_size(relid) DESC
    `);
    console.log('\n=== Table Sizes ===');
    console.table(sizeResult.rows);
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch(console.error);
