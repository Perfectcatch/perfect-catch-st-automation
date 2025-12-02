/**
 * Generic Controller Factory
 * Creates standardized CRUD controllers for any ServiceTitan endpoint
 */

import { stRequest } from '../services/stClient.js';

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
