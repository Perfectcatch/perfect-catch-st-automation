/**
 * 404 Not Found Handler
 * Catches requests to undefined routes
 */

import { NotFoundError } from '../lib/errors.js';

export function notFound(req, res, next) {
  throw new NotFoundError(`Route ${req.method} ${req.path}`);
}

export default notFound;
