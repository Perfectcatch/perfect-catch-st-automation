/**
 * Environment configuration utilities
 */

/**
 * Get required environment variable or throw
 * @param {string} name - Environment variable name
 * @returns {string} Value
 */
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get optional environment variable with default
 * @param {string} name - Environment variable name
 * @param {string} defaultValue - Default value
 * @returns {string} Value
 */
function optional(name, defaultValue = '') {
  return process.env[name] || defaultValue;
}

/**
 * Get integer environment variable
 * @param {string} name - Environment variable name
 * @param {number} defaultValue - Default value
 * @returns {number} Value
 */
function integer(name, defaultValue = 0) {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Get boolean environment variable
 * @param {string} name - Environment variable name
 * @param {boolean} defaultValue - Default value
 * @returns {boolean} Value
 */
function boolean(name, defaultValue = false) {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Load common scraper configuration
 */
function loadScraperConfig() {
  return {
    port: integer('PORT', 3000),
    logLevel: optional('LOG_LEVEL', 'info'),
    nodeEnv: optional('NODE_ENV', 'development')
  };
}

/**
 * Load browserless configuration
 */
function loadBrowserlessConfig() {
  return {
    url: optional('BROWSERLESS_URL', 'http://localhost:3000'),
    token: optional('BROWSERLESS_TOKEN', 'super_random_token'),
    timeout: integer('BROWSERLESS_TIMEOUT', 90000)
  };
}

module.exports = {
  required,
  optional,
  integer,
  boolean,
  loadScraperConfig,
  loadBrowserlessConfig
};
