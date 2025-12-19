/**
 * Image Downloader Service
 * Downloads ServiceTitan pricebook images and stores them locally
 */

import fs from 'fs/promises';
import path from 'path';
import { getAccessToken } from './tokenManager.js';

const TENANT_ID = process.env.SERVICE_TITAN_TENANT_ID || '3222348440';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || '/app/public/images';

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(IMAGE_STORAGE_PATH, { recursive: true });
  } catch (err) {
    // Directory already exists
  }
}

/**
 * Download an image from ServiceTitan and store it locally
 * @param {string} relativePath - The relative path from ST (e.g., "Images/Service/xxx.jpg")
 * @returns {Promise<string|null>} - The local path to the stored image, or null if failed
 */
export async function downloadImage(relativePath) {
  if (!relativePath) return null;
  
  await ensureStorageDir();
  
  // Create local file path
  const localPath = path.join(IMAGE_STORAGE_PATH, relativePath);
  const localDir = path.dirname(localPath);
  
  // Check if already downloaded
  try {
    await fs.access(localPath);
    return relativePath; // Already exists
  } catch {
    // File doesn't exist, need to download
  }
  
  // Ensure subdirectory exists
  await fs.mkdir(localDir, { recursive: true });
  
  try {
    const accessToken = await getAccessToken();
    
    // Try different possible URLs
    const possibleUrls = [
      `https://api.servicetitan.io/pricebook/v2/tenant/${TENANT_ID}/${relativePath}`,
      `https://go.servicetitan.com/${TENANT_ID}/${relativePath}`,
    ];
    
    for (const url of possibleUrls) {
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
          console.log(`Downloaded image: ${relativePath}`);
          return relativePath;
        }
      } catch (err) {
        continue;
      }
    }
    
    console.warn(`Failed to download image: ${relativePath}`);
    return null;
  } catch (error) {
    console.error(`Error downloading image ${relativePath}:`, error.message);
    return null;
  }
}

/**
 * Process assets array and download all images
 * @param {Array} assets - Array of asset objects from ServiceTitan
 * @returns {Promise<Array>} - Updated assets array with local paths
 */
export async function processAssets(assets) {
  if (!assets || !Array.isArray(assets)) return [];
  
  const processedAssets = [];
  
  for (const asset of assets) {
    if (asset.type === 'Image' && asset.url) {
      const localPath = await downloadImage(asset.url);
      processedAssets.push({
        ...asset,
        localUrl: localPath ? `/images/local/${localPath}` : null,
        originalUrl: asset.url,
      });
    } else {
      processedAssets.push(asset);
    }
  }
  
  return processedAssets;
}

/**
 * Get the default image URL from assets
 * @param {Array} assets - Array of asset objects
 * @returns {string|null} - The local URL of the default image
 */
export function getDefaultImageUrl(assets) {
  if (!assets || !Array.isArray(assets)) return null;
  
  const defaultAsset = assets.find(a => a.isDefault && a.type === 'Image');
  if (defaultAsset) {
    return defaultAsset.localUrl || defaultAsset.url;
  }
  
  const firstImage = assets.find(a => a.type === 'Image');
  return firstImage?.localUrl || firstImage?.url || null;
}

export default {
  downloadImage,
  processAssets,
  getDefaultImageUrl,
};
