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
  addDefaultAssetUrl,
} from '../controllers/generic.controller.js';
import { stRequest } from '../services/stClient.js';
import { getAccessToken } from '../services/tokenManager.js';
import getPrismaClient from '../db/prisma.js';

const prisma = getPrismaClient();

const router = Router();

/**
 * Get all descendant category IDs for a given category (recursive)
 * This allows filtering by a parent category to include all items in child categories
 */
async function getAllDescendantCategoryIds(categoryId) {
  const catId = parseInt(categoryId);
  const allIds = [catId];
  
  // Recursively get all children
  const getChildren = async (parentIds) => {
    if (parentIds.length === 0) return;
    
    const children = await prisma.raw_st_pricebook_categories.findMany({
      where: { parent_id: { in: parentIds } },
      select: { st_id: true },
    });
    
    const childIds = children.map(c => Number(c.st_id));
    if (childIds.length > 0) {
      allIds.push(...childIds);
      await getChildren(childIds);
    }
  };
  
  await getChildren([catId]);
  return allIds;
}

/**
 * Create a pricebook list handler that adds defaultAssetUrl to each item
 */
function createPricebookListHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const result = await stRequest(endpointFn(), {
        method: 'GET',
        query: req.query,
      });

      // Add defaultAssetUrl to each item in the data array
      if (result.data?.data && Array.isArray(result.data.data)) {
        result.data.data = addDefaultAssetUrl(result.data.data);
      }

      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a pricebook get handler that adds defaultAssetUrl to the item
 */
function createPricebookGetHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await stRequest(endpointFn(id), {
        method: 'GET',
        query: req.query,
      });

      // Add defaultAssetUrl to the item
      if (result.data) {
        result.data = addDefaultAssetUrl(result.data);
      }

      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

// ═══════════════════════════════════════════════════════════════
// SERVICES (with defaultAssetUrl)
// ═══════════════════════════════════════════════════════════════
router.get('/services', createPricebookListHandler(stEndpoints.services.list));
router.get('/services/export', createExportHandler(stEndpoints.services.export));

