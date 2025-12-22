/**
 * Image Proxy Routes
 * Proxies ServiceTitan pricebook images through our server
 * This allows images to be served from perfectcatchai.com domain
 */

import { Router } from 'express';
import { getAccessToken } from '../services/tokenManager.js';
import fs from 'fs/promises';
import path from 'path';
import pg from 'pg';
import config from '../config/index.js';

const router = Router();

// ServiceTitan tenant ID from environment
const TENANT_ID = process.env.SERVICE_TITAN_TENANT_ID || '3222348440';
const IMAGE_STORAGE_PATH = process.env.IMAGE_STORAGE_PATH || '/app/public/images';

// Database pool for serving images
const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 5,
});

// Cache for images (in production, use Redis or file system)
const imageCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

/**
 * GET /images/st/:path(*)
 * Proxy ServiceTitan images
 * Example: /images/st/Images/Service/96653cb4-3ade-4fdb-a7a0-a6efc8a29c99.jpg
 */
router.get('/st/*', async (req, res) => {
  try {
    // Get the image path from the URL (everything after /st/)
    const imagePath = req.params[0];
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Check cache first
    const cacheKey = imagePath;
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
      res.set('X-Cache', 'HIT');
      return res.send(cached.data);
    }

    // Get ServiceTitan access token
    const accessToken = await getAccessToken();
    
    // Try multiple possible ServiceTitan image URLs
    const possibleUrls = [
      `https://api.servicetitan.io/pricebook/v2/tenant/${TENANT_ID}/${imagePath}`,
      `https://api-integration.servicetitan.io/pricebook/v2/tenant/${TENANT_ID}/${imagePath}`,
      `https://go.servicetitan.com/${TENANT_ID}/${imagePath}`,
    ];

    let imageBuffer = null;
    let contentType = 'image/jpeg';
    let lastError = null;

    for (const url of possibleUrls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'ST-App-Key': process.env.SERVICE_TITAN_APP_KEY,
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          imageBuffer = Buffer.from(await response.arrayBuffer());
          contentType = response.headers.get('content-type') || 'image/jpeg';
          break;
        }
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    if (!imageBuffer) {
      console.error(`Failed to fetch image: ${imagePath}`, lastError?.message);
      return res.status(404).json({ 
        error: 'Image not found',
        path: imagePath,
      });
    }
    
    // Cache the image
    imageCache.set(cacheKey, {
      data: imageBuffer,
      contentType,
      timestamp: Date.now(),
    });

    // Limit cache size (simple LRU-like behavior)
    if (imageCache.size > 1000) {
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }

    // Send the image
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400'); // 24 hours
    res.set('X-Cache', 'MISS');
    res.send(imageBuffer);

  } catch (error) {
    console.error('Image proxy error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch image',
      message: error.message,
    });
  }
});

/**
 * GET /images/local/*
 * Serve locally stored images (downloaded during sync)
 * Example: /images/local/Images/Service/96653cb4-3ade-4fdb-a7a0-a6efc8a29c99.jpg
 */
router.get('/local/*', async (req, res) => {
  try {
    const imagePath = req.params[0];
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path is required' });
    }

    // Prevent directory traversal
    const safePath = path.normalize(imagePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(IMAGE_STORAGE_PATH, safePath);
    
    // Verify the path is within the storage directory
    if (!fullPath.startsWith(IMAGE_STORAGE_PATH)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      const data = await fs.readFile(fullPath);
      
      // Determine content type from extension
      const ext = path.extname(fullPath).toLowerCase();
      const contentTypes = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
      };
      
      res.set('Content-Type', contentTypes[ext] || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=604800'); // 7 days
      res.send(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Image not found', path: imagePath });
      }
      throw err;
    }
  } catch (error) {
    console.error('Error serving local image:', error.message);
    res.status(500).json({ error: 'Failed to serve image' });
  }
});

/**
 * GET /images/db/:type/:id
 * Serve images stored in PostgreSQL
 * Example: /images/db/services/12345
 *          /images/db/materials/67890
 *          /images/db/equipment/11111
 *          /images/db/categories/22222
 */
router.get('/db/:type/:id', async (req, res) => {
  try {
    const { type, id } = req.params;

    // Map type to table name
    const tableMap = {
      services: 'raw_st_pricebook_services',
      materials: 'raw_st_pricebook_materials',
      equipment: 'raw_st_pricebook_equipment',
      categories: 'raw_st_pricebook_categories',
    };

    const tableName = tableMap[type];
    if (!tableName) {
      return res.status(400).json({ error: 'Invalid type. Use: services, materials, equipment, categories' });
    }

    // Check memory cache first
    const cacheKey = `db:${type}:${id}`;
    const cached = imageCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      res.set('Content-Type', cached.contentType);
      res.set('Cache-Control', 'public, max-age=86400');
      res.set('X-Cache', 'HIT');
      res.set('X-Source', 'database');
      return res.send(cached.data);
    }

    // Query database for image
    const result = await pool.query(
      `SELECT image_data, image_content_type FROM ${tableName} WHERE st_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found', type, id });
    }

    const { image_data, image_content_type } = result.rows[0];

    if (!image_data) {
      return res.status(404).json({ error: 'Image not downloaded yet', type, id });
    }

    // Default to image/jpeg if content type is missing or generic
    const contentType = (image_content_type && image_content_type !== 'application/octet-stream') 
      ? image_content_type 
      : 'image/jpeg';

    // Cache the image
    imageCache.set(cacheKey, {
      data: image_data,
      contentType,
      timestamp: Date.now(),
    });

    // Limit cache size
    if (imageCache.size > 500) {
      const firstKey = imageCache.keys().next().value;
      imageCache.delete(firstKey);
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'public, max-age=86400');
    res.set('X-Cache', 'MISS');
    res.set('X-Source', 'database');
    res.send(image_data);

  } catch (error) {
    console.error('Database image error:', error.message);
    res.status(500).json({ error: 'Failed to fetch image', message: error.message });
  }
});

/**
 * GET /images/info
 * Get cache statistics
 */
router.get('/info', async (req, res) => {
  // Get image stats from database
  let dbStats = {};
  try {
    const statsResult = await pool.query(`
      SELECT
        'services' as type,
        COUNT(*) FILTER (WHERE image_data IS NOT NULL) as with_images,
        COUNT(*) as total
      FROM raw_st_pricebook_services
      UNION ALL
      SELECT 'materials', COUNT(*) FILTER (WHERE image_data IS NOT NULL), COUNT(*)
      FROM raw_st_pricebook_materials
      UNION ALL
      SELECT 'equipment', COUNT(*) FILTER (WHERE image_data IS NOT NULL), COUNT(*)
      FROM raw_st_pricebook_equipment
      UNION ALL
      SELECT 'categories', COUNT(*) FILTER (WHERE image_data IS NOT NULL), COUNT(*)
      FROM raw_st_pricebook_categories
    `);
    dbStats = statsResult.rows;
  } catch (err) {
    dbStats = { error: err.message };
  }

  res.json({
    cacheSize: imageCache.size,
    cacheTTL: CACHE_TTL,
    tenantId: TENANT_ID,
    storagePath: IMAGE_STORAGE_PATH,
    databaseImages: dbStats,
  });
});

/**
 * DELETE /images/cache
 * Clear the image cache
 */
router.delete('/cache', (req, res) => {
  const size = imageCache.size;
  imageCache.clear();
  res.json({ 
    message: 'Cache cleared',
    clearedItems: size,
  });
});

export default router;
