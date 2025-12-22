/**
 * Upload Pricebook Images to S3
 *
 * This script uploads pricebook images to S3 and updates the database with the S3 URLs.
 *
 * Usage:
 *   node scripts/upload-pricebook-images.js --source ./images
 *   node scripts/upload-pricebook-images.js --from-export ./pricebook-export
 *
 * The script expects images in a directory structure like:
 *   ./images/
 *     services/
 *       {st_id}.jpg
 *     materials/
 *       {st_id}.jpg
 *     equipment/
 *       {st_id}.jpg
 *     categories/
 *       {st_id}.jpg
 *
 * Or from a ServiceTitan export:
 *   ./pricebook-export/
 *     Images/
 *       Service/
 *         {uuid}.jpg
 *       Material/
 *         {uuid}.jpg
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import config from '../src/config/index.js';
import { uploadPricebookImage, getPublicUrl, generateS3Key } from '../src/services/s3Client.js';
import { createLogger } from '../src/lib/logger.js';

const logger = createLogger('upload-pricebook-images');
const pool = new pg.Pool({ connectionString: config.database.url, max: 5 });

// Parse command line arguments
const args = process.argv.slice(2);
const sourceDir = args.includes('--source') ? args[args.indexOf('--source') + 1] : null;
const exportDir = args.includes('--from-export') ? args[args.indexOf('--from-export') + 1] : null;

if (!sourceDir && !exportDir) {
  console.log(`
Usage:
  node scripts/upload-pricebook-images.js --source ./images
  node scripts/upload-pricebook-images.js --from-export ./pricebook-export

Options:
  --source       Directory with organized images (services/, materials/, equipment/, categories/)
  --from-export  Directory from ServiceTitan pricebook export (Images/Service/, Images/Material/, etc.)
  `);
  process.exit(1);
}

/**
 * Get content type from file extension
 */
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return types[ext] || 'image/jpeg';
}

/**
 * Upload images from organized directory structure
 */
async function uploadFromOrganized(baseDir) {
  const client = await pool.connect();
  const stats = { uploaded: 0, skipped: 0, errors: 0 };

  try {
    const typeMapping = {
      services: { table: 'raw_st_pricebook_services', type: 'services' },
      materials: { table: 'raw_st_pricebook_materials', type: 'materials' },
      equipment: { table: 'raw_st_pricebook_equipment', type: 'equipment' },
      categories: { table: 'raw_st_pricebook_categories', type: 'categories' },
    };

    for (const [folder, { table, type }] of Object.entries(typeMapping)) {
      const folderPath = path.join(baseDir, folder);

      if (!fs.existsSync(folderPath)) {
        console.log(`Skipping ${folder} (directory not found)`);
        continue;
      }

      console.log(`\nProcessing ${folder}...`);
      const files = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));

      for (const file of files) {
        const stId = path.basename(file, path.extname(file));
        const filePath = path.join(folderPath, file);

        try {
          // Check if item exists in database
          const check = await client.query(
            `SELECT st_id, image_url FROM ${table} WHERE st_id = $1`,
            [stId]
          );

          if (check.rows.length === 0) {
            console.log(`  Skipping ${file} (st_id ${stId} not found in ${table})`);
            stats.skipped++;
            continue;
          }

          if (check.rows[0].image_url) {
            console.log(`  Skipping ${file} (already has image_url)`);
            stats.skipped++;
            continue;
          }

          // Read and upload image
          const buffer = fs.readFileSync(filePath);
          const contentType = getContentType(file);

          const url = await uploadPricebookImage({
            type,
            tenantId: config.serviceTitan.tenantId,
            stId,
            filename: file,
            buffer,
            contentType,
          });

          // Update database
          await client.query(
            `UPDATE ${table} SET image_url = $1 WHERE st_id = $2`,
            [url, stId]
          );

          console.log(`  Uploaded ${file} -> ${url}`);
          stats.uploaded++;
        } catch (error) {
          console.error(`  Error uploading ${file}:`, error.message);
          stats.errors++;
        }
      }
    }
  } finally {
    client.release();
  }

  return stats;
}

