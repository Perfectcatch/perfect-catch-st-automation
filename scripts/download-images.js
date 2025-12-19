#!/usr/bin/env node
/**
 * Download Images Script
 * Downloads all pricebook images from ServiceTitan and stores them locally
 * 
 * Usage: node scripts/download-images.js
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();
const TENANT_ID = process.env.SERVICE_TITAN_TENANT_ID || '3222348440';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || './public/images';

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (err) {
    // Already exists
  }
}

async function downloadImage(relativePath, accessToken) {
  if (!relativePath) return false;
  
  const localPath = path.join(IMAGE_STORAGE_PATH, relativePath);
  const localDir = path.dirname(localPath);
  
  // Check if already exists
  try {
    await fs.access(localPath);
    return true; // Already downloaded
  } catch {
    // Need to download
  }
  
  await ensureDir(localDir);
  
  // Try to download from ServiceTitan
  const urls = [
    `https://api.servicetitan.io/pricebook/v2/tenant/${TENANT_ID}/${relativePath}`,
    `https://go.servicetitan.com/${TENANT_ID}/${relativePath}`,
  ];
  
  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'ST-App-Key': process.env.SERVICE_TITAN_APP_KEY,
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(localPath, buffer);
        return true;
      }
    } catch (err) {
      continue;
    }
  }
  
  return false;
}

async function main() {
  console.log('Starting image download...');
  console.log(`Storage path: ${IMAGE_STORAGE_PATH}`);
  
  await ensureDir(IMAGE_STORAGE_PATH);
  
  const accessToken = await getAccessToken();
  console.log('Got access token');
  
  let downloaded = 0;
  let failed = 0;
  let skipped = 0;
  
  // Get all services with assets
  console.log('\nProcessing services...');
  const services = await prisma.pricebookService.findMany({
    where: {
      assets: { not: { equals: [] } }
    },
    select: { stId: true, code: true, assets: true }
  });
  
  for (const service of services) {
    const assets = service.assets;
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.type === 'Image' && asset.url) {
          const success = await downloadImage(asset.url, accessToken);
          if (success) {
            downloaded++;
            process.stdout.write('.');
          } else {
            failed++;
            process.stdout.write('x');
          }
        }
      }
    }
  }
  
  // Get all materials with assets
  console.log('\n\nProcessing materials...');
  const materials = await prisma.pricebookMaterial.findMany({
    where: {
      assets: { not: { equals: [] } }
    },
    select: { stId: true, code: true, assets: true }
  });
  
  for (const material of materials) {
    const assets = material.assets;
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.type === 'Image' && asset.url) {
          const success = await downloadImage(asset.url, accessToken);
          if (success) {
            downloaded++;
            process.stdout.write('.');
          } else {
            failed++;
            process.stdout.write('x');
          }
        }
      }
    }
  }
  
  // Get all equipment with assets
  console.log('\n\nProcessing equipment...');
  const equipment = await prisma.pricebookEquipment.findMany({
    where: {
      assets: { not: { equals: [] } }
    },
    select: { stId: true, code: true, assets: true }
  });
  
  for (const equip of equipment) {
    const assets = equip.assets;
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.type === 'Image' && asset.url) {
          const success = await downloadImage(asset.url, accessToken);
          if (success) {
            downloaded++;
            process.stdout.write('.');
          } else {
            failed++;
            process.stdout.write('x');
          }
        }
      }
    }
  }
  
  console.log('\n\n=== Summary ===');
  console.log(`Downloaded: ${downloaded}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total items: ${services.length + materials.length + equipment.length}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
