/**
 * Generic Controller Factory
 * Creates standardized CRUD controllers for any ServiceTitan endpoint
 */

import { stRequest } from '../services/stClient.js';

/**
 * Extract default asset URL from assets array
 * @param {Array} assets - Array of asset objects
 * @returns {string|null} - The URL of the default image asset
 */
export function getDefaultAssetUrl(assets) {
  if (!assets || !Array.isArray(assets)) return null;

  // Find the default image asset
  const defaultAsset = assets.find(a => a.isDefault && a.type === 'Image');
  if (defaultAsset?.url) return defaultAsset.url;

  // Fallback to first image asset
  const firstImage = assets.find(a => a.type === 'Image');
  return firstImage?.url || null;
}

/**
 * Add defaultAssetUrl to pricebook items
 * Handles both 'assets' array (services, materials, equipment) and 'image' field (categories)
 * @param {Object|Array} data - Single item or array of items
 * @returns {Object|Array} - Items with defaultAssetUrl added
 */
export function addDefaultAssetUrl(data) {
  const addUrl = (item) => {
    // First try assets array (services, materials, equipment)
    let url = getDefaultAssetUrl(item.assets);

    // Fallback to direct image field (categories)
    if (!url && item.image) {
      url = item.image;
    }

    return {
      ...item,
      defaultAssetUrl: url,
    };
  };

  if (Array.isArray(data)) {
    return data.map(addUrl);
  }

  if (data && typeof data === 'object') {
    return addUrl(data);
  }

  return data;
}

/**
 * Create a list handler for paginated endpoints
 * @param {Function} endpointFn - Function that returns the endpoint URL
 */
export function createListHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const result = await stRequest(endpointFn(), {
        method: 'GET',
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a get-by-id handler
 * @param {Function} endpointFn - Function that takes an ID and returns the endpoint URL
 */
export function createGetHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await stRequest(endpointFn(id), {
        method: 'GET',
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a POST handler for creating resources
 * @param {Function} endpointFn - Function that returns the endpoint URL
 */
export function createCreateHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const result = await stRequest(endpointFn(), {
        method: 'POST',
        body: req.body,
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a PUT/PATCH handler for updating resources
 * @param {Function} endpointFn - Function that takes an ID and returns the endpoint URL
 * @param {string} method - HTTP method (PUT or PATCH)
 */
export function createUpdateHandler(endpointFn, method = 'PUT') {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await stRequest(endpointFn(id), {
        method,
        body: req.body,
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a DELETE handler
 * @param {Function} endpointFn - Function that takes an ID and returns the endpoint URL
 */
export function createDeleteHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const result = await stRequest(endpointFn(id), {
        method: 'DELETE',
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create an export handler (typically GET with continuation token)
 * @param {Function} endpointFn - Function that returns the export endpoint URL
 */
export function createExportHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const result = await stRequest(endpointFn(), {
        method: 'GET',
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Create a custom action handler (POST to a specific action endpoint)
 * @param {Function} endpointFn - Function that may take params and returns the endpoint URL
 */
export function createActionHandler(endpointFn) {
  return async (req, res, next) => {
    try {
      const { id } = req.params;
      const url = id ? endpointFn(id) : endpointFn();
      const result = await stRequest(url, {
        method: 'POST',
        body: req.body,
        query: req.query,
      });
      res.status(result.status).json(result.data);
    } catch (error) {
      next(error);
    }
  };
}

export default {
  createListHandler,
  createGetHandler,
  createCreateHandler,
  createUpdateHandler,
  createDeleteHandler,
  createExportHandler,
  createActionHandler,
};
