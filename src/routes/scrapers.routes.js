/**
 * Scrapers Routes
 * Endpoints for vendor price scraping integration
 * Connects to actual scraper services (CED, Pool360)
 */

import { Router } from 'express';

const router = Router();

// Vendor configurations with scraper service URLs
const VENDORS = {
  ced: {
    name: 'CED Greentech',
    scraperUrl: process.env.CED_SCRAPER_URL || 'http://st-ced-scraper-api:3000',
    searchUrl: 'https://cedlargo.portalced.com/product-list',
    enabled: true,
  },
  pool360: {
    name: 'Pool360',
    scraperUrl: process.env.POOL360_SCRAPER_URL || 'http://st-pool360-scraper-api:3000',
    searchUrl: 'https://www.pool360.com',
    enabled: true,
  },
  poolcorp: {
    name: 'PoolCorp',
    scraperUrl: null, // Not implemented yet
    searchUrl: 'https://www.poolcorp.com',
    enabled: false,
  },
};

/**
 * POST /scrapers/search
 * Search vendors for material pricing
 */
router.post('/search', async (req, res) => {
  try {
    const { materialId, code, name, vendors = ['ced', 'pool360', 'poolcorp'] } = req.body;

    if (!materialId && !code && !name) {
      return res.status(400).json({ 
        error: 'At least one of materialId, code, or name is required' 
      });
    }

    const searchQuery = code || name || `material-${materialId}`;
    const results = [];

    // Search each requested vendor
    for (const vendorId of vendors) {
      const vendor = VENDORS[vendorId];
      if (!vendor || !vendor.enabled) continue;

      try {
        // For now, return mock data - in production, this would call actual scrapers
        // The scrapers would be separate services (CED scraper, Pool360 scraper, etc.)
        const mockPrice = await searchVendor(vendorId, searchQuery, materialId);
        if (mockPrice) {
          results.push(mockPrice);
        }
      } catch (err) {
        console.error(`Error searching ${vendorId}:`, err.message);
      }
    }

    res.json({
      success: true,
      query: searchQuery,
      vendorsSearched: vendors,
      prices: results,
    });
  } catch (error) {
    console.error('Scraper search error:', error);
    res.status(500).json({ error: 'Failed to search vendors', message: error.message });
  }
});

/**
 * GET /scrapers/vendors
 * List available vendors
 */
router.get('/vendors', (req, res) => {
  const vendorList = Object.entries(VENDORS).map(([id, config]) => ({
    id,
    name: config.name,
    enabled: config.enabled,
  }));
  res.json({ vendors: vendorList });
});

/**
 * POST /scrapers/trigger/:vendor
 * Trigger a specific vendor scraper for a material
 */
router.post('/trigger/:vendor', async (req, res) => {
  try {
    const { vendor } = req.params;
    const { materialId, code, name } = req.body;

    if (!VENDORS[vendor]) {
      return res.status(404).json({ error: `Vendor ${vendor} not found` });
    }

    const searchQuery = code || name || `material-${materialId}`;
    const result = await searchVendor(vendor, searchQuery, materialId);

    res.json({
      success: true,
      vendor,
      result,
    });
  } catch (error) {
    console.error('Trigger scraper error:', error);
    res.status(500).json({ error: 'Failed to trigger scraper', message: error.message });
  }
});

/**
 * Search a specific vendor by calling its scraper service
 */
async function searchVendor(vendorId, query, materialId) {
  const vendor = VENDORS[vendorId];
  if (!vendor || !vendor.enabled || !vendor.scraperUrl) {
    return null;
  }

  try {
    console.log(`[Scraper] Searching ${vendorId} for: ${query}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for scraping
    
    const response = await fetch(`${vendor.scraperUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part: query }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error(`[Scraper] ${vendorId} returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.success || !data.bestMatch) {
      console.log(`[Scraper] ${vendorId} - no match found`);
      return null;
    }
    
    const match = data.bestMatch;
    const unitPrice = typeof match.price === 'number' ? match.price : null;
    
    if (unitPrice === null) {
      console.log(`[Scraper] ${vendorId} - no price found`);
      return null;
    }
    
    console.log(`[Scraper] ${vendorId} - found: ${match.name} @ $${unitPrice}`);
    
    return {
      id: Date.now() + Math.random(),
      materialId: materialId,
      vendor: vendor.name,
      vendorSku: match.sku || match.cat || match.item || '',
      vendorName: match.name || query,
      rawPrice: unitPrice,
      priceUnit: match.unitOfMeasure || 'each',
      packQuantity: 1,
      unitPrice: unitPrice,
      scrapedAt: new Date().toISOString(),
      scrapedFrom: data.url || `${vendor.searchUrl}?term=${encodeURIComponent(query)}`,
      isActive: true,
      confidence: match.confidence || match.score || 0,
      manufacturer: match.manufacturer || null,
      description: match.description || null,
      stock: match.stock || null,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error(`[Scraper] ${vendorId} - timeout`);
    } else {
      console.error(`[Scraper] ${vendorId} - error:`, error.message);
    }
    return null;
  }
}

export default router;