// Database-backed services list with filtering
router.get('/db/services', async (req, res) => {
  try {
    const { 
      page = 1, 
      pageSize = 25, 
      search, 
      active, 
      categoryId,
      priceMin,
      priceMax,
      hoursMin,
      hoursMax,
      description,
      hasImages,
      hasMaterials,
      hasEquipment,
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);
    
    // Build where clause with all filters
    const where = {};
    const andConditions = [];
    
    // Status filter
    if (active !== undefined) {
      where.active = active === 'true';
    }
    
    // Search filter (code, name, description)
    if (search) {
      andConditions.push({
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { display_name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }
    
    // Description keyword filter
    if (description) {
      andConditions.push({
        description: { contains: description, mode: 'insensitive' },
      });
    }
    
    // Price range filter
    if (priceMin) {
      andConditions.push({
        price: { gte: parseFloat(priceMin) },
      });
    }
    if (priceMax) {
      andConditions.push({
        price: { lte: parseFloat(priceMax) },
      });
    }
    
    // Hours range filter
    if (hoursMin) {
      andConditions.push({
        hours: { gte: parseFloat(hoursMin) },
      });
    }
    if (hoursMax) {
      andConditions.push({
        hours: { lte: parseFloat(hoursMax) },
      });
    }
    
    // Has images filter (check if assets array has items)
    if (hasImages === 'true') {
      andConditions.push({
        NOT: { assets: { equals: [] } },
      });
    } else if (hasImages === 'false') {
      andConditions.push({
        OR: [
          { assets: { equals: [] } },
          { assets: { equals: null } },
        ],
      });
    }
    
    // Has materials filter
    if (hasMaterials === 'true') {
      andConditions.push({
        NOT: { service_materials: { equals: [] } },
      });
    } else if (hasMaterials === 'false') {
      andConditions.push({
        OR: [
          { service_materials: { equals: [] } },
          { service_materials: { equals: null } },
        ],
      });
    }
    
    // Has equipment filter
    if (hasEquipment === 'true') {
      andConditions.push({
        NOT: { service_equipment: { equals: [] } },
      });
    } else if (hasEquipment === 'false') {
      andConditions.push({
        OR: [
          { service_equipment: { equals: [] } },
          { service_equipment: { equals: null } },
        ],
      });
    }
    
    // Combine all conditions
    if (andConditions.length > 0) {
      where.AND = andConditions;
    }
    
    let services, total;
    
    // Category filter requires raw SQL since categories is JSONB array
    if (categoryId) {
      // Get all descendant category IDs (parent + all children recursively)
      const allCategoryIds = await getAllDescendantCategoryIds(categoryId);
      
      // Build category filter for all descendant IDs
      const categoryConditions = allCategoryIds.map(id => `categories @> '[{"id": ${id}}]'::jsonb`).join(' OR ');
      
      const activeFilter = active !== undefined ? (active === 'true' ? 'AND active = true' : 'AND active = false') : '';
      const searchFilter = search ? `AND (code ILIKE '%${search.replace(/'/g, "''")}%' OR display_name ILIKE '%${search.replace(/'/g, "''")}%' OR description ILIKE '%${search.replace(/'/g, "''")}%')` : '';
      
      const countResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM raw_st_pricebook_services 
        WHERE (${categoryConditions})
        ${activeFilter}
        ${searchFilter}
      `);
      total = Number(countResult[0]?.count || 0);
      
      services = await prisma.$queryRawUnsafe(`
        SELECT * FROM raw_st_pricebook_services 
        WHERE (${categoryConditions})
        ${activeFilter}
        ${searchFilter}
        ORDER BY display_name ASC
        LIMIT ${take} OFFSET ${skip}
      `);
    } else {
      [services, total] = await Promise.all([
        prisma.raw_st_pricebook_services.findMany({
          where,
          skip,
          take,
          orderBy: { display_name: 'asc' },
        }),
        prisma.raw_st_pricebook_services.count({ where }),
      ]);
    }
    
    const data = services.map(s => ({
      id: s.id,
      stId: s.st_id.toString(),
      code: s.code || '',
      name: s.display_name || '',
      description: s.description || '',
      price: parseFloat(s.price) || 0,
      memberPrice: parseFloat(s.member_price) || 0,
      addOnPrice: parseFloat(s.add_on_price) || 0,
      durationHours: parseFloat(s.hours) || 0,
      active: s.active ?? true,
      taxable: s.taxable ?? false,
      account: s.account || '',
      categories: s.categories || [],
      defaultImageUrl: s.assets?.length > 0 ? `/images/db/services/${s.st_id}` : null,
      hasMaterials: (s.service_materials?.length || 0) > 0,
      hasEquipment: (s.service_equipment?.length || 0) > 0,
    }));
    
    res.json({
      data,
      page: parseInt(page),
      pageSize: take,
      totalCount: total,
      hasMore: skip + take < total,
    });
  } catch (error) {
    console.error('Error fetching services from DB:', error);
    res.status(500).json({ error: 'Failed to fetch services', message: error.message });
  }
});

// Database-backed service detail with linked materials
router.get('/db/services/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Determine if id is a UUID or a ServiceTitan ID
    const isUuid = id.includes('-') && id.length === 36;
    const stId = !isUuid && !isNaN(parseInt(id)) ? BigInt(id) : null;
    
    // Fetch service from database
    let service;
    if (isUuid) {
      service = await prisma.raw_st_pricebook_services.findUnique({
        where: { id },
      });
    } else if (stId) {
      service = await prisma.raw_st_pricebook_services.findUnique({
        where: { st_id: stId },
      });
    }
    
    if (!service) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    // Parse service_materials JSON to get linked material IDs
    const serviceMaterials = service.service_materials || [];
    const materialStIds = serviceMaterials.map(m => m.skuId || m.id).filter(Boolean);
    
    // Fetch linked materials from database
    let materials = [];
    if (materialStIds.length > 0) {
      const dbMaterials = await prisma.raw_st_pricebook_materials.findMany({
        where: {
          st_id: { in: materialStIds.map(id => BigInt(id)) },
        },
      });
      
      // Map materials with quantity from service_materials
      materials = serviceMaterials.map(sm => {
        const dbMat = dbMaterials.find(m => m.st_id === BigInt(sm.skuId || sm.id));
        if (!dbMat) return null;
        
        // Get vendor info from primary_vendor
        const primaryVendor = dbMat.primary_vendor || {};
        
        // Get image URL from assets
        const assets = dbMat.assets || [];
        const imageAsset = assets.find(a => a.type === 'Image' || a.alias);
        const imageUrl = imageAsset?.url || null;
        
        return {
          id: dbMat.id,
          materialId: dbMat.st_id.toString(),
          code: dbMat.code || '',
          name: dbMat.display_name || '',
          description: dbMat.description || '',
          quantity: sm.quantity || 1,
          unitCost: parseFloat(dbMat.cost) || 0,
          vendorName: primaryVendor.name || 'Default Replenishment Vendor',
          vendorId: primaryVendor.id?.toString() || null,
          imageUrl: imageUrl ? `/images/db/materials/${dbMat.st_id}` : null,
        };
      }).filter(Boolean);
    }
    
    // Parse service_equipment JSON
    const serviceEquipment = service.service_equipment || [];
    const equipmentStIds = serviceEquipment.map(e => e.skuId || e.id).filter(Boolean);
    
    // Fetch linked equipment from database
    let equipment = [];
    if (equipmentStIds.length > 0) {
      const dbEquipment = await prisma.raw_st_pricebook_equipment.findMany({
        where: {
          st_id: { in: equipmentStIds.map(id => BigInt(id)) },
        },
      });
      
      equipment = serviceEquipment.map(se => {
        const dbEquip = dbEquipment.find(e => e.st_id === BigInt(se.skuId || se.id));
        if (!dbEquip) return null;
        
        const primaryVendor = dbEquip.primary_vendor || {};
        const assets = dbEquip.assets || [];
        const imageAsset = assets.find(a => a.type === 'Image' || a.alias);
        const imageUrl = imageAsset?.url || null;
        
        return {
          id: dbEquip.id,
          equipmentId: dbEquip.st_id.toString(),
          code: dbEquip.code || '',
          name: dbEquip.display_name || '',
          description: dbEquip.description || '',
          quantity: se.quantity || 1,
          unitCost: parseFloat(dbEquip.price) || 0,
          vendorName: primaryVendor.name || 'Default Replenishment Vendor',
          vendorId: primaryVendor.id?.toString() || null,
          imageUrl: imageUrl ? `/images/db/equipment/${dbEquip.st_id}` : null,
        };
      }).filter(Boolean);
    }
    
    // Parse categories
    const categories = (service.categories || []).map(cat => ({
      id: cat.id?.toString() || '',
      path: cat.name || '',
      name: cat.name?.split(' > ').pop() || '',
    }));
    
    // Build response
    const response = {
      id: service.id,
      stId: service.st_id.toString(),
      code: service.code || '',
      name: service.display_name || '',
      displayName: service.display_name || '',
      description: service.description || '',
      warranty: service.warranty?.description || '',
      price: parseFloat(service.price) || 0,
      memberPrice: parseFloat(service.member_price) || 0,
      addOnPrice: parseFloat(service.add_on_price) || 0,
      memberAddOnPrice: parseFloat(service.member_price) || 0,
      durationHours: parseFloat(service.hours) || 0,
      active: service.active ?? true,
      taxable: service.taxable ?? false,
      account: service.account || '',
      categories,
      materials,
      equipment,
      upgrades: (service.upgrades || []).map(u => u.name || u),
      recommendations: (service.recommendations || []).map(r => r.name || r),
      defaultImageUrl: service.assets?.[0]?.url ? `/images/db/services/${service.st_id}` : null,
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching service from DB:', error);
    res.status(500).json({ error: 'Failed to fetch service', message: error.message });
  }
});

router.get('/services/:id', createPricebookGetHandler(stEndpoints.services.get));
router.post('/services', createCreateHandler(stEndpoints.services.create));
router.patch('/services/:id', createUpdateHandler(stEndpoints.services.update, 'PATCH'));
router.delete('/services/:id', createDeleteHandler(stEndpoints.services.delete));

// ═══════════════════════════════════════════════════════════════
// MATERIALS (with defaultAssetUrl)
// ═══════════════════════════════════════════════════════════════

// Database-backed materials list with filtering
router.get('/db/materials', async (req, res) => {
  try {
    const { 
      page = '1', 
      pageSize = '25', 
      search, 
      categoryId,
      active,
      costMin,
      costMax,
      priceMin,
      priceMax,
      hasImages,
      vendor,
    } = req.query;
    
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);
    
    // Build where clause
    const where = {};
    
    // Active filter
    if (active !== undefined) {
      where.active = active === 'true';
    }
    
    // Search filter
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { display_name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    // Cost filter
    if (costMin) {
      where.cost = { ...where.cost, gte: parseFloat(costMin) };
    }
    if (costMax) {
      where.cost = { ...where.cost, lte: parseFloat(costMax) };
    }
    
    // Price filter
    if (priceMin) {
      where.price = { ...where.price, gte: parseFloat(priceMin) };
    }
    if (priceMax) {
      where.price = { ...where.price, lte: parseFloat(priceMax) };
    }
    
    // Has images filter
    if (hasImages !== undefined) {
      if (hasImages === 'true') {
        where.assets = { not: { equals: [] } };
      } else {
        where.OR = [
          { assets: { equals: [] } },
          { assets: { equals: null } },
        ];
      }
    }
    
    let materials, totalCount;
    
    // Category filter requires raw SQL since categories is JSONB array of IDs
    if (categoryId) {
      // Get all descendant category IDs (parent + all children recursively)
      const allCategoryIds = await getAllDescendantCategoryIds(categoryId);
      
      // Build category filter for all descendant IDs
      // Materials categories is array of integers [6144], use @> 'value'::jsonb
      const categoryConditions = allCategoryIds.map(id => `categories @> '${id}'::jsonb`).join(' OR ');
      
      const activeFilter = active !== undefined ? (active === 'true' ? 'AND active = true' : 'AND active = false') : '';
      const searchFilter = search ? `AND (code ILIKE '%${search.replace(/'/g, "''")}%' OR display_name ILIKE '%${search.replace(/'/g, "''")}%' OR description ILIKE '%${search.replace(/'/g, "''")}%')` : '';
      
      const countResult = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM raw_st_pricebook_materials 
        WHERE (${categoryConditions})
        ${activeFilter}
        ${searchFilter}
      `);
      totalCount = Number(countResult[0]?.count || 0);
      
      materials = await prisma.$queryRawUnsafe(`
        SELECT * FROM raw_st_pricebook_materials 
        WHERE (${categoryConditions})
        ${activeFilter}
        ${searchFilter}
        ORDER BY display_name ASC
        LIMIT ${take} OFFSET ${skip}
      `);
    } else {
      // Fetch materials with count using Prisma
      [materials, totalCount] = await Promise.all([
        prisma.raw_st_pricebook_materials.findMany({
          where,
          skip,
          take,
          orderBy: { display_name: 'asc' },
        }),
        prisma.raw_st_pricebook_materials.count({ where }),
      ]);
    }
    
    // Transform to expected format
    const data = materials.map(mat => ({
      id: mat.id,
      stId: mat.st_id.toString(),
      code: mat.code || '',
      name: mat.display_name || '',
      displayName: mat.display_name || '',
      description: mat.description || '',
      cost: parseFloat(mat.cost) || 0,
      price: parseFloat(mat.price) || 0,
      memberPrice: parseFloat(mat.member_price) || 0,
      active: mat.active ?? true,
      taxable: mat.taxable ?? true,
      primaryVendor: mat.primary_vendor || null,
      assets: mat.assets || [],
      defaultAssetUrl: mat.assets?.[0]?.url ? `/images/db/materials/${mat.st_id}` : null,
    }));
    
    res.json({
      data,
      totalCount,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      hasMore: skip + take < totalCount,
    });
  } catch (error) {
    console.error('Error fetching materials from DB:', error);
    res.status(500).json({ error: 'Failed to fetch materials', message: error.message });
  }
});

router.get('/materials', createPricebookListHandler(stEndpoints.materials.list));
router.get('/materials/export', createExportHandler(stEndpoints.materials.export));
router.get('/materials/:id', createPricebookGetHandler(stEndpoints.materials.get));
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
// EQUIPMENT (with defaultAssetUrl)
// ═══════════════════════════════════════════════════════════════
router.get('/equipment', createPricebookListHandler(stEndpoints.equipment.list));
router.get('/equipment/:id', createPricebookGetHandler(stEndpoints.equipment.get));
router.post('/equipment', createCreateHandler(stEndpoints.equipment.create));
router.patch('/equipment/:id', createUpdateHandler(stEndpoints.equipment.update, 'PATCH'));
router.delete('/equipment/:id', createDeleteHandler(stEndpoints.equipment.delete));

// ═══════════════════════════════════════════════════════════════
// CATEGORIES (with defaultAssetUrl)
// ═══════════════════════════════════════════════════════════════
router.get('/categories', createPricebookListHandler(stEndpoints.categories.list));
router.get('/categories/:id', createPricebookGetHandler(stEndpoints.categories.get));
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
