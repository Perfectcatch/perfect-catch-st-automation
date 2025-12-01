/**
 * Async Handler Utility
 * Wraps async route handlers to properly catch and forward errors
 */

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default asyncHandler;
