/**
 * Shared error handling utilities
 */

/**
 * Create a standardized error response
 */
function createErrorResponse(part, error, url = null) {
  return {
    success: false,
    part: part,
    name: "Error",
    price: null,
    stock: null,
    url: url,
    bestMatch: null,
    items: [],
    error: error.message || String(error)
  };
}

/**
 * Create a "not found" response
 */
function createNotFoundResponse(part, url) {
  return {
    success: true,
    part: part,
    name: "Not found",
    price: null,
    stock: null,
    url: url,
    bestMatch: null,
    items: []
  };
}

/**
 * Create a validation error response
 */
function createValidationError(message) {
  return {
    success: false,
    error: message
  };
}

/**
 * Wrap an async handler with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error middleware
 */
function errorMiddleware(err, req, res, next) {
  console.error(`[${new Date().toISOString()}] Error:`, err.message);
  
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
}

module.exports = {
  createErrorResponse,
  createNotFoundResponse,
  createValidationError,
  asyncHandler,
  errorMiddleware
};
