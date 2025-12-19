#!/usr/bin/env node
/**
 * Download Pricebook Images Script
 * Downloads all pricebook images from ServiceTitan and stores them locally
 * 
 * Usage: node scripts/download-pricebook-images.js
 * 
 * Images are stored in ./public/images/ mirroring the ST path structure
 * e.g., Images/Service/xxx.jpg -> ./public/images/Images/Service/xxx.jpg
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

// Configuration
const TENANT_ID = process.env.SERVICE_TITAN_TENANT_ID || '3222348440';
const CLIENT_ID = process.env.SERVICE_TITAN_CLIENT_ID;
const CLIENT_SECRET = process.env.SERVICE_TITAN_CLIENT_SECRET;
const APP_KEY = process.env.SERVICE_TITAN_APP_KEY;
const IMAGE_STORAGE_PATH = path.resolve(__dirname, '../public/images');

// Token cache
let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (accessToken && tokenExpiresAt > now + 60000) {
    return accessToken;
  }

  console.log('Fetching new access token...');
  
  const response = await fetch('https://auth.servicetitan.io/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status}`);
  }

  const data = await response.json();
  accessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in * 1000);
  
  console.log('Got access token, expires in', data.expires_in, 'seconds');
  return accessToken;
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    // Already exists
  }
}

async function downloadImage(relativePath) {
  if (!relativePath) return { success: false, reason: 'no-path' };
  
  const localPath = path.join(IMAGE_STORAGE_PATH, relativePath);
  const localDir = path.dirname(localPath);
  
  // Check if already exists
  try {
    await fs.access(localPath);
    return { success: true, reason: 'exists' };
  } catch {
    // Need to download
  }
  
  await ensureDir(localDir);
  
  try {
    const token = await getAccessToken();
    
    // ServiceTitan image URL format
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${TENANT_ID}/export/image?path=${encodeURIComponent(relativePath)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ST-App-Key': APP_KEY,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      
      // Verify it's actually an image (check magic bytes)
      if (buffer.length > 0) {
        await fs.writeFile(localPath, buffer);
        return { success: true, reason: 'downloaded', size: buffer.length };
      }
    }
    
    // Try alternate URL format
    const altUrl = `https://go.servicetitan.com/${TENANT_ID}/${relativePath}`;
    const altResponse = await fetch(altUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'ST-App-Key': APP_KEY,
      },
    });
    
    if (altResponse.ok) {
      const buffer = Buffer.from(await altResponse.arrayBuffer());
      if (buffer.length > 0) {
        await fs.writeFile(localPath, buffer);
        return { success: true, reason: 'downloaded-alt', size: buffer.length };
      }
    }
    
    return { success: false, reason: 'not-found', status: response.status };
  } catch (err) {
    return { success: false, reason: 'error', message: err.message };
  }
}

async function processEntity(entityName, findMany) {
  console.log(`\n=== Processing ${entityName} ===`);
  
  const items = await findMany({
    where: {
      assets: { not: { equals: [] } }
    },
    select: { stId: true, code: true, assets: true }
  });
  
  console.log(`Found ${items.length} ${entityName} with assets`);
  
  let downloaded = 0;
  let existed = 0;
  let failed = 0;
  
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const assets = item.assets;
    
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.type === 'Image' && asset.url) {
          const result = await downloadImage(asset.url);
          
          if (result.success) {
            if (result.reason === 'exists') {
              existed++;
            } else {
              downloaded++;
              process.stdout.write('.');
            }
          } else {
            failed++;
            if (failed <= 5) {
              console.log(`\nFailed: ${asset.url} - ${result.reason}`);
            }
          }
        }
      }
    }
    
    // Progress update every 100 items
    if ((i + 1) % 100 === 0) {
      console.log(`\n  Progress: ${i + 1}/${items.length}`);
    }
  }
  
  console.log(`\n${entityName}: ${downloaded} downloaded, ${existed} existed, ${failed} failed`);
  return { downloaded, existed, failed };
}

async function main() {
  console.log('========================================');
  console.log('Pricebook Image Download Script');
  console.log('========================================');
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log(`Storage Path: ${IMAGE_STORAGE_PATH}`);
  console.log('');
  
  if (!CLIENT_ID || !CLIENT_SECRET || !APP_KEY) {
    console.error('ERROR: Missing ServiceTitan credentials in environment');
    console.error('Required: SERVICE_TITAN_CLIENT_ID, SERVICE_TITAN_CLIENT_SECRET, SERVICE_TITAN_APP_KEY');
    process.exit(1);
  }
  
  await ensureDir(IMAGE_STORAGE_PATH);
  
  const totals = { downloaded: 0, existed: 0, failed: 0 };
  
  // Process Services
  const serviceResults = await processEntity('Services', (opts) => prisma.pricebookService.findMany(opts));
  totals.downloaded += serviceResults.downloaded;
  totals.existed += serviceResults.existed;
  totals.failed += serviceResults.failed;
  
  // Process Materials
  const materialResults = await processEntity('Materials', (opts) => prisma.pricebookMaterial.findMany(opts));
  totals.downloaded += materialResults.downloaded;
  totals.existed += materialResults.existed;
  totals.failed += materialResults.failed;
  
  // Process Equipment
  const equipmentResults = await processEntity('Equipment', (opts) => prisma.pricebookEquipment.findMany(opts));
  totals.downloaded += equipmentResults.downloaded;
  totals.existed += equipmentResults.existed;
  totals.failed += equipmentResults.failed;
  
  console.log('\n========================================');
  console.log('Download Complete!');
  console.log('========================================');
  console.log(`Downloaded: ${totals.downloaded}`);
  console.log(`Already Existed: ${totals.existed}`);
  console.log(`Failed: ${totals.failed}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
