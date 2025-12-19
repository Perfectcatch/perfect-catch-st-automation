/**
 * Pricebook Routes
 * ServiceTitan Pricebook API endpoints
 * Includes: Services, Materials, Equipment, Categories, Discounts, etc.
 */

import { Router } from 'express';
import { stEndpoints } from '../lib/stEndpoints.js';
import {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
  createExportHandler,
  createActionHandler,
} from '../controllers/generic.controller.js';
import { getAccessToken } from '../services/tokenManager.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════
// SERVICES
// ═══════════════════════════════════════════════════════════════
router.get('/services', createListHandler(stEndpoints.services.list));
router.get('/services/export', createExportHandler(stEndpoints.services.export));
router.get('/services/:id', createGetHandler(stEndpoints.services.get));
router.post('/services', createCreateHandler(stEndpoints.services.create));
router.patch('/services/:id', createUpdateHandler(stEndpoints.services.update, 'PATCH'));
router.delete('/services/:id', createDeleteHandler(stEndpoints.services.delete));

// ═══════════════════════════════════════════════════════════════
// MATERIALS
// ═══════════════════════════════════════════════════════════════
router.get('/materials', createListHandler(stEndpoints.materials.list));
router.get('/materials/export', createExportHandler(stEndpoints.materials.export));
router.get('/materials/:id', createGetHandler(stEndpoints.materials.get));
router.post('/materials', createCreateHandler(stEndpoints.materials.create));
router.patch('/materials/:id', createUpdateHandler(stEndpoints.materials.update, 'PATCH'));
router.delete('/materials/:id', createDeleteHandler(stEndpoints.materials.delete));

// ═══════════════════════════════════════════════════════════════
// MATERIALS MARKUP
// ═══════════════════════════════════════════════════════════════
router.get('/materials-markup', createListHandler(stEndpoints.materialsMarkup.list));
router.get('/materials-markup/:id', createGetHandler(stEndpoints.materialsMarkup.get));
router.post('/materials-markup', createCreateHandler(stEndpoints.materialsMarkup.create));
router.patch('/materials-markup/:id', createUpdateHandler(stEndpoints.materialsMarkup.update, 'PATCH'));
router.delete('/materials-markup/:id', createDeleteHandler(stEndpoints.materialsMarkup.delete));

// ═══════════════════════════════════════════════════════════════
// EQUIPMENT
// ═══════════════════════════════════════════════════════════════
router.get('/equipment', createListHandler(stEndpoints.equipment.list));
router.get('/equipment/:id', createGetHandler(stEndpoints.equipment.get));
router.post('/equipment', createCreateHandler(stEndpoints.equipment.create));
router.patch('/equipment/:id', createUpdateHandler(stEndpoints.equipment.update, 'PATCH'));
router.delete('/equipment/:id', createDeleteHandler(stEndpoints.equipment.delete));

// ═══════════════════════════════════════════════════════════════
// CATEGORIES
// ═══════════════════════════════════════════════════════════════
router.get('/categories', createListHandler(stEndpoints.categories.list));
router.get('/categories/:id', createGetHandler(stEndpoints.categories.get));
router.post('/categories', createCreateHandler(stEndpoints.categories.create));
router.patch('/categories/:id', createUpdateHandler(stEndpoints.categories.update, 'PATCH'));
router.delete('/categories/:id', createDeleteHandler(stEndpoints.categories.delete));

// ═══════════════════════════════════════════════════════════════
// DISCOUNTS AND FEES
// ═══════════════════════════════════════════════════════════════
router.get('/discounts-and-fees', createListHandler(stEndpoints.discountAndFees.list));
router.get('/discounts-and-fees/:id', createGetHandler(stEndpoints.discountAndFees.get));
router.post('/discounts-and-fees', createCreateHandler(stEndpoints.discountAndFees.create));
router.patch('/discounts-and-fees/:id', createUpdateHandler(stEndpoints.discountAndFees.update, 'PATCH'));
router.delete('/discounts-and-fees/:id', createDeleteHandler(stEndpoints.discountAndFees.delete));

// ═══════════════════════════════════════════════════════════════
// CLIENT SPECIFIC PRICING
// ═══════════════════════════════════════════════════════════════
router.get('/client-specific-pricing', createListHandler(stEndpoints.clientSpecificPricing.list));
router.patch('/client-specific-pricing/:id', createUpdateHandler(stEndpoints.clientSpecificPricing.update, 'PATCH'));

// ═══════════════════════════════════════════════════════════════
// BULK OPERATIONS
// ═══════════════════════════════════════════════════════════════
router.post('/bulk/import', createActionHandler(stEndpoints.pricebookBulk.import));
router.get('/bulk/export', createExportHandler(stEndpoints.pricebookBulk.export));

// ═══════════════════════════════════════════════════════════════
// IMAGES
// ═══════════════════════════════════════════════════════════════
router.post('/images', createActionHandler(stEndpoints.images.upload));

// GET /pricebook/images?path=Images/Service/xxx.jpg
// Proxies the ServiceTitan image endpoint and follows the 302 redirect
router.get('/images', async (req, res) => {
  try {
    const { path: imagePath } = req.query;
    
    if (!imagePath) {
      return res.status(400).json({ error: 'path query parameter is required' });
    }
    
    const tenantId = process.env.SERVICE_TITAN_TENANT_ID;
    const appKey = process.env.SERVICE_TITAN_APP_KEY;
    const accessToken = await getAccessToken();
    
    // Call the ST images endpoint - it returns a 302 redirect
    const url = `https://api.servicetitan.io/pricebook/v2/tenant/${tenantId}/images?path=${encodeURIComponent(imagePath)}`;
    
    // First request to get the redirect URL
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'ST-App-Key': appKey,
      },
      redirect: 'manual', // Don't follow redirect automatically
    });
    
    // Determine content type from file extension
    const ext = imagePath.split('.').pop()?.toLowerCase();
    const contentTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    const defaultContentType = contentTypes[ext] || 'image/jpeg';
    
    // Handle 302 redirect
    if (response.status === 302) {
      const redirectUrl = response.headers.get('location');
      if (redirectUrl) {
        // Fetch the actual image from the redirect URL
        const imageResponse = await fetch(redirectUrl);
        if (imageResponse.ok) {
          const buffer = Buffer.from(await imageResponse.arrayBuffer());
          const contentType = imageResponse.headers.get('content-type') || defaultContentType;
          res.set('Content-Type', contentType);
          res.set('Cache-Control', 'public, max-age=86400');
          return res.send(buffer);
        }
      }
    }
    
    // If direct response with image data
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', defaultContentType);
      res.set('Cache-Control', 'public, max-age=86400');
      return res.send(buffer);
    }
    
    res.status(404).json({ error: 'Image not found', path: imagePath, status: response.status });
  } catch (error) {
    console.error('Image fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch image', message: error.message });
  }
});

export default router;
