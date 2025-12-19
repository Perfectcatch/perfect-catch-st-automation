/**
 * @vendor-scrapers/common
 * Shared utilities for all vendor scrapers
 */

module.exports = {
  normalize: require('./normalize'),
  logger: require('./utils/logger'),
  http: require('./utils/http'),
  error: require('./utils/error'),
  scoring: require('./utils/scoring'),
  env: require('./config/env')
};
