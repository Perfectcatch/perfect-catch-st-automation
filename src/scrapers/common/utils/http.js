/**
 * Shared HTTP client utilities
 */

const axios = require('axios');

const DEFAULT_TIMEOUT = 30000;

/**
 * Create a configured axios instance
 */
function createClient(options = {}) {
  return axios.create({
    timeout: options.timeout || DEFAULT_TIMEOUT,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
}

/**
 * Make a POST request to browserless /function endpoint
 */
async function browserlessFunction(browserlessUrl, token, code, context, timeout = 90000) {
  const url = `${browserlessUrl}/function?token=${encodeURIComponent(token)}`;
  
  const response = await axios.post(url, {
    code,
    context
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout
  });
  
  return response.data;
}

/**
 * Make a GET request with error handling
 */
async function get(url, options = {}) {
  try {
    const response = await axios.get(url, {
      timeout: options.timeout || DEFAULT_TIMEOUT,
      headers: options.headers || {}
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

/**
 * Make a POST request with error handling
 */
async function post(url, data, options = {}) {
  try {
    const response = await axios.post(url, data, {
      timeout: options.timeout || DEFAULT_TIMEOUT,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status
    };
  }
}

module.exports = {
  createClient,
  browserlessFunction,
  get,
  post,
  DEFAULT_TIMEOUT
};
