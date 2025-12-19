/**
 * Unified normalization for all vendor scrapers
 * 
 * All scrapers must return this exact response format:
 * {
 *   success: true,
 *   part: "search term",
 *   name: "Best match product name",
 *   price: 99.99,
 *   stock: "In Stock" | number | null,
 *   url: "https://...",
 *   bestMatch: { ... },
 *   items: [ ... ]
 * }
 */

/**
 * Normalize a single product item
 * @param {Object} item - Raw product item from vendor
 * @returns {Object} Normalized item
 */
function normalizeItem(item) {
  if (!item) {
    return {
      name: null,
      price: null,
      stock: null,
      sku: null,
      mfgNumber: null,
      manufacturer: null,
      description: null,
      unitOfMeasure: "each",
      image: null,
      url: null
    };
  }

  return {
    name: item.name || null,
    price: typeof item.price === 'number' ? item.price : null,
    stock: item.stock ?? null,
    sku: item.sku || item.item || null,
    mfgNumber: item.mfgNumber || item.cat || null,
    manufacturer: item.manufacturer || null,
    description: item.description || null,
    unitOfMeasure: item.unitOfMeasure || "each",
    image: item.image || null,
    url: item.url || null,
    // Optional extended fields
    ...(item.upc && { upc: item.upc }),
    ...(item.rating && { rating: item.rating }),
    ...(item.reviewCount && { reviewCount: item.reviewCount }),
    ...(item.fulfillment && { fulfillment: item.fulfillment }),
    ...(item.score !== undefined && { score: item.score })
  };
}

/**
 * Normalize a full search response
 * @param {string} part - Original search term
 * @param {Array} items - Array of product items
 * @param {string} url - Search URL
 * @returns {Object} Normalized response
 */
function normalizeResponse(part, items, url) {
  const normalizedItems = (items || []).map(normalizeItem);
  const bestMatch = normalizedItems.length > 0 ? normalizedItems[0] : null;

  return {
    success: true,
    part: part,
    name: bestMatch?.name || "Not found",
    price: bestMatch?.price ?? null,
    stock: bestMatch?.stock ?? null,
    url: url,
    bestMatch: bestMatch,
    items: normalizedItems
  };
}

/**
 * Create a successful response with items
 * @param {string} part - Search term
 * @param {Array} items - Product items (already normalized)
 * @param {string} url - Search URL
 * @returns {Object} Response object
 */
function createSuccessResponse(part, items, url) {
  const bestMatch = items.length > 0 ? items[0] : null;

  return {
    success: true,
    part: part,
    name: bestMatch?.name || "Not found",
    price: bestMatch?.price ?? null,
    stock: bestMatch?.stock ?? null,
    url: url,
    bestMatch: bestMatch,
    items: items
  };
}

module.exports = {
  normalizeItem,
  normalizeResponse,
  createSuccessResponse
};