/**
 * Upload images from ServiceTitan export directory
 * Maps the UUID filenames to st_ids using the assets column in the database
 */
async function uploadFromExport(exportDir) {
  const client = await pool.connect();
  const stats = { uploaded: 0, skipped: 0, errors: 0, notFound: 0 };

  try {
    const typeMapping = {
      Service: { table: 'raw_st_pricebook_services', type: 'services' },
      Material: { table: 'raw_st_pricebook_materials', type: 'materials' },
      Equipment: { table: 'raw_st_pricebook_equipment', type: 'equipment' },
      Category: { table: 'raw_st_pricebook_categories', type: 'categories' },
    };

    for (const [folder, { table, type }] of Object.entries(typeMapping)) {
      const folderPath = path.join(exportDir, 'Images', folder);

      if (!fs.existsSync(folderPath)) {
        console.log(`Skipping ${folder} (directory not found at ${folderPath})`);
        continue;
      }

      console.log(`\nProcessing ${folder}...`);
      const files = fs.readdirSync(folderPath).filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f));
      console.log(`Found ${files.length} image files`);

      // Build a lookup from filename to st_id
      console.log('Building filename -> st_id lookup...');
      const lookup = await client.query(`
        SELECT st_id, assets
        FROM ${table}
        WHERE assets IS NOT NULL AND jsonb_array_length(assets) > 0
      `);

      const filenameToStId = new Map();
      for (const row of lookup.rows) {
        for (const asset of row.assets) {
          if (asset.fileName) {
            filenameToStId.set(asset.fileName.toLowerCase(), row.st_id);
          }
          if (asset.url) {
            const urlFilename = path.basename(asset.url);
            filenameToStId.set(urlFilename.toLowerCase(), row.st_id);
          }
        }
      }

      console.log(`Built lookup with ${filenameToStId.size} entries`);

      for (const file of files) {
        const stId = filenameToStId.get(file.toLowerCase());

        if (!stId) {
          stats.notFound++;
          continue;
        }

        try {
          // Check if already has image_url
          const check = await client.query(
            `SELECT image_url FROM ${table} WHERE st_id = $1`,
            [stId]
          );

          if (check.rows[0]?.image_url) {
            stats.skipped++;
            continue;
          }

          const filePath = path.join(folderPath, file);
          const buffer = fs.readFileSync(filePath);
          const contentType = getContentType(file);

          const url = await uploadPricebookImage({
            type,
            tenantId: config.serviceTitan.tenantId,
            stId,
            filename: file,
            buffer,
            contentType,
          });

          await client.query(
            `UPDATE ${table} SET image_url = $1 WHERE st_id = $2`,
            [url, stId]
          );

          stats.uploaded++;

          if (stats.uploaded % 100 === 0) {
            console.log(`  Uploaded ${stats.uploaded} images...`);
          }
        } catch (error) {
          console.error(`  Error uploading ${file}:`, error.message);
          stats.errors++;
        }
      }
    }
  } finally {
    client.release();
  }

  return stats;
}

async function main() {
  console.log('=== Pricebook Image Upload ===\n');

  if (!config.aws?.accessKeyId || !config.aws?.s3Bucket) {
    console.error('Error: AWS credentials not configured.');
    console.error('Please set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in .env');
    process.exit(1);
  }

  let stats;

  if (sourceDir) {
    console.log(`Uploading from organized directory: ${sourceDir}`);
    stats = await uploadFromOrganized(sourceDir);
  } else if (exportDir) {
    console.log(`Uploading from ServiceTitan export: ${exportDir}`);
    stats = await uploadFromExport(exportDir);
  }

  console.log('\n=== Upload Complete ===');
  console.log(`Uploaded: ${stats.uploaded}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  if (stats.notFound !== undefined) {
    console.log(`Not found in DB: ${stats.notFound}`);
  }

  await pool.end();
}

main().catch(console.error);
